import { NextRequest, NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { normalizeDeviceStatus } from '@/lib/data/get-devices';

export const dynamic = 'force-dynamic';

type AccessRow = {
  customer_id: string;
  role: string;
};

type DeviceRow = {
  id: string;
  customer_id: string;
  hostname: string;
  site: string | null;
  status: string | null;
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
          error: 'Usuário sem permissão para listar dispositivos deste cliente.',
          devices: [],
        },
        { status: 403 },
      );
    }

    const supabaseAdmin = getSupabaseAdmin();

    const { data, error } = await supabaseAdmin
      .from('devices')
      .select('id, customer_id, hostname, site, status')
      .eq('customer_id', customerId)
      .eq('visible_to_customer', true)
      .order('hostname', { ascending: true });

    if (error) {
      throw new Error(`Erro ao listar dispositivos: ${error.message}`);
    }

    const devices = ((data ?? []) as DeviceRow[]).map((device) => ({
      id: device.id,
      customerId: device.customer_id,
      name: device.hostname,
      site: device.site ?? 'Não informado',
      status: normalizeDeviceStatus(device.status),
    }));

    return NextResponse.json({
      ok: true,
      devices,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : 'Erro interno ao listar dispositivos.',
        devices: [],
      },
      { status: 500 },
    );
  }
}
