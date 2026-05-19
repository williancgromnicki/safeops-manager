import { NextRequest, NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { deleteTrmmAgent } from '@/lib/trmm/api';

export const dynamic = 'force-dynamic';

type DeviceRouteContext = {
  params: Promise<{
    deviceId: string;
  }>;
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
};

type CustomerRow = {
  id: string;
  name: string;
};

const operationalRoles = new Set(['admin', 'client']);

function cleanString(value?: string | null): string | null {
  const cleaned = value?.trim();

  return cleaned ? cleaned : null;
}

function normalizeRole(role?: string | null): string {
  return cleanString(role)?.toLowerCase() ?? '';
}

function sanitizePublicErrorMessage(message: string): string {
  return message
    .replace(/TRMM API/gi, 'API operacional')
    .replace(/TRMM/gi, 'origem operacional')
    .replace(/TacticalRMM/gi, 'origem operacional')
    .replace(/Tactical/gi, 'origem operacional')
    .replace(/tactical/gi, 'operacional');
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
    .select('id, customer_id, hostname, site')
    .eq('id', input.deviceId)
    .eq('customer_id', input.customerId)
    .maybeSingle();

  if (error) {
    throw new Error(`Erro ao localizar dispositivo: ${error.message}`);
  }

  return data as DeviceRow | null;
}

async function getCustomer(customerId: string): Promise<CustomerRow | null> {
  const supabaseAdmin = getSupabaseAdmin();

  const { data, error } = await supabaseAdmin
    .from('customers')
    .select('id, name')
    .eq('id', customerId)
    .maybeSingle();

  if (error) {
    throw new Error(`Erro ao localizar cliente: ${error.message}`);
  }

  return data as CustomerRow | null;
}

export async function DELETE(
  request: NextRequest,
  context: DeviceRouteContext,
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
    const customerId = request.nextUrl.searchParams.get('customerId');

    if (!customerId) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Informe o cliente do dispositivo.',
        },
        { status: 400 },
      );
    }

    const accessRows = await getUserAccessRows(user.id);

    if (!canManageCustomer({ accessRows, customerId })) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Usuário sem permissão para remover dispositivos deste cliente.',
        },
        { status: 403 },
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
          error: 'Dispositivo não encontrado no SafeOps.',
        },
        { status: 404 },
      );
    }

    await deleteTrmmAgent({
      agentId: device.id,
      hostname: device.hostname,
      clientName: customer?.name ?? null,
      siteName: device.site,
    });

    const supabaseAdmin = getSupabaseAdmin();

    await supabaseAdmin
      .from('alerts')
      .delete()
      .eq('customer_id', customerId)
      .eq('device_id', deviceId);

    await supabaseAdmin
      .from('devices')
      .delete()
      .eq('customer_id', customerId)
      .eq('id', deviceId);

    return NextResponse.json({
      ok: true,
      message:
        'Agente removido com sucesso. Use o botão Atualizar para sincronizar o SafeOps.',
    });
  } catch (error) {
    const rawMessage =
      error instanceof Error ? error.message : 'Erro interno ao remover agente.';

    return NextResponse.json(
      {
        ok: false,
        error: sanitizePublicErrorMessage(rawMessage),
      },
      { status: 500 },
    );
  }
}
