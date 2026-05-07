import { NextRequest, NextResponse } from 'next/server';

import { resolveCurrentCustomer } from '@/lib/data/get-current-customer';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type FileBrowserSessionRouteContext = {
  params: Promise<{
    deviceId: string;
  }>;
};

type DeviceFileBrowserRow = {
  id: string;
  customer_id: string;
  hostname: string;
  tactical_agent_id: string | null;
};

type FileSessionResponse = {
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
    .maybeSingle<DeviceFileBrowserRow>();

  if (error) {
    throw new Error(`Erro ao localizar dispositivo: ${error.message}`);
  }

  return data;
}

async function getFileBrowserUrl(agentId: string) {
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

  let data: FileSessionResponse | null = null;

  if (contentType.includes('application/json')) {
    try {
      data = JSON.parse(text) as FileSessionResponse;
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    const message =
      data?.detail ||
      data?.error ||
      `Erro ${response.status} ao preparar navegador de arquivos.`;

    throw new Error(message);
  }

  const fileUrl = cleanString(data?.file);

  if (!fileUrl) {
    throw new Error(
      'Não foi possível preparar o navegador de arquivos para este dispositivo.',
    );
  }

  return {
    url: fileUrl,
    session: data,
  };
}

async function auditFileBrowserSession(input: {
  customerId: string;
  deviceId: string;
  userId: string;
  userEmail: string | null;
  userRole: string;
  hostname: string;
  sessionStatus?: string | null;
}) {
  const supabaseAdmin = getSupabaseAdmin();
  const now = new Date().toISOString();

  const { data: createdJob, error: jobError } = await supabaseAdmin
    .from('remote_jobs')
    .insert({
      customer_id: input.customerId,
      device_id: input.deviceId,
      job_type: 'file_browser_session',
      status: 'success',
      requested_by: input.userId,
      requested_by_email: input.userEmail,
      requested_by_role: input.userRole,
      command_key: 'open_file_browser',
      command_label: 'Abrir navegador de arquivos',
      parameters: {
        hostname: input.hostname,
        session_status: input.sessionStatus ?? null,
        viewmode: 13,
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
    console.error('Erro ao registrar auditoria do navegador de arquivos:', jobError);
    return;
  }

  const { error: logError } = await supabaseAdmin
    .from('remote_job_logs')
    .insert({
      job_id: createdJob.id,
      level: 'info',
      message:
        'Sessão do navegador de arquivos aberta a partir do SafeOps Manager.',
      payload: {
        hostname: input.hostname,
        requested_by_email: input.userEmail,
        requested_by_role: input.userRole,
        session_status: input.sessionStatus ?? null,
        viewmode: 13,
      },
    });

  if (logError) {
    console.error('Erro ao registrar log do navegador de arquivos:', logError);
  }
}

export async function POST(
  request: NextRequest,
  context: FileBrowserSessionRouteContext,
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
            'Usuário sem permissão operacional para abrir navegador de arquivos neste cliente.',
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

    const fileBrowser = await getFileBrowserUrl(agentId);

    await auditFileBrowserSession({
      customerId: activeCustomer.customerId,
      deviceId: device.id,
      userId: user.id,
      userEmail: user.email ?? null,
      userRole,
      hostname: device.hostname,
      sessionStatus: cleanString(fileBrowser.session?.status),
    });

    return NextResponse.json({
      ok: true,
      url: fileBrowser.url,
      device: {
        id: device.id,
        hostname: device.hostname,
        customerId: activeCustomer.customerId,
      },
      session: {
        hostname: fileBrowser.session?.hostname ?? device.hostname,
        status: fileBrowser.session?.status ?? null,
        mode: 'files',
        viewmode: 13,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : 'Erro interno ao abrir navegador de arquivos.',
      },
      { status: 500 },
    );
  }
}
