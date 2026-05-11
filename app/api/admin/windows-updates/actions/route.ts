import { NextRequest, NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import {
  fetchTrmmAgentsByClient,
  fetchTrmmWindowsUpdatesByAgent,
  findTrmmClientIdByName,
  triggerTrmmWindowsUpdateInstall,
  triggerTrmmWindowsUpdateScan,
  updateTrmmWindowsUpdateAction,
  type TrmmWindowsUpdateAction,
} from '@/lib/trmm/windows-updates';

export const dynamic = 'force-dynamic';

type AccessRow = {
  customer_id: string;
  role: string;
};

type CustomerRow = {
  id: string;
  name: string;
  tactical_client_id: number | null;
};

type WindowsUpdateActionPayload = {
  customerId?: string;
  agentId?: string;
  updateId?: number;
  action?:
    | 'scan'
    | 'install-approved'
    | 'approve-update'
    | 'ignore-update'
    | 'reset-update';
};

function cleanString(value?: string | null): string | null {
  const cleaned = value?.trim();

  return cleaned ? cleaned : null;
}

function normalizeRole(role?: string | null): string {
  return cleanString(role)?.toLowerCase() ?? '';
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

function isSafesysAdmin(accessRows: AccessRow[]): boolean {
  return accessRows.some((row) => row.role === 'admin');
}

function canAccessCustomer(input: {
  accessRows: AccessRow[];
  customerId: string;
}) {
  if (isSafesysAdmin(input.accessRows)) {
    return true;
  }

  return input.accessRows.some((row) => row.customer_id === input.customerId);
}

async function getCustomer(customerId: string): Promise<CustomerRow | null> {
  const supabaseAdmin = getSupabaseAdmin();

  const { data, error } = await supabaseAdmin
    .from('customers')
    .select('id, name, tactical_client_id')
    .eq('id', customerId)
    .maybeSingle();

  if (error) {
    throw new Error(`Erro ao localizar cliente: ${error.message}`);
  }

  return data as CustomerRow | null;
}

async function resolveTacticalClientId(customer: CustomerRow): Promise<number> {
  if (
    typeof customer.tactical_client_id === 'number' &&
    Number.isFinite(customer.tactical_client_id) &&
    customer.tactical_client_id > 0
  ) {
    return customer.tactical_client_id;
  }

  const tacticalClientId = await findTrmmClientIdByName(customer.name);

  if (!tacticalClientId) {
    throw new Error(
      `Não foi possível localizar o cliente "${customer.name}" na base de monitoramento.`,
    );
  }

  const supabaseAdmin = getSupabaseAdmin();

  await supabaseAdmin
    .from('customers')
    .update({
      tactical_client_id: tacticalClientId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', customer.id);

  return tacticalClientId;
}

async function assertAgentBelongsToClient(input: {
  tacticalClientId: number;
  agentId: string;
}) {
  const agents = await fetchTrmmAgentsByClient(input.tacticalClientId);
  const agent = agents.find((item) => item.agent_id === input.agentId);

  if (!agent) {
    throw new Error('Este agente não pertence ao cliente selecionado.');
  }

  return agent;
}

function mapUpdateAction(
  action: WindowsUpdateActionPayload['action'],
): TrmmWindowsUpdateAction {
  if (action === 'approve-update') {
    return 'approve';
  }

  if (action === 'ignore-update') {
    return 'ignore';
  }

  return 'nothing';
}

async function assertUpdateBelongsToAgent(input: {
  agentId: string;
  updateId: number;
}) {
  const updates = await fetchTrmmWindowsUpdatesByAgent(input.agentId);
  const update = updates.find(
    (item) => String(item.id) === String(input.updateId),
  );

  if (!update) {
    throw new Error(
      'Não foi possível confirmar este update no dispositivo selecionado. Atualize a tela e tente novamente.',
    );
  }

  return update;
}

export async function POST(request: NextRequest) {
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

    const payload = (await request.json()) as WindowsUpdateActionPayload;
    const customerId = cleanString(payload.customerId);
    const agentId = cleanString(payload.agentId);

    if (!customerId || !agentId || !payload.action) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Informe cliente, agente e ação.',
        },
        { status: 400 },
      );
    }

    const accessRows = await getUserAccessRows(user.id);

    if (!canAccessCustomer({ accessRows, customerId })) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Usuário sem permissão para executar ação neste cliente.',
        },
        { status: 403 },
      );
    }

    const customer = await getCustomer(customerId);

    if (!customer) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Cliente não encontrado.',
        },
        { status: 404 },
      );
    }

    const tacticalClientId = await resolveTacticalClientId(customer);
    const agent = await assertAgentBelongsToClient({
      tacticalClientId,
      agentId,
    });

    if (payload.action === 'scan') {
      const result = await triggerTrmmWindowsUpdateScan(agentId);

      return NextResponse.json({
        ok: true,
        message: result,
        agent,
      });
    }

    if (payload.action === 'install-approved') {
      const result = await triggerTrmmWindowsUpdateInstall(agentId);

      return NextResponse.json({
        ok: true,
        message: result,
        agent,
      });
    }

    if (
      payload.action === 'approve-update' ||
      payload.action === 'ignore-update' ||
      payload.action === 'reset-update'
    ) {
      if (
        payload.updateId === undefined ||
        payload.updateId === null ||
        Number.isNaN(Number(payload.updateId))
      ) {
        return NextResponse.json(
          {
            ok: false,
            error: 'Informe o update.',
          },
          { status: 400 },
        );
      }

      const updateId = Number(payload.updateId);

      const update = await assertUpdateBelongsToAgent({
        agentId,
        updateId,
      });

      const result = await updateTrmmWindowsUpdateAction({
        updateId,
        action: mapUpdateAction(payload.action),
      });

      return NextResponse.json({
        ok: true,
        message: result,
        agent,
        update,
      });
    }

    return NextResponse.json(
      {
        ok: false,
        error: 'Ação inválida.',
      },
      { status: 400 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : 'Erro interno ao executar ação de Windows Update.',
      },
      { status: 500 },
    );
  }
}
