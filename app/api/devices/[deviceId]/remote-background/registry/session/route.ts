import { NextRequest, NextResponse } from 'next/server';

import { resolveCurrentCustomer } from '@/lib/data/get-current-customer';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type RegistrySessionRouteContext = {
  params: Promise<{
    deviceId: string;
  }>;
};

type DeviceRegistrySessionRow = {
  id: string;
  customer_id: string;
  hostname: string;
  tactical_agent_id: string | null;
};

type RemoteSessionResponse = Record<string, unknown>;

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

function readUrl(data: RemoteSessionResponse, keys: string[]): string | null {
  for (const key of keys) {
    const value = data[key];

    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function deriveRegistryUrl(data: RemoteSessionResponse): string | null {
  const direct = readUrl(data, [
    'registry',
    'reg',
    'registry_url',
    'registryUrl',
    'regedit',
    'regedit_url',
    'regeditUrl',
  ]);

  if (direct) {
    return direct;
  }

  const candidate = readUrl(data, ['terminal', 'file', 'files', 'control']);

  if (!candidate) {
    return null;
  }

  try {
    const url = new URL(candidate);
    url.searchParams.set('viewmode', '15');

    return url.toString();
  } catch {
    return null;
  }
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
    .maybeSingle<DeviceRegistrySessionRow>();

  if (error) {
    throw new Error(`Erro ao localizar dispositivo: ${error.message}`);
  }

  return data;
}

async function getRemoteSession(agentId: string) {
  const apiUrl = getOperationsApiUrl();
  const apiKey = getOperationsApiKey();

  const response = await fetch(
    `${apiUrl}/agents/${encodeURIComponent(agentId)}/meshcentral/`,
    {
      method: 'GET',
      headers: {
        'X-API-KEY': apiKey,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    },
  );

  const contentType = response.headers.get('content-type') ?? '';
  const text = await response.text();

  let data: RemoteSessionResponse | null = null;

  if (contentType.includes('application/json')) {
    try {
      data = JSON.parse(text) as RemoteSessionResponse;
    } catch {
      data = null;
    }
  }

  if (!response.ok || !data) {
    throw new Error('Não foi possível preparar a sessão do Registro.');
  }

  const url = deriveRegistryUrl(data);

  if (!url) {
    throw new Error(
      'Não foi possível preparar o Registro para este dispositivo.',
    );
  }

  return {
    url,
    session: data,
  };
}

async function auditRegistrySession(input: {
  customerId: string;
  deviceId: string;
  userId: string;
  userEmail: string | null;
  userRole: string;
  hostname: string;
}) {
  const supabaseAdmin = getSupabaseAdmin();
  const now = new Date().toISOString();

  const { data: createdJob, error: jobError } = await supabaseAdmin
    .from('remote_jobs')
    .insert({
      customer_id: input.customerId,
      device_id: input.deviceId,
      job_type: 'registry_session',
      status: 'success',
      requested_by: input.userId,
      requested_by_email: input.userEmail,
      requested_by_role: input.userRole,
      command_key: 'open_registry',
      command_label: 'Abrir Registro',
      parameters: {
        hostname: input.hostname,
        viewmode: 15,
      },
      result: {
        opened: true,
      },
      approval_required: false,
      started_at: now,
      finished_at: now,
    })
    .select('id')
    .single();

  if (jobError) {
    console.error('Erro ao registrar auditoria do Registro:', jobError);
    return;
  }

  const { error: logError } = await supabaseAdmin
    .from('remote_job_logs')
    .insert({
      job_id: createdJob.id,
      level: 'info',
      message: 'Sessão do Registro aberta a partir do SafeOps Manager.',
      payload: {
        hostname: input.hostname,
        requested_by_email: input.userEmail,
        requested_by_role: input.userRole,
        viewmode: 15,
      },
    });

  if (logError) {
    console.error('Erro ao registrar log do Registro:', logError);
  }
}

export async function POST(
  request: NextRequest,
  context: RegistrySessionRouteContext,
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
            'Usuário sem permissão operacional para abrir Registro neste cliente.',
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

    const remoteSession = await getRemoteSession(agentId);

    await auditRegistrySession({
      customerId: activeCustomer.customerId,
      deviceId: device.id,
      userId: user.id,
      userEmail: user.email ?? null,
      userRole,
      hostname: device.hostname,
    });

    return NextResponse.json({
      ok: true,
      url: remoteSession.url,
      device: {
        id: device.id,
        hostname: device.hostname,
        customerId: activeCustomer.customerId,
      },
      session: {
        hostname:
          typeof remoteSession.session.hostname === 'string'
            ? remoteSession.session.hostname
            : device.hostname,
        mode: 'registry',
        viewmode: 15,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : 'Erro interno ao abrir Registro.',
      },
      { status: 500 },
    );
  }
}
