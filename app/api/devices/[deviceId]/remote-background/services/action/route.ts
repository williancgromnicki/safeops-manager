import { NextRequest, NextResponse } from 'next/server';

import { resolveCurrentCustomer } from '@/lib/data/get-current-customer';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type ServicesActionRouteContext = {
  params: Promise<{
    deviceId: string;
  }>;
};

type DeviceServicesActionRow = {
  id: string;
  customer_id: string;
  hostname: string;
  tactical_agent_id: string | null;
};

type ServiceAction = 'start' | 'stop' | 'restart';

const allowedOperationalRoles = new Set(['admin', 'client']);

function cleanString(value?: string | null): string | null {
  const cleaned = value?.trim();

  return cleaned ? cleaned : null;
}

function getOperationsApiUrl(): string {
  const apiUrl = process.env.TRMM_API_URL?.trim();

  if (!apiUrl) {
    throw new Error('API operacional não configurada.');
  }

  return apiUrl.replace(/\/+$/, '');
}

function getOperationsApiKey(): string {
  const apiKey = process.env.TRMM_API_KEY?.trim();

  if (!apiKey) {
    throw new Error('Chave da API operacional não configurada.');
  }

  return apiKey;
}

function validateServiceName(serviceName: string): boolean {
  /*
    Nome de serviço Windows normalmente aceita letras, números,
    espaço, ponto, underscore, hífen, parênteses e alguns caracteres comuns.
    Bloqueamos caracteres usados para encadear comandos: &, |, >, <, ;, `.
  */
  if (!serviceName.trim()) return false;
  if (serviceName.length > 180) return false;

  return !/[&|<>;`]/.test(serviceName);
}

function validateAction(action: string): action is ServiceAction {
  return action === 'start' || action === 'stop' || action === 'restart';
}

function buildServiceCommand(action: ServiceAction, serviceName: string): string {
  const escapedServiceName = serviceName.replace(/"/g, '\\"');

  if (action === 'start') {
    return `sc.exe start "${escapedServiceName}"`;
  }

  if (action === 'stop') {
    return `sc.exe stop "${escapedServiceName}"`;
  }

  return [
    `sc.exe stop "${escapedServiceName}"`,
    'timeout /t 3 /nobreak > nul',
    `sc.exe start "${escapedServiceName}"`,
  ].join(' && ');
}

function getActionLabel(action: ServiceAction): string {
  if (action === 'start') return 'Iniciar serviço';
  if (action === 'stop') return 'Parar serviço';

  return 'Reiniciar serviço';
}

function classifyServiceActionOutput(output: string): 'success' | 'warning' | 'failed' {
  const normalized = output.toLowerCase();

  if (
    normalized.includes('start_pending') ||
    normalized.includes('stop_pending') ||
    normalized.includes('running') ||
    normalized.includes('stopped') ||
    normalized.includes('success') ||
    normalized.includes('controlservice successful') ||
    normalized.includes('startservice successful')
  ) {
    return 'success';
  }

  if (
    normalized.includes('already running') ||
    normalized.includes('service has not been started') ||
    normalized.includes('service is not started')
  ) {
    return 'warning';
  }

  if (
    normalized.includes('failed') ||
    normalized.includes('access is denied') ||
    normalized.includes('does not exist') ||
    normalized.includes('error') ||
    normalized.includes('cannot')
  ) {
    return 'failed';
  }

  return 'success';
}

async function getAuthenticatedUser() {
  const supabase = await createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    const message = error.message.toLowerCase();

    if (
      message.includes('auth session missing') ||
      message.includes('session missing') ||
      message.includes('jwt')
    ) {
      return null;
    }

    throw new Error(`Erro ao validar usuário autenticado: ${error.message}`);
  }

  return user ?? null;
}

async function getRoleForCustomer(input: {
  userId: string;
  customerId: string;
}): Promise<string | null> {
  const supabaseAdmin = getSupabaseAdmin();

  const { data, error } = await supabaseAdmin
    .from('user_customer_access')
    .select('role')
    .eq('user_id', input.userId)
    .eq('customer_id', input.customerId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Erro ao validar permissão: ${error.message}`);
  }

  const role = cleanString(data?.role)?.toLowerCase() ?? null;

  if (role && allowedOperationalRoles.has(role)) {
    return role;
  }

  const { data: adminAccess, error: adminError } = await supabaseAdmin
    .from('user_customer_access')
    .select('role')
    .eq('user_id', input.userId)
    .eq('role', 'admin')
    .limit(1)
    .maybeSingle();

  if (adminError) {
    throw new Error(`Erro ao validar permissão admin: ${adminError.message}`);
  }

  if (adminAccess) {
    return 'admin';
  }

  return null;
}

async function getDeviceForOperation(input: {
  deviceId: string;
  customerId: string;
}) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('devices')
    .select(['id', 'customer_id', 'hostname', 'tactical_agent_id'].join(', '))
    .eq('id', input.deviceId)
    .eq('customer_id', input.customerId)
    .eq('visible_to_customer', true)
    .maybeSingle<DeviceServicesActionRow>();

  if (error) {
    throw new Error(`Erro ao localizar dispositivo: ${error.message}`);
  }

  return data;
}

