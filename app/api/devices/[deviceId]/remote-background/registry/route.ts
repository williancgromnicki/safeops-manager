import { NextRequest, NextResponse } from 'next/server';

import { resolveCurrentCustomer } from '@/lib/data/get-current-customer';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type RegistryRouteContext = {
  params: Promise<{
    deviceId: string;
  }>;
};

type DeviceRegistryRow = {
  id: string;
  customer_id: string;
  hostname: string;
  tactical_agent_id: string | null;
};

type RawRegistryItem = Record<string, unknown>;

type RawRegistryPayload = {
  path?: string;
  subkeys?: RawRegistryItem[] | null;
  values?: RawRegistryItem[] | null;
  has_more?: boolean;
  page?: number;
  page_size?: number;
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

function normalizeRegistryPath(path: string | null): string {
  const cleaned = path?.trim().replace(/\/+/, '\\').replace(/\\+/g, '\\');

  if (!cleaned) return 'Computer';
  if (cleaned === 'Computer') return 'Computer';

  return `${cleaned.replace(/\\+$/g, '')}\\`;
}

function validateRegistryPath(path: string): boolean {
  if (path.length > 500) return false;

  return !/[&|<>;`]/.test(path);
}

function readString(
  item: RawRegistryItem,
  keys: string[],
  fallback = '',
): string {
  for (const key of keys) {
    const value = item[key];

    if (typeof value === 'string') {
      return value;
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }

    if (typeof value === 'boolean') {
      return value ? 'true' : 'false';
    }
  }

  return fallback;
}

function readBoolean(item: RawRegistryItem, keys: string[], fallback = false) {
  for (const key of keys) {
    const value = item[key];

    if (typeof value === 'boolean') {
      return value;
    }
  }

  return fallback;
}

function normalizeData(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function buildChildPath(parentPath: string, childName: string) {
  const parent = normalizeRegistryPath(parentPath);
  const child = childName.trim().replace(/^\\+|\\+$/g, '');

  if (!child) return parent;
  if (parent === 'Computer') return `${child}\\`;

  return `${parent.replace(/\\+$/g, '')}\\${child}\\`;
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
    .maybeSingle<DeviceRegistryRow>();

  if (error) {
    throw new Error(`Erro ao localizar dispositivo: ${error.message}`);
  }

  return data;
}

async function fetchRegistry(input: {
  agentId: string;
  path: string;
  page: number;
  pageSize: number;
}) {
  const apiUrl = getOperationsApiUrl();
  const apiKey = getOperationsApiKey();

  const url = new URL(
    `${apiUrl}/agents/${encodeURIComponent(input.agentId)}/registry/`,
  );

  url.searchParams.set('path', input.path);
  url.searchParams.set('page', String(input.page));
  url.searchParams.set('page_size', String(input.pageSize));

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'X-API-KEY': apiKey,
      Accept: 'application/json',
    },
    cache: 'no-store',
  });

  const data = (await response.json()) as RawRegistryPayload;

  if (!response.ok) {
    throw new Error('Não foi possível consultar o registro do dispositivo.');
  }

  return data;
}

export async function GET(request: NextRequest, context: RegistryRouteContext) {
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
    const registryPath = normalizeRegistryPath(
      request.nextUrl.searchParams.get('path'),
    );
    const page = Number(request.nextUrl.searchParams.get('page') ?? '1');
    const pageSize = Number(request.nextUrl.searchParams.get('pageSize') ?? '400');

    if (!validateRegistryPath(registryPath)) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Caminho inválido.',
        },
        { status: 400 },
      );
    }

    const safePage = Number.isInteger(page) && page > 0 && page <= 100 ? page : 1;
    const safePageSize =
      Number.isInteger(pageSize) && pageSize > 0 && pageSize <= 1000
        ? pageSize
        : 400;

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
            'Usuário sem permissão operacional para consultar registro neste cliente.',
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
          error: 'Dispositivo sem identificador operacional para consulta.',
        },
        { status: 409 },
      );
    }

    const raw = await fetchRegistry({
      agentId,
      path: registryPath,
      page: safePage,
      pageSize: safePageSize,
    });

    return NextResponse.json({
      ok: true,
      path: raw.path ?? registryPath,
      page: raw.page ?? safePage,
      pageSize: raw.page_size ?? safePageSize,
      hasMore: Boolean(raw.has_more),
      device: {
        id: device.id,
        hostname: device.hostname,
        customerId: activeCustomer.customerId,
      },
      keys: (raw.subkeys ?? []).map((item) => {
        const name = readString(item, ['name', 'Name'], 'Não informado');

        return {
          name,
          path: buildChildPath(raw.path ?? registryPath, name),
          hasSubkeys: readBoolean(item, ['hasSubkeys', 'has_subkeys'], false),
        };
      }),
      values: (raw.values ?? []).map((item) => {
        const name = readString(item, ['name', 'Name'], '');
        const type = readString(item, ['type', 'Type'], 'REG_SZ');
        const data = item.data ?? item.Data ?? item.value ?? item.Value ?? '';

        return {
          name,
          type,
          data: normalizeData(data),
          path: raw.path ?? registryPath,
        };
      }),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : 'Erro interno ao consultar registro.',
      },
      { status: 500 },
    );
  }
}
