import { NextRequest, NextResponse } from 'next/server';

import { resolveCurrentCustomer } from '@/lib/data/get-current-customer';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type EventLogRouteContext = {
  params: Promise<{
    deviceId: string;
  }>;
};

type DeviceEventLogRow = {
  id: string;
  customer_id: string;
  hostname: string;
  tactical_agent_id: string | null;
};

type RawEventItem = Record<string, unknown>;

type EventLogName = 'Application' | 'System' | 'Security';

const allowedOperationalRoles = new Set(['admin', 'client']);
const allowedLogs = new Set<EventLogName>(['Application', 'System', 'Security']);

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

function readString(
  item: RawEventItem,
  keys: string[],
  fallback = 'Não informado',
): string {
  for (const key of keys) {
    const value = item[key];

    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
  }

  return fallback;
}

function normalizeUnknownValue(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }

  return null;
}

function findNestedValue(
  value: unknown,
  keyNames: string[],
  depth = 0,
): string | null {
  if (depth > 4 || value === null || value === undefined) {
    return null;
  }

  const directValue = normalizeUnknownValue(value);

  if (directValue) {
    return directValue;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findNestedValue(item, keyNames, depth + 1);

      if (found) {
        return found;
      }
    }

    return null;
  }

  if (typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;
  const normalizedKeys = keyNames.map((key) => key.toLowerCase());

  for (const [key, itemValue] of Object.entries(record)) {
    if (normalizedKeys.includes(key.toLowerCase())) {
      const found = findNestedValue(itemValue, keyNames, depth + 1);

      if (found) {
        return found;
      }
    }
  }

  for (const itemValue of Object.values(record)) {
    const found = findNestedValue(itemValue, keyNames, depth + 1);

    if (found) {
      return found;
    }
  }

  return null;
}

function readEventId(item: RawEventItem): string {
  const direct = findNestedValue(item, [
    'event_id',
    'eventid',
    'eventId',
    'EventID',
    'EventId',
    'id',
    'Id',
    'event_identifier',
    'EventIdentifier',
    'event_code',
    'EventCode',
    'eventCode',
  ]);

  if (direct) {
    return direct;
  }

  const xml = readString(item, ['xml', 'Xml', 'event_xml', 'EventXml'], '');

  if (xml) {
    const match = xml.match(/<EventID[^>]*>([^<]+)<\/EventID>/i);

    if (match?.[1]?.trim()) {
      return match[1].trim();
    }
  }

  return '—';
}

function readEventArray(data: unknown): RawEventItem[] {
  if (Array.isArray(data)) {
    return data.filter((item): item is RawEventItem => {
      return typeof item === 'object' && item !== null && !Array.isArray(item);
    });
  }

  if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
    const candidate = data as Record<string, unknown>;

    for (const key of ['events', 'results', 'data', 'items', 'logs']) {
      const value = candidate[key];

      if (Array.isArray(value)) {
        return value.filter((item): item is RawEventItem => {
          return typeof item === 'object' && item !== null && !Array.isArray(item);
        });
      }
    }
  }

  return [];
}

function normalizeLevel(rawLevel: string) {
  const normalized = rawLevel.toLowerCase();

  if (
    normalized === '1' ||
    normalized.includes('critical') ||
    normalized.includes('crítico')
  ) {
    return 'Critical';
  }

  if (
    normalized === '2' ||
    normalized.includes('error') ||
    normalized.includes('erro')
  ) {
    return 'Error';
  }

  if (
    normalized === '3' ||
    normalized.includes('warning') ||
    normalized.includes('aviso') ||
    normalized.includes('warn')
  ) {
    return 'Warning';
  }

  if (
    normalized === '4' ||
    normalized.includes('information') ||
    normalized.includes('informação') ||
    normalized.includes('info')
  ) {
    return 'Information';
  }

  return rawLevel || 'Não informado';
}

function validateLogName(value: string | null): EventLogName {
  if (value && allowedLogs.has(value as EventLogName)) {
    return value as EventLogName;
  }

  return 'Application';
}

function validatePage(value: string | null): number {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
    return 1;
  }

  return parsed;
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
    .maybeSingle<DeviceEventLogRow>();

  if (error) {
    throw new Error(`Erro ao localizar dispositivo: ${error.message}`);
  }

  return data;
}

async function fetchDeviceEvents(input: {
  agentId: string;
  logName: EventLogName;
  page: number;
}) {
  const apiUrl = getOperationsApiUrl();
  const apiKey = getOperationsApiKey();

  const response = await fetch(
    `${apiUrl}/agents/${encodeURIComponent(
      input.agentId,
    )}/eventlog/${encodeURIComponent(input.logName)}/${input.page}/`,
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

  let data: unknown = null;

  if (contentType.includes('application/json')) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    console.error('Erro ao consultar eventos do dispositivo:', {
      status: response.status,
      body: text,
    });

    throw new Error('Não foi possível consultar os eventos do dispositivo.');
  }

  return readEventArray(data);
}

export async function GET(request: NextRequest, context: EventLogRouteContext) {
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
    const logName = validateLogName(request.nextUrl.searchParams.get('log'));
    const page = validatePage(request.nextUrl.searchParams.get('page'));

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
            'Usuário sem permissão operacional para consultar eventos neste cliente.',
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

    const events = await fetchDeviceEvents({
      agentId,
      logName,
      page,
    });

    return NextResponse.json({
      ok: true,
      logName,
      page,
      total: events.length,
      device: {
        id: device.id,
        hostname: device.hostname,
        customerId: activeCustomer.customerId,
      },
      events: events.map((event, index) => {
        const eventId = readEventId(event);
        const level = normalizeLevel(
          readString(
            event,
            ['level', 'Level', 'type', 'Type', 'entry_type', 'EntryType'],
            'Não informado',
          ),
        );
        const source = readString(
          event,
          ['source', 'Source', 'provider', 'ProviderName', 'provider_name'],
          'Não informado',
        );
        const provider = readString(
          event,
          ['provider', 'ProviderName', 'provider_name', 'source', 'Source'],
          source,
        );
        const timeGenerated = readString(
          event,
          [
            'time_generated',
            'TimeGenerated',
            'created',
            'Created',
            'time',
            'TimeCreated',
            'timestamp',
          ],
          'Não informado',
        );
        const message = readString(
          event,
          ['message', 'Message', 'description', 'Description'],
          '',
        );

        return {
          id: `${logName}-${page}-${eventId}-${index}`,
          timeGenerated,
          source,
          eventId,
          level,
          message,
          logName,
          provider,
          raw: event,
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
            : 'Erro interno ao consultar eventos.',
      },
      { status: 500 },
    );
  }
}
