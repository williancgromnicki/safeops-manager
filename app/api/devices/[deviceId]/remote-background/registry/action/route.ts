import { NextRequest, NextResponse } from 'next/server';

import { resolveCurrentCustomer } from '@/lib/data/get-current-customer';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type RegistryActionRouteContext = {
  params: Promise<{
    deviceId: string;
  }>;
};

type DeviceRegistryActionRow = {
  id: string;
  customer_id: string;
  hostname: string;
  tactical_agent_id: string | null;
};

type RegistryAction =
  | 'create_key'
  | 'delete_key'
  | 'rename_key'
  | 'create_value'
  | 'modify_value'
  | 'delete_value'
  | 'rename_value';

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

function validateAction(action: string): action is RegistryAction {
  return [
    'create_key',
    'delete_key',
    'rename_key',
    'create_value',
    'modify_value',
    'delete_value',
    'rename_value',
  ].includes(action);
}

function validatePath(value: string | null): value is string {
  if (!value) return false;
  if (value.length > 500) return false;

  return !/[&|<>;`]/.test(value);
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
    .maybeSingle<DeviceRegistryActionRow>();

  if (error) {
    throw new Error(`Erro ao localizar dispositivo: ${error.message}`);
  }

  return data;
}

async function callRegistryApi(input: {
  agentId: string;
  method: 'POST' | 'DELETE';
  endpoint: string;
  body?: Record<string, unknown>;
  query?: Record<string, string>;
}) {
  const apiUrl = getOperationsApiUrl();
  const apiKey = getOperationsApiKey();
  const url = new URL(
    `${apiUrl}/agents/${encodeURIComponent(input.agentId)}/registry/${input.endpoint}`,
  );

  for (const [key, value] of Object.entries(input.query ?? {})) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url.toString(), {
    method: input.method,
    headers: {
      'X-API-KEY': apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    cache: 'no-store',
    body: input.body ? JSON.stringify(input.body) : undefined,
  });

  const text = await response.text();

  let data: unknown = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    throw new Error('Não foi possível executar a ação no registro.');
  }

  return data;
}

async function auditRegistryAction(input: {
  customerId: string;
  deviceId: string;
  userId: string;
  userEmail: string | null;
  userRole: string;
  hostname: string;
  action: RegistryAction;
  path: string;
  result: unknown;
}) {
  const supabaseAdmin = getSupabaseAdmin();
  const now = new Date().toISOString();

  const { data: createdJob, error: jobError } = await supabaseAdmin
    .from('remote_jobs')
    .insert({
      customer_id: input.customerId,
      device_id: input.deviceId,
      job_type: 'registry_action',
      status: 'success',
      requested_by: input.userId,
      requested_by_email: input.userEmail,
      requested_by_role: input.userRole,
      command_key: `registry_${input.action}`,
      command_label: `Ação no Registro: ${input.action}`,
      parameters: {
        hostname: input.hostname,
        action: input.action,
        path: input.path,
      },
      result: input.result,
      approval_required: false,
      started_at: now,
      finished_at: now,
    })
    .select('id')
    .single();

  if (jobError) {
    console.error('Erro ao registrar auditoria do registro:', jobError);
    return;
  }

  const { error: logError } = await supabaseAdmin
    .from('remote_job_logs')
    .insert({
      job_id: createdJob.id,
      level: 'info',
      message: 'Ação no Registro executada pelo SafeOps Manager.',
      payload: {
        hostname: input.hostname,
        action: input.action,
        path: input.path,
        requested_by_email: input.userEmail,
        requested_by_role: input.userRole,
      },
    });

  if (logError) {
    console.error('Erro ao registrar log do registro:', logError);
  }
}

export async function POST(
  request: NextRequest,
  context: RegistryActionRouteContext,
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
    const body = await request.json();
    const action = cleanString(body.action);
    const path = cleanString(body.path);

    if (!action || !validateAction(action)) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Ação inválida.',
        },
        { status: 400 },
      );
    }

    if (!validatePath(path)) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Caminho inválido.',
        },
        { status: 400 },
      );
    }

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
            'Usuário sem permissão operacional para executar ações de registro neste cliente.',
        },
        { status: 403 },
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

    let result: unknown;

    if (action === 'create_key') {
      result = await callRegistryApi({
        agentId,
        method: 'POST',
        endpoint: 'create-key/',
        body: { path },
      });
    } else if (action === 'delete_key') {
      result = await callRegistryApi({
        agentId,
        method: 'DELETE',
        endpoint: 'delete-key/',
        query: { path },
      });
    } else if (action === 'rename_key') {
      result = await callRegistryApi({
        agentId,
        method: 'POST',
        endpoint: 'rename-key/',
        body: { old_path: path, new_path: body.newPath },
      });
    } else if (action === 'create_value') {
      result = await callRegistryApi({
        agentId,
        method: 'POST',
        endpoint: 'create-value/',
        body: {
          path,
          name: body.name,
          type: body.type,
          data: body.data,
        },
      });
    } else if (action === 'modify_value') {
      result = await callRegistryApi({
        agentId,
        method: 'POST',
        endpoint: 'modify-value/',
        body: {
          path,
          name: body.name,
          type: body.type,
          data: body.data,
        },
      });
    } else if (action === 'delete_value') {
      result = await callRegistryApi({
        agentId,
        method: 'DELETE',
        endpoint: 'delete-value/',
        query: { path, name: String(body.name ?? '') },
      });
    } else {
      result = await callRegistryApi({
        agentId,
        method: 'POST',
        endpoint: 'rename-value/',
        body: {
          path,
          old_name: body.oldName,
          new_name: body.newName,
        },
      });
    }

    await auditRegistryAction({
      customerId: activeCustomer.customerId,
      deviceId: device.id,
      userId: user.id,
      userEmail: user.email ?? null,
      userRole,
      hostname: device.hostname,
      action,
      path,
      result,
    });

    return NextResponse.json({
      ok: true,
      status: 'success',
      message: 'Operação executada com sucesso.',
      result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : 'Erro interno ao executar ação no registro.',
      },
      { status: 500 },
    );
  }
}
