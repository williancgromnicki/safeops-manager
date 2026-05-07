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
  const cleaned = path?.trim().replace(/\//g, '\\').replace(/\\+/g, '\\');

  return cleaned || 'Computer';
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

    if (typeof value === 'string' && value.trim()) {
      return value.trim();
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

function readArray(value: unknown): RawRegistryItem[] {
  if (!Array.isArray(value)) return [];

  return value.filter((item): item is RawRegistryItem => {
    return typeof item === 'object' && item !== null && !Array.isArray(item);
  });
}

function getLastPathSegment(path: string) {
  const parts = path.split('\\').filter(Boolean);

  return parts[parts.length - 1] ?? path;
}

function buildChildPath(parentPath: string, childName: string) {
  const normalizedParent = normalizeRegistryPath(parentPath);
  const normalizedChild = childName.trim();

  if (!normalizedChild) return normalizedParent;
  if (normalizedChild.includes('\\')) return normalizeRegistryPath(normalizedChild);
  if (normalizedParent === 'Computer') return `Computer\\${normalizedChild}`;

  return `${normalizedParent}\\${normalizedChild}`;
}

function normalizeRegistryPayload(data: unknown, requestedPath: string) {
  const keys: RawRegistryItem[] = [];
  const values: RawRegistryItem[] = [];

  if (Array.isArray(data)) {
    for (const item of readArray(data)) {
      const itemType = readString(item, ['kind', 'type', 'item_type'], '').toLowerCase();

      if (
        itemType.includes('key') ||
        itemType.includes('folder') ||
        itemType.includes('subkey')
      ) {
        keys.push(item);
        continue;
      }

      values.push(item);
    }

    return { keys, values };
  }

  if (typeof data !== 'object' || data === null) {
    return { keys, values };
  }

  const payload = data as Record<string, unknown>;

  keys.push(
    ...readArray(payload.keys),
    ...readArray(payload.subkeys),
    ...readArray(payload.children),
    ...readArray(payload.folders),
  );

  values.push(
    ...readArray(payload.values),
    ...readArray(payload.data),
    ...readArray(payload.items),
  );

  if (keys.length === 0 && values.length === 0) {
    for (const value of Object.values(payload)) {
      if (Array.isArray(value)) {
        for (const item of readArray(value)) {
          const itemType = readString(
            item,
            ['kind', 'type', 'item_type'],
            '',
          ).toLowerCase();

          if (
            itemType.includes('key') ||
            itemType.includes('folder') ||
            itemType.includes('subkey')
          ) {
            keys.push(item);
          } else {
            values.push(item);
          }
        }
      }
    }
  }

  return { keys, values };
}

function normalizeRegistryValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return String(value);
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
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
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  });

  const contentType = response.headers.get('content-type') ?? '';
  const text = await response.text();

  let data: unknown = null;

  if (contentType.includes('application/json')) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    console.error('Erro ao consultar registro do dispositivo:', {
      status: response.status,
      body: text,
    });

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

    const normalized = normalizeRegistryPayload(raw, registryPath);

    return NextResponse.json({
      ok: true,
      path: registryPath,
      page: safePage,
      pageSize: safePageSize,
      device: {
        id: device.id,
        hostname: device.hostname,
        customerId: activeCustomer.customerId,
      },
      keys: normalized.keys.map((item, index) => {
        const itemPath = readString(item, ['path', 'full_path', 'key_path'], '');
        const name = readString(
          item,
          ['name', 'key', 'display_name', 'Name'],
          itemPath ? getLastPathSegment(itemPath) : `Chave ${index + 1}`,
        );
        const path = itemPath || buildChildPath(registryPath, name);

        return {
          name,
          path,
          lastModified: readString(
            item,
            ['last_modified', 'modified', 'LastWriteTime'],
            '',
          ),
          raw: item,
        };
      }),
      values: normalized.values.map((item, index) => {
        const name = readString(
          item,
          ['name', 'value_name', 'Name'],
          index === 0 ? '(Padrão)' : `Valor ${index + 1}`,
        );
        const type = readString(
          item,
          ['value_type', 'type', 'kind', 'Type'],
          'Não informado',
        );

        const rawValue =
          item.value ??
          item.data ??
          item.Value ??
          item.Data ??
          item.content ??
          item.Content ??
          '';

        return {
          name,
          type,
          value: normalizeRegistryValue(rawValue),
          path: registryPath,
          raw: item,
        };
      }),
      raw,
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
