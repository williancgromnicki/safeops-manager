import { NextRequest, NextResponse } from 'next/server';

import { resolveCurrentCustomer } from '@/lib/data/get-current-customer';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type RemoteBackgroundRouteContext = {
  params: Promise<{
    deviceId: string;
  }>;
};

type DeviceRemoteBackgroundRow = {
  id: string;
  customer_id: string;
  hostname: string;
  tactical_agent_id: string | null;
  operating_system: string | null;
};

type MeshCentralResponse = {
  hostname?: string;
  control?: string;
  terminal?: string;
  file?: string;
  status?: string;
  client?: string;
  site?: string;
  detail?: string;
  error?: string;
};

const allowedOperationalRoles = new Set(['admin', 'client']);

function cleanString(value?: string | null): string | null {
  const cleaned = value?.trim();

  return cleaned ? cleaned : null;
}

function getTrmmApiUrl(): string {
  const apiUrl = process.env.TRMM_API_URL?.trim();

  if (!apiUrl) {
    throw new Error('TRMM_API_URL não configurada.');
  }

  return apiUrl.replace(/\/+$/, '');
}

function getTrmmApiKey(): string {
  const apiKey = process.env.TRMM_API_KEY?.trim();

  if (!apiKey) {
    throw new Error('TRMM_API_KEY não configurada.');
  }

  return apiKey;
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

async function getMeshCentralTerminalUrl(tacticalAgentId: string) {
  const trmmApiUrl = getTrmmApiUrl();
  const trmmApiKey = getTrmmApiKey();

  const response = await fetch(
    `${trmmApiUrl}/agents/${encodeURIComponent(tacticalAgentId)}/meshcentral/`,
    {
      method: 'GET',
      headers: {
        'X-API-KEY': trmmApiKey,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    },
  );

  const contentType = response.headers.get('content-type') ?? '';
  const text = await response.text();

  let data: MeshCentralResponse | null = null;

  if (contentType.includes('application/json')) {
    try {
      data = JSON.parse(text) as MeshCentralResponse;
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    const message =
      data?.detail ||
      data?.error ||
      `TRMM retornou erro ${response.status} ao gerar sessão MeshCentral.`;

    throw new Error(message);
  }

  const terminalUrl = cleanString(data?.terminal);

  if (!terminalUrl) {
    throw new Error(
      'TRMM não retornou URL de Remote Background para este dispositivo.',
    );
  }

  return {
    url: terminalUrl,
    mesh: data,
  };
}

async function auditRemoteBackground(input: {
  customerId: string;
  deviceId: string;
  userId: string;
  userEmail: string | null;
  userRole: string;
  hostname: string;
  meshStatus?: string | null;
}) {
  const supabaseAdmin = getSupabaseAdmin();

  const now = new Date().toISOString();

  const { data: createdJob, error: jobError } = await supabaseAdmin
    .from('remote_jobs')
    .insert({
      customer_id: input.customerId,
      device_id: input.deviceId,
      job_type: 'remote_background_session',
      status: 'success',
      requested_by: input.userId,
      requested_by_email: input.userEmail,
      requested_by_role: input.userRole,
      command_key: 'open_remote_background',
      command_label: 'Abrir Remote Background',
      parameters: {
        hostname: input.hostname,
        mesh_status: input.meshStatus ?? null,
        source: 'meshcentral_api',
        viewmode: 12,
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
    console.error('Erro ao registrar auditoria Remote Background:', jobError);
    return;
  }

  const jobId = createdJob.id as string;

  const { error: logError } = await supabaseAdmin
    .from('remote_job_logs')
    .insert({
      job_id: jobId,
      level: 'info',
      message:
        'Sessão Remote Background aberta a partir do SafeOps Manager usando URL temporária do MeshCentral.',
      payload: {
        hostname: input.hostname,
        requested_by_email: input.userEmail,
        requested_by_role: input.userRole,
        mesh_status: input.meshStatus ?? null,
        source: 'meshcentral_api',
        viewmode: 12,
      },
    });

  if (logError) {
    console.error('Erro ao registrar log Remote Background:', logError);
  }
}

export async function POST(
  request: NextRequest,
  context: RemoteBackgroundRouteContext,
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
            'Usuário sem permissão operacional para abrir Remote Background neste cliente.',
        },
        { status: 403 },
      );
    }

    const supabase = await createClient();

    const { data, error } = await supabase
      .from('devices')
      .select(
        [
          'id',
          'customer_id',
          'hostname',
          'tactical_agent_id',
          'operating_system',
        ].join(', '),
      )
      .eq('id', deviceId)
      .eq('customer_id', activeCustomer.customerId)
      .eq('visible_to_customer', true)
      .maybeSingle<DeviceRemoteBackgroundRow>();

    if (error) {
      return NextResponse.json(
        {
          ok: false,
          error: `Erro ao localizar dispositivo: ${error.message}`,
        },
        { status: 500 },
      );
    }

    if (!data) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'Dispositivo não encontrado ou não pertence ao cliente vinculado ao usuário.',
        },
        { status: 404 },
      );
    }

    const tacticalAgentId = cleanString(data.tactical_agent_id);

    if (!tacticalAgentId) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Dispositivo sem tactical_agent_id para Remote Background.',
        },
        { status: 409 },
      );
    }

    const meshCentral = await getMeshCentralTerminalUrl(tacticalAgentId);

    await auditRemoteBackground({
      customerId: activeCustomer.customerId,
      deviceId: data.id,
      userId: user.id,
      userEmail: user.email ?? null,
      userRole,
      hostname: data.hostname,
      meshStatus: cleanString(meshCentral.mesh?.status),
    });

    return NextResponse.json({
      ok: true,
      url: meshCentral.url,
      device: {
        id: data.id,
        hostname: data.hostname,
        customerId: activeCustomer.customerId,
        operatingSystem: data.operating_system,
      },
      mesh: {
        hostname: meshCentral.mesh?.hostname ?? data.hostname,
        status: meshCentral.mesh?.status ?? null,
        client: meshCentral.mesh?.client ?? null,
        site: meshCentral.mesh?.site ?? null,
        mode: 'terminal',
        viewmode: 12,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : 'Erro interno ao abrir Remote Background.',
      },
      { status: 500 },
    );
  }
}
