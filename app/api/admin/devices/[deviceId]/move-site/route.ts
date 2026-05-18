import { NextRequest, NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { fetchTrmmApi, findTrmmClientByIdOrName } from '@/lib/trmm/api';

export const dynamic = 'force-dynamic';

type MoveDeviceRouteContext = {
  params: Promise<{
    deviceId: string;
  }>;
};

type MoveDevicePayload = {
  targetSiteId?: number | string | null;
};

type AccessRow = {
  customer_id: string;
  role: string;
};

type DeviceRow = {
  id: string;
  customer_id: string;
  hostname: string;
  site: string | null;
  tactical_agent_id: string | null;
  visible_to_customer: boolean;
};

type CustomerRow = {
  id: string;
  tactical_client_id: string | null;
};

type AgentDetails = {
  agent_id?: string | null;
  monitoring_type?: string | null;
  description?: string | null;
  overdue_email_alert?: boolean | null;
  overdue_text_alert?: boolean | null;
  overdue_dashboard_alert?: boolean | null;
  offline_time?: number | null;
  overdue_time?: number | null;
  check_interval?: number | null;
  time_zone?: string | null;
  custom_fields?: unknown[];
  winupdatepolicy?: unknown[];
};

const operationalRoles = new Set(['admin', 'client']);

function cleanString(value?: string | null): string | null {
  const cleaned = value?.trim();
  return cleaned ? cleaned : null;
}

function normalizeRole(role?: string | null): string {
  return cleanString(role)?.toLowerCase() ?? '';
}

function parsePositiveInteger(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return Math.floor(parsed);
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

async function getUserAccessRows(userId: string): Promise<AccessRow[]> {
  const supabaseAdmin = getSupabaseAdmin();

  const { data, error } = await supabaseAdmin
    .from('user_customer_access')
    .select('customer_id, role')
    .eq('user_id', userId);

  if (error) {
    throw new Error(`Erro ao buscar permissões do usuário: ${error.message}`);
  }

  return ((data ?? []) as unknown as AccessRow[]).map((row) => ({
    customer_id: row.customer_id,
    role: normalizeRole(row.role),
  }));
}

function canManageCustomer(input: {
  accessRows: AccessRow[];
  customerId: string;
}) {
  if (input.accessRows.some((row) => row.role === 'admin')) {
    return true;
  }

  return input.accessRows.some(
    (row) =>
      row.customer_id === input.customerId && operationalRoles.has(row.role),
  );
}

async function getDevice(input: {
  deviceId: string;
  customerId: string;
}): Promise<DeviceRow | null> {
  const supabaseAdmin = getSupabaseAdmin();

  const { data, error } = await supabaseAdmin
    .from('devices')
    .select(
      [
        'id',
        'customer_id',
        'hostname',
        'site',
        'tactical_agent_id',
        'visible_to_customer',
      ].join(', '),
    )
    .eq('id', input.deviceId)
    .eq('customer_id', input.customerId)
    .eq('visible_to_customer', true)
    .maybeSingle<DeviceRow>();

  if (error) {
    throw new Error(`Erro ao localizar dispositivo: ${error.message}`);
  }

  return data ?? null;
}

async function getCustomer(customerId: string): Promise<CustomerRow | null> {
  const supabaseAdmin = getSupabaseAdmin();

  const { data, error } = await supabaseAdmin
    .from('customers')
    .select('id, tactical_client_id')
    .eq('id', customerId)
    .maybeSingle<CustomerRow>();

  if (error) {
    throw new Error(`Erro ao localizar cliente: ${error.message}`);
  }

  return data ?? null;
}

function buildAgentUpdatePayload(input: {
  agent: AgentDetails;
  agentId: string;
  targetSiteId: number;
}) {
  return {
    winupdatepolicy: Array.isArray(input.agent.winupdatepolicy)
      ? input.agent.winupdatepolicy
      : [],
    custom_fields: Array.isArray(input.agent.custom_fields)
      ? input.agent.custom_fields
      : [],
    agent_id: input.agent.agent_id ?? input.agentId,
    monitoring_type: input.agent.monitoring_type ?? 'workstation',
    description: input.agent.description ?? '',
    overdue_email_alert: input.agent.overdue_email_alert ?? false,
    overdue_text_alert: input.agent.overdue_text_alert ?? false,
    overdue_dashboard_alert: input.agent.overdue_dashboard_alert ?? false,
    offline_time: input.agent.offline_time ?? 30,
    overdue_time: input.agent.overdue_time ?? 60,
    check_interval: input.agent.check_interval ?? 120,
    time_zone: input.agent.time_zone ?? 'America/Sao_Paulo',
    site: input.targetSiteId,
  };
}

async function moveOperationalAgent(input: {
  agentId: string;
  targetSiteId: number;
}) {
  const agent = await fetchTrmmApi<AgentDetails>(
    `/agents/${encodeURIComponent(input.agentId)}/`,
    {
      method: 'GET',
    },
  );

  const payload = buildAgentUpdatePayload({
    agent,
    agentId: input.agentId,
    targetSiteId: input.targetSiteId,
  });

  await fetchTrmmApi<string>(`/agents/${encodeURIComponent(input.agentId)}/`, {
    method: 'PUT',
    parseAsText: true,
    body: JSON.stringify(payload),
  });
}

export async function POST(
  request: NextRequest,
  context: MoveDeviceRouteContext,
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
    const customerId = cleanString(request.nextUrl.searchParams.get('customerId'));

    if (!customerId) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Cliente ativo não informado.',
        },
        { status: 400 },
      );
    }

    const accessRows = await getUserAccessRows(user.id);

    if (!canManageCustomer({ accessRows, customerId })) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'Usuário sem permissão operacional para mover dispositivos neste cliente.',
        },
        { status: 403 },
      );
    }

    const payload = (await request.json()) as MoveDevicePayload;
    const targetSiteId = parsePositiveInteger(payload.targetSiteId);

    if (!targetSiteId) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Selecione um grupo válido.',
        },
        { status: 400 },
      );
    }

    const [device, customer] = await Promise.all([
      getDevice({ deviceId, customerId }),
      getCustomer(customerId),
    ]);

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
          error:
            'Dispositivo sem identificador operacional para movimentação entre grupos.',
        },
        { status: 409 },
      );
    }

    const operationalClientId = parsePositiveInteger(customer?.tactical_client_id);

    if (!customer || !operationalClientId) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'Cliente sem vínculo operacional. Sincronize o cliente antes de mover dispositivos.',
        },
        { status: 400 },
      );
    }

    const operationalClient = await findTrmmClientByIdOrName({
      clientId: operationalClientId,
    });

    const targetSite = operationalClient?.sites.find(
      (site) => Number(site.id) === targetSiteId,
    );

    if (!targetSite) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'Grupo de destino não encontrado para este cliente. Atualize a lista de grupos e tente novamente.',
        },
        { status: 404 },
      );
    }

    await moveOperationalAgent({
      agentId,
      targetSiteId,
    });

    const supabaseAdmin = getSupabaseAdmin();

    const { error: updateError } = await supabaseAdmin
      .from('devices')
      .update({
        site: targetSite.name,
      })
      .eq('id', device.id)
      .eq('customer_id', customerId);

    if (updateError) {
      throw new Error(
        `Dispositivo movido na origem operacional, mas houve erro ao atualizar o SafeOps: ${updateError.message}`,
      );
    }

    return NextResponse.json({
      ok: true,
      message: `Dispositivo movido para o grupo ${targetSite.name}.`,
      device: {
        id: device.id,
        hostname: device.hostname,
        site: targetSite.name,
        targetSiteId,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : 'Erro interno ao mover dispositivo entre grupos.',
      },
      { status: 500 },
    );
  }
}
