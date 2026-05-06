import { NextRequest, NextResponse } from 'next/server';

import { resolveCurrentCustomer } from '@/lib/data/get-current-customer';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type RemoteRouteContext = {
  params: Promise<{
    deviceId: string;
  }>;
};

type DeviceRemoteRow = {
  id: string;
  customer_id: string;
  hostname: string;
  tactical_agent_id: string | null;
};

const allowedOperationalRoles = new Set(['admin', 'client']);

function cleanString(value?: string | null): string | null {
  const cleaned = value?.trim();

  return cleaned ? cleaned : null;
}

function getTrmmBaseUrl(): string {
  return (
    process.env.SAFEOPS_TRMM_BASE_URL?.trim() ??
    'https://safeops.safesys.net.br'
  ).replace(/\/+$/, '');
}

function buildTakeControlUrl(tacticalAgentId: string): string {
  const baseUrl = getTrmmBaseUrl();

  return `${baseUrl}/takecontrol/${encodeURIComponent(tacticalAgentId)}`;
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

async function auditTakeControl(input: {
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
      job_type: 'take_control_session',
      status: 'success',
      requested_by: input.userId,
      requested_by_email: input.userEmail,
      requested_by_role: input.userRole,
      command_key: 'open_take_control',
      command_label: 'Abrir Take Control',
      parameters: {
        hostname: input.hostname,
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
    console.error('Erro ao registrar auditoria Take Control:', jobError);
    return;
  }

  const jobId = createdJob.id as string;

  const { error: logError } = await supabaseAdmin
    .from('remote_job_logs')
    .insert({
      job_id: jobId,
      level: 'info',
      message: 'Sessão Take Control aberta a partir do SafeOps Manager.',
      payload: {
        hostname: input.hostname,
        requested_by_email: input.userEmail,
        requested_by_role: input.userRole,
      },
    });

  if (logError) {
    console.error('Erro ao registrar log Take Control:', logError);
  }
}

export async function POST(request: NextRequest, context: RemoteRouteContext) {
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
            'Usuário sem permissão operacional para abrir Take Control neste cliente.',
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
        ].join(', '),
      )
      .eq('id', deviceId)
      .eq('customer_id', activeCustomer.customerId)
      .eq('visible_to_customer', true)
      .maybeSingle<DeviceRemoteRow>();

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
          error: 'Dispositivo sem tactical_agent_id para Take Control.',
        },
        { status: 409 },
      );
    }

    const url = buildTakeControlUrl(tacticalAgentId);

    await auditTakeControl({
      customerId: activeCustomer.customerId,
      deviceId: data.id,
      userId: user.id,
      userEmail: user.email ?? null,
      userRole,
      hostname: data.hostname,
    });

    return NextResponse.json({
      ok: true,
      url,
      device: {
        id: data.id,
        hostname: data.hostname,
        customerId: activeCustomer.customerId,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : 'Erro interno ao abrir Take Control.',
      },
      { status: 500 },
    );
  }
}