async function runOperationalCommand(input: {
  agentId: string;
  command: string;
  timeout: number;
}) {
  const apiUrl = getOperationsApiUrl();
  const apiKey = getOperationsApiKey();

  const response = await fetch(
    `${apiUrl}/agents/${encodeURIComponent(input.agentId)}/cmd/`,
    {
      method: 'POST',
      headers: {
        'X-API-KEY': apiKey,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
      body: JSON.stringify({
        shell: 'cmd',
        cmd: input.command,
        timeout: input.timeout,
        custom_shell: null,
        run_as_user: false,
      }),
    },
  );

  const text = await response.text();

  let output = text;

  try {
    output = JSON.parse(text);
  } catch {
    // Mantém texto bruto caso não seja JSON válido.
  }

  if (!response.ok) {
    throw new Error(
      `A operação retornou erro ${response.status}: ${String(output)}`,
    );
  }

  return {
    status: response.status,
    output: String(output),
  };
}

async function auditServiceAction(input: {
  customerId: string;
  deviceId: string;
  userId: string;
  userEmail: string | null;
  userRole: string;
  hostname: string;
  serviceName: string;
  action: ServiceAction;
  actionStatus: 'success' | 'warning' | 'failed';
  output: string;
}) {
  const supabaseAdmin = getSupabaseAdmin();
  const now = new Date().toISOString();

  const { data: createdJob, error: jobError } = await supabaseAdmin
    .from('remote_jobs')
    .insert({
      customer_id: input.customerId,
      device_id: input.deviceId,
      job_type: 'service_action',
      status: input.actionStatus === 'failed' ? 'failed' : 'success',
      requested_by: input.userId,
      requested_by_email: input.userEmail,
      requested_by_role: input.userRole,
      command_key: `service_${input.action}`,
      command_label: getActionLabel(input.action),
      parameters: {
        hostname: input.hostname,
        service_name: input.serviceName,
        action: input.action,
      },
      result: {
        status: input.actionStatus,
        output: input.output,
      },
      approval_required: false,
      started_at: now,
      finished_at: now,
    })
    .select('id')
    .single();

  if (jobError) {
    console.error('Erro ao registrar auditoria de serviço:', jobError);
    return;
  }

  const jobId = createdJob.id as string;

  const { error: logError } = await supabaseAdmin
    .from('remote_job_logs')
    .insert({
      job_id: jobId,
      level: input.actionStatus === 'failed' ? 'error' : 'info',
      message: `${getActionLabel(input.action)} executado pelo SafeOps Manager.`,
      payload: {
        hostname: input.hostname,
        service_name: input.serviceName,
        action: input.action,
        action_status: input.actionStatus,
        requested_by_email: input.userEmail,
        requested_by_role: input.userRole,
      },
    });

  if (logError) {
    console.error('Erro ao registrar log de serviço:', logError);
  }
}

export async function POST(
  request: NextRequest,
  context: ServicesActionRouteContext,
) {
  try {
    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Usuário não autenticado.',
        },
        { status: 401 },
      );
    }

    const { deviceId } = await context.params;
    const requestedCustomerId = request.nextUrl.searchParams.get('customerId');

    const customerContext = await resolveCurrentCustomer(requestedCustomerId);

    if (!customerContext?.activeCustomer) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Cliente ativo não encontrado.',
        },
        { status: 403 },
      );
    }

    const activeCustomer = customerContext.activeCustomer;

    const userRole = await getRoleForCustomer({
      userId: user.id,
      customerId: activeCustomer.customerId,
    });

    if (!userRole) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'Usuário sem permissão operacional para executar ações de serviço neste cliente.',
        },
        { status: 403 },
      );
    }

    const body = await request.json();

    const serviceName = cleanString(body.serviceName);
    const action = cleanString(body.action);

    if (!serviceName || !validateServiceName(serviceName)) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Nome de serviço inválido.',
        },
        { status: 400 },
      );
    }

    if (!action || !validateAction(action)) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Ação inválida.',
        },
        { status: 400 },
      );
    }

    const device = await getDeviceForOperation({
      deviceId,
      customerId: activeCustomer.customerId,
    });

    if (!device) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'Dispositivo não encontrado ou não pertence ao cliente vinculado ao usuário.',
        },
        { status: 404 },
      );
    }

    const agentId = cleanString(device.tactical_agent_id);

    if (!agentId) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Dispositivo sem identificador operacional para ação.',
        },
        { status: 409 },
      );
    }

    const command = buildServiceCommand(action, serviceName);

    const result = await runOperationalCommand({
      agentId,
      command,
      timeout: action === 'restart' ? 90 : 60,
    });

    const actionStatus = classifyServiceActionOutput(result.output);

    await auditServiceAction({
      customerId: activeCustomer.customerId,
      deviceId: device.id,
      userId: user.id,
      userEmail: user.email ?? null,
      userRole,
      hostname: device.hostname,
      serviceName,
      action,
      actionStatus,
      output: result.output,
    });

    return NextResponse.json({
      ok: actionStatus !== 'failed',
      status: actionStatus,
      action,
      serviceName,
      message:
        actionStatus === 'success'
          ? 'Operação executada com sucesso.'
          : actionStatus === 'warning'
            ? 'Operação executada com aviso. Verifique o estado atual do serviço.'
            : 'Falha ao executar operação.',
      output: result.output,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : 'Erro interno ao executar ação de serviço.',
      },
      { status: 500 },
    );
  }
}
