import { NextRequest, NextResponse } from 'next/server';

import { resolveCurrentCustomer } from '@/lib/data/get-current-customer';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type ProcessesRouteContext = {
  params: Promise<{
    deviceId: string;
  }>;
};

type DeviceProcessesRow = {
  id: string;
  customer_id: string;
  hostname: string;
  tactical_agent_id: string | null;
};

type RawProcessItem = Record<string, unknown>;

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

function readString(
  item: RawProcessItem,
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

function readNumber(item: RawProcessItem, keys: string[], fallback = 0): number {
  for (const key of keys) {
    const value = item[key];

    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string') {
      const parsed = Number(value.replace(',', '.'));

      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return fallback;
}

function readMemoryMb(item: RawProcessItem): number {
  const directMb = readNumber(
    item,
    ['mem_mb', 'memory_mb', 'memoryMb', 'rss_mb'],
    Number.NaN,
  );

  if (Number.isFinite(directMb)) {
    return directMb;
  }

  const bytes = readNumber(
    item,
    ['membytes', 'mem_bytes', 'memory_bytes', 'memory', 'Memory', 'rss'],
    0,
  );

  if (!Number.isFinite(bytes) || bytes <= 0) {
    return 0;
  }

  return bytes / 1024 / 1024;
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
    .maybeSingle<DeviceProcessesRow>();

  if (error) {
    throw new Error(`Erro ao localizar dispositivo: ${error.message}`);
  }

  return data;
}

async function fetchDeviceProcesses(agentId: string) {
  const apiUrl = getOperationsApiUrl();
  const apiKey = getOperationsApiKey();

  const response = await fetch(
    `${apiUrl}/agents/${encodeURIComponent(agentId)}/processes/`,
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
    console.error('Erro ao consultar processos do dispositivo:', {
      status: response.status,
      body: text,
    });

    throw new Error('Não foi possível consultar os processos do dispositivo.');
  }

  if (!Array.isArray(data)) {
    throw new Error('A consulta de processos retornou uma resposta inválida.');
  }

  return data as RawProcessItem[];
}

export async function GET(request: NextRequest, context: ProcessesRouteContext) {
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
            'Usuário sem permissão operacional para consultar processos neste cliente.',
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

    const processes = await fetchDeviceProcesses(agentId);

    return NextResponse.json({
      ok: true,
      device: {
        id: device.id,
        hostname: device.hostname,
        customerId: activeCustomer.customerId,
      },
      processes: processes.map((process) => ({
        pid: readNumber(process, ['pid', 'PID', 'process_id', 'ProcessId']),
        name: readString(process, ['name', 'Name', 'process', 'ProcessName']),
        username: readString(process, [
          'username',
          'user',
          'UserName',
          'owner',
          'Owner',
        ]),
        cpuPercent: readNumber(process, [
          'cpu_percent',
          'cpu',
          'CPU',
          'percent_cpu',
        ]),
        memoryMb: readMemoryMb(process),
        path: readString(process, ['path', 'exe', 'ExecutablePath'], ''),
        commandLine: readString(
          process,
          ['cmdline', 'command_line', 'CommandLine'],
          '',
        ),
        status: readString(process, ['status', 'Status'], ''),
        raw: process,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : 'Erro interno ao consultar processos.',
      },
      { status: 500 },
    );
  }
}
