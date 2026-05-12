import { NextRequest, NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { fetchTrmmApi, fetchTrmmClients } from '@/lib/trmm/api';

export const dynamic = 'force-dynamic';

type AccessRow = { customer_id: string; role: string };
type CustomerRow = { id: string; name: string; tactical_client_id: number | null };

type Agent = {
  agent_id: string;
  hostname?: string | null;
  site_name?: string | null;
  monitoring_type?: string | null;
  status?: string | null;
  operating_system?: string | null;
  last_seen?: string | null;
  needs_reboot?: boolean;
  failing_checks?: { error?: boolean; warning?: boolean } | null;
  checks?: unknown[];
};

type RawCheck = Record<string, unknown>;

function clean(value?: string | null) {
  const v = value?.trim();
  return v ? v : null;
}

function norm(value?: string | null) {
  return (value ?? '').trim().toLowerCase();
}

function getStr(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }

  return null;
}

function getBool(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'boolean') return value;
  }

  return null;
}

function isAdmin(rows: AccessRow[]) {
  return rows.some((row) => norm(row.role) === 'admin');
}

function canAccess(rows: AccessRow[], customerId: string) {
  return isAdmin(rows) || rows.some((row) => row.customer_id === customerId);
}

function deviceType(agent: Agent) {
  const text = [agent.monitoring_type, agent.operating_system, agent.hostname]
    .map((item) => norm(item))
    .join(' ');

  return text.includes('server') || norm(agent.hostname).startsWith('srv-')
    ? 'server'
    : 'workstation';
}

function checkType(value?: string | null) {
  const v = norm(value);

  if (v.includes('disk')) return 'Disco';
  if (v.includes('cpu')) return 'CPU';
  if (v.includes('memory') || v.includes('ram')) return 'Memória';
  if (v.includes('service')) return 'Serviço';
  if (v.includes('script')) return 'Script';
  if (v.includes('event')) return 'Event Log';
  if (v.includes('ping')) return 'Ping';

  return value ?? 'Outro';
}

function checkStatus(record: RawCheck) {
  const raw = norm(getStr(record, ['status', 'result', 'state', 'check_status', 'alert_status']));
  const error =
    getBool(record, ['error', 'is_error', 'has_error']) === true ||
    raw.includes('fail') ||
    raw.includes('error') ||
    raw.includes('crit');

  if (error) return { status: 'error', severity: 'critical' };

  const warning =
    getBool(record, ['warning', 'is_warning', 'has_warning']) === true ||
    raw.includes('warn') ||
    raw.includes('alert');

  if (warning) return { status: 'warning', severity: 'warning' };

  const ok =
    raw.includes('ok') ||
    raw.includes('pass') ||
    raw.includes('success') ||
    raw.includes('normal');

  if (ok) return { status: 'ok', severity: 'info' };

  return { status: 'unknown', severity: 'info' };
}

function normalizeCheck(raw: RawCheck, index: number) {
  const type = checkType(
    getStr(raw, ['check_type', 'type', 'kind', 'monitor_type', 'category']),
  );
  const status = checkStatus(raw);

  return {
    id: getStr(raw, ['id', 'pk', 'check_id', 'uuid']) ?? `check-${index}`,
    name:
      getStr(raw, ['name', 'check_name', 'title', 'description', 'display_name']) ??
      `${type} check`,
    type,
    status: status.status,
    severity: status.severity,
    value: getStr(raw, ['value', 'output', 'details', 'last_output', 'last_result', 'result_text']),
    threshold: getStr(raw, [
      'threshold',
      'warning_threshold',
      'critical_threshold',
      'warn_threshold',
      'fail_threshold',
    ]),
    lastRun: getStr(raw, ['last_run', 'last_check', 'checked_at', 'updated_at', 'modified']),
    enabled: getBool(raw, ['enabled', 'is_active', 'active']) ?? true,
  };
}

async function userFromSession() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes('session') || msg.includes('jwt')) return null;
    throw new Error(`Erro ao validar usuário autenticado: ${error.message}`);
  }

  return user ?? null;
}

async function accessRows(userId: string): Promise<AccessRow[]> {
  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from('user_customer_access')
    .select('customer_id, role')
    .eq('user_id', userId);

  if (error) throw new Error(`Erro ao buscar permissões: ${error.message}`);

  return ((data ?? []) as unknown as AccessRow[]).map((row) => ({
    customer_id: row.customer_id,
    role: norm(row.role),
  }));
}

async function customer(customerId: string): Promise<CustomerRow | null> {
  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from('customers')
    .select('id, name, tactical_client_id')
    .eq('id', customerId)
    .maybeSingle();

  if (error) throw new Error(`Erro ao localizar cliente: ${error.message}`);

  return data as CustomerRow | null;
}

