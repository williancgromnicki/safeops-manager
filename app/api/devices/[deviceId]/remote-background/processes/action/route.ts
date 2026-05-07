import { NextRequest, NextResponse } from 'next/server';

import { resolveCurrentCustomer } from '@/lib/data/get-current-customer';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type ProcessesActionRouteContext = {
  params: Promise<{
    deviceId: string;
  }>;
};

type DeviceProcessesActionRow = {
  id: string;
  customer_id: string;
  hostname: string;
  tactical_agent_id: string | null;
};

type ProcessAction = 'kill';

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

function validatePid(pid: unknown): pid is number {
  if (typeof pid !== 'number') {
    return false;
  }

  return Number.isInteger(pid) && pid > 0 && pid <= 9999999;
}

function validateAction(action: string): action is ProcessAction {
  return action === 'kill';
}

function buildProcessCommand(pid: number): string {
  return `taskkill.exe /PID ${pid} /F`;
}

function classifyProcessActionOutput(
  output: string,
): 'success' | 'warning' | 'failed' {
  const normalized = output.toLowerCase();

  if (
    normalized.includes('success') ||
    normalized.includes('foi finalizado') ||
    normalized.includes('has been terminated') ||
    normalized.includes('terminated')
  ) {
    return 'success';
  }

  if (
    normalized.includes('not found') ||
    normalized.includes('não foi encontrado') ||
    normalized.includes('not running')
  ) {
    return 'warning';
  }

  if (
    normalized.includes('access is denied') ||
    normalized.includes('failed') ||
    normalized.includes('erro') ||
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
    .maybeSingle<DeviceProcessesActionRow>();

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

async function auditProcessAction(input: {
  customerId: string;
  deviceId: string;
  userId: string;
  userEmail: string | null;
  userRole: string;
  hostname: string;
  pid: number;
  processName: string | null;
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
      job_type: 'process_action',
      status: input.actionStatus === 'failed' ? 'failed' : 'success',
      requested_by: input.userId,
      requested_by_email: input.userEmail,
      requested_by_role: input.userRole,
      command_key: 'process_kill',
      command_label: 'Finalizar processo',
      parameters: {
        hostname: input.hostname,
        pid: input.pid,
        process_name: input.processName,
        action: 'kill',
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
    console.error('Erro ao registrar auditoria de processo:', jobError);
    return;
  }

  const jobId = createdJob.id as string;

  const { error: logError } = await supabaseAdmin
    .from('remote_job_logs')
    .insert({
      job_id: jobId,
      level: input.actionStatus === 'failed' ? 'error' : 'info',
      message: 'Processo finalizado pelo SafeOps Manager.',
      payload: {
        hostname: input.hostname,
        pid: input.pid,
        process_name: input.processName,
        action: 'kill',
        action_status: input.actionStatus,
        requested_by_email: input.userEmail,
        requested_by_role: input.userRole,
      },
    });

  if (logError) {
    console.error('Erro ao registrar log de processo:', logError);
  }
}

export async function POST(
  request: NextRequest,
  context: ProcessesActionRouteContext,
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
            'Usuário sem permissão operacional para executar ações de processo neste cliente.',
        },
        { status: 403 },
      );
    }

    const body = await request.json();

    const action = cleanString(body.action);
    const pid = body.pid;
    const processName = cleanString(body.processName);

    if (!action || !validateAction(action)) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Ação inválida.',
        },
        { status: 400 },
      );
    }

    if (!validatePid(pid)) {
      return NextResponse.json(
        {
          ok: false,
          error: 'PID inválido.',
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

    const command = buildProcessCommand(pid);

    const result = await runOperationalCommand({
      agentId,
      command,
      timeout: 60,
    });

    const actionStatus = classifyProcessActionOutput(result.output);

    await auditProcessAction({
      customerId: activeCustomer.customerId,
      deviceId: device.id,
      userId: user.id,
      userEmail: user.email ?? null,
      userRole,
      hostname: device.hostname,
      pid,
      processName,
      actionStatus,
      output: result.output,
    });

    return NextResponse.json({
      ok: actionStatus !== 'failed',
      status: actionStatus,
      action,
      pid,
      processName,
      message:
        actionStatus === 'success'
          ? 'Processo finalizado com sucesso.'
          : actionStatus === 'warning'
            ? 'Operação executada com aviso. Atualize a lista para confirmar.'
            : 'Falha ao finalizar processo.',
      output: result.output,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : 'Erro interno ao executar ação de processo.',
      },
      { status: 500 },
    );
  }
}
