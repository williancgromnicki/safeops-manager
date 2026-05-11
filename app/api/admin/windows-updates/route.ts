import { NextRequest, NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import {
  fetchWindowsUpdateSummariesByClient,
  findTrmmClientIdByName,
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

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Usuário não autenticado.',
          devices: [],
        },
        { status: 401 },
      );
    }

    const customerId = request.nextUrl.searchParams.get('customerId');

    if (!customerId) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Informe o cliente.',
          devices: [],
        },
        { status: 400 },
      );
    }

    const accessRows = await getUserAccessRows(user.id);

    if (!canAccessCustomer({ accessRows, customerId })) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Usuário sem permissão para acessar este cliente.',
          devices: [],
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
          devices: [],
        },
        { status: 404 },
      );
    }

    const tacticalClientId = await resolveTacticalClientId(customer);
    const devices = await fetchWindowsUpdateSummariesByClient(tacticalClientId);

    const totals = devices.reduce(
      (acc, device) => {
        acc.devices += 1;
        acc.pending += device.updates_pending;
        acc.approved += device.updates_approved;
        acc.critical += device.updates_critical;
        acc.security += device.updates_security;
        acc.reboot += device.needs_reboot ? 1 : 0;

        return acc;
      },
      {
        devices: 0,
        pending: 0,
        approved: 0,
        critical: 0,
        security: 0,
        reboot: 0,
      },
    );

    return NextResponse.json({
      ok: true,
      customer: {
        id: customer.id,
        name: customer.name,
        tactical_client_id: tacticalClientId,
      },
      totals,
      devices,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : 'Erro interno ao listar Windows Updates.',
        devices: [],
      },
      { status: 500 },
    );
  }
}