async function resolveClientId(row: CustomerRow) {
  if (row.tactical_client_id && row.tactical_client_id > 0) {
    return row.tactical_client_id;
  }

  const clients = await fetchTrmmClients();
  const found = clients.find((item) => norm(item.name) === norm(row.name));

  if (!found) {
    throw new Error(`Cliente "${row.name}" não encontrado na base de monitoramento.`);
  }

  await getSupabaseAdmin()
    .from('customers')
    .update({ tactical_client_id: found.id, updated_at: new Date().toISOString() })
    .eq('id', row.id);

  return found.id;
}

async function fetchChecks(agentId: string): Promise<RawCheck[]> {
  const paths = [
    `/checks/${encodeURIComponent(agentId)}/`,
    `/checks/?agent=${encodeURIComponent(agentId)}`,
    `/agents/${encodeURIComponent(agentId)}/checks/`,
  ];

  for (const path of paths) {
    try {
      const response = await fetchTrmmApi<unknown>(path, { method: 'GET' });

      if (Array.isArray(response)) return response as RawCheck[];

      if (
        typeof response === 'object' &&
        response !== null &&
        Array.isArray((response as Record<string, unknown>).checks)
      ) {
        return (response as { checks: RawCheck[] }).checks;
      }
    } catch {
      // tenta próximo formato
    }
  }

  return [];
}

async function summarize(agent: Agent) {
  const rawChecks =
    Array.isArray(agent.checks) && agent.checks.length
      ? (agent.checks as RawCheck[])
      : await fetchChecks(agent.agent_id);

  const checks = rawChecks.map(normalizeCheck);
  const warnings =
    checks.filter((check) => check.status === 'warning').length +
    (agent.failing_checks?.warning && checks.length === 0 ? 1 : 0);
  const critical =
    checks.filter((check) => check.status === 'error').length +
    (agent.failing_checks?.error && checks.length === 0 ? 1 : 0);
  const ok = checks.filter((check) => check.status === 'ok').length;

  return {
    agentId: agent.agent_id,
    hostname: agent.hostname ?? agent.agent_id,
    siteName: agent.site_name ?? null,
    status: agent.status ?? 'unknown',
    deviceType: deviceType(agent),
    operatingSystem: agent.operating_system ?? null,
    lastSeen: agent.last_seen ?? null,
    needsReboot: agent.needs_reboot === true,
    checks,
    checksTotal: checks.length,
    checksOk: ok,
    checksWarning: warnings,
    checksCritical: critical,
    hasNativeCheckDetails: checks.length > 0,
  };
}

export async function GET(request: NextRequest) {
  try {
    const user = await userFromSession();

    if (!user) {
      return NextResponse.json(
        { ok: false, error: 'Usuário não autenticado.', devices: [] },
        { status: 401 },
      );
    }

    const customerId = clean(request.nextUrl.searchParams.get('customerId'));

    if (!customerId) {
      return NextResponse.json(
        { ok: false, error: 'Informe o cliente.', devices: [] },
        { status: 400 },
      );
    }

    const rows = await accessRows(user.id);

    if (!canAccess(rows, customerId)) {
      return NextResponse.json(
        { ok: false, error: 'Usuário sem permissão para acessar este cliente.', devices: [] },
        { status: 403 },
      );
    }

    const customerRow = await customer(customerId);

    if (!customerRow) {
      return NextResponse.json(
        { ok: false, error: 'Cliente não encontrado.', devices: [] },
        { status: 404 },
      );
    }

    const clientId = await resolveClientId(customerRow);
    const agents = await fetchTrmmApi<Agent[]>(
      `/agents/?client=${encodeURIComponent(String(clientId))}`,
      { method: 'GET' },
    );
    const devices = await Promise.all(agents.map(summarize));

    const totals = devices.reduce(
      (acc, device) => {
        acc.devices += 1;
        acc.online += norm(device.status) === 'online' ? 1 : 0;
        acc.offline += norm(device.status) !== 'online' ? 1 : 0;
        acc.servers += device.deviceType === 'server' ? 1 : 0;
        acc.workstations += device.deviceType === 'workstation' ? 1 : 0;
        acc.checks += device.checksTotal;
        acc.warning += device.checksWarning;
        acc.critical += device.checksCritical;
        acc.reboot += device.needsReboot ? 1 : 0;
        return acc;
      },
      {
        devices: 0,
        online: 0,
        offline: 0,
        servers: 0,
        workstations: 0,
        checks: 0,
        warning: 0,
        critical: 0,
        reboot: 0,
      },
    );

    return NextResponse.json({
      ok: true,
      customer: { id: customerRow.id, name: customerRow.name, tactical_client_id: clientId },
      totals,
      devices,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Erro interno ao carregar monitoramento.',
        devices: [],
      },
      { status: 500 },
    );
  }
}
