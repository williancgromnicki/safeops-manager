import { NextRequest, NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type AccessRow = {
  customer_id: string;
  role: string;
};

type PolicyPayload = {
  id?: string | null;
  customerId?: string | null;

  name?: string | null;
  alertType?: string | null;

  // Campo interno. Não deve ser usado como label na interface.
  implementation?: 'native' | 'safesys';

  checkName?: string | null;
  scopeType?: 'customer' | 'site' | 'device';
  siteName?: string | null;
  deviceId?: string | null;
  agentId?: string | null;
  hostname?: string | null;

  enabled?: boolean;
  warnPercent?: number | null;
  critPercent?: number | null;
  frequencyMinutes?: number;

  alertEmails?: string[];
  notifyOnRecovery?: boolean;

  visibleParameters?: Record<string, unknown>;
  protectedParameters?: Record<string, unknown>;
};

const allowedScopes = new Set(['customer', 'site', 'device']);
const allowedImplementations = new Set(['native', 'safesys']);
const allowedFrequencies = new Set([5, 10, 15, 30, 60, 120, 240, 720, 1440]);

function clean(value?: string | null) {
  const cleaned = value?.trim();
  return cleaned ? cleaned : null;
}

function normalize(value?: string | null) {
  return (value ?? '').trim().toLowerCase();
}

function isUuid(value?: string | null) {
  return Boolean(
    value &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value,
      ),
  );
}

function normalizeEmails(emails?: string[]) {
  return Array.from(
    new Set(
      (emails ?? [])
        .map((email) => email.trim().toLowerCase())
        .filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)),
    ),
  );
}

function toInt(value: unknown, fallback: number) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value === 'string' && Number.isFinite(Number(value))) {
    return Math.trunc(Number(value));
  }

  return fallback;
}

function toNullableInt(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value === 'string' && Number.isFinite(Number(value))) {
    return Math.trunc(Number(value));
  }

  return null;
}

function isAdmin(rows: AccessRow[]) {
  return rows.some((row) => normalize(row.role) === 'admin');
}

function canAccess(rows: AccessRow[], customerId: string) {
  return isAdmin(rows) || rows.some((row) => row.customer_id === customerId);
}

async function getAuthenticatedUser() {
  const supabase = await createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    const message = error.message.toLowerCase();

    if (message.includes('session') || message.includes('jwt')) {
      return null;
    }

    throw new Error(`Erro ao validar usuário autenticado: ${error.message}`);
  }

  return user ?? null;
}

async function getAccessRows(userId: string): Promise<AccessRow[]> {
  const supabaseAdmin = getSupabaseAdmin();

  const { data, error } = await supabaseAdmin
    .from('user_customer_access')
    .select('customer_id, role')
    .eq('user_id', userId);

  if (error) {
    throw new Error(`Erro ao buscar permissões: ${error.message}`);
  }

  return ((data ?? []) as unknown as AccessRow[]).map((row) => ({
    customer_id: row.customer_id,
    role: normalize(row.role),
  }));
}

async function getCustomer(customerId: string) {
  const supabaseAdmin = getSupabaseAdmin();

  const { data, error } = await supabaseAdmin
    .from('customers')
    .select('id, name')
    .eq('id', customerId)
    .maybeSingle();

  if (error) {
    throw new Error(`Erro ao localizar cliente: ${error.message}`);
  }

  return data as { id: string; name: string } | null;
}

function buildSafesysMemoryProtectedParameters(input: {
  customerName: string;
  siteName: string | null;
  checkName: string;
}) {
  return {
    webhook_url: 'SAFEOPS_MANAGED',
    webhook_token: 'SAFEOPS_MANAGED',
    client_name: input.customerName,
    site_name: input.siteName ?? 'Site',
    check_name: input.checkName,
  };
}

function buildDefaultPolicy(input: {
  payload: PolicyPayload;
  customerName: string;
}) {
  const alertType = clean(input.payload.alertType) ?? 'memory';
  const implementation = allowedImplementations.has(input.payload.implementation ?? '')
    ? input.payload.implementation ?? 'native'
    : 'native';

  const defaultCheckName =
    implementation === 'safesys' && alertType === 'memory'
      ? '[SAFESYS] Windows Memory check'
      : `${alertType} check`;

  const checkName = clean(input.payload.checkName) ?? defaultCheckName;
  const name = clean(input.payload.name) ?? checkName;

  const scopeType = allowedScopes.has(input.payload.scopeType ?? '')
    ? input.payload.scopeType ?? 'customer'
    : 'customer';

  const siteName = scopeType === 'site' ? clean(input.payload.siteName) : null;

  const warnPercent = toNullableInt(input.payload.warnPercent);
  const critPercent = toNullableInt(input.payload.critPercent);

  const visibleParameters = {
    ...(input.payload.visibleParameters ?? {}),
    ...(warnPercent !== null ? { warn_percent: warnPercent } : {}),
    ...(critPercent !== null ? { crit_percent: critPercent } : {}),
    notify_on_recovery: input.payload.notifyOnRecovery === true,
  };

  const protectedParameters =
    implementation === 'safesys' && alertType === 'memory'
      ? buildSafesysMemoryProtectedParameters({
          customerName: input.customerName,
          siteName,
          checkName,
        })
      : input.payload.protectedParameters ?? {};

  return {
    name,
    alertType,
    implementation,
    checkName,
    scopeType,
    siteName,
    warnPercent,
    critPercent,
    visibleParameters,
    protectedParameters,
  };
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        { ok: false, error: 'Usuário não autenticado.', policies: [] },
        { status: 401 },
      );
    }

    const customerId = clean(request.nextUrl.searchParams.get('customerId'));

    if (!customerId) {
      return NextResponse.json(
        { ok: false, error: 'Informe o cliente.', policies: [] },
        { status: 400 },
      );
    }

    const accessRows = await getAccessRows(user.id);

    if (!canAccess(accessRows, customerId)) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Usuário sem permissão para acessar este cliente.',
          policies: [],
        },
        { status: 403 },
      );
    }

    const { data, error } = await getSupabaseAdmin()
      .from('monitoring_alert_policies')
      .select('*')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Erro ao carregar políticas: ${error.message}`);
    }

    return NextResponse.json({
      ok: true,
      policies: data ?? [],
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : 'Erro interno ao carregar políticas.',
        policies: [],
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        { ok: false, error: 'Usuário não autenticado.' },
        { status: 401 },
      );
    }

    const payload = (await request.json()) as PolicyPayload;
    const customerId = clean(payload.customerId);

    if (!customerId) {
      return NextResponse.json(
        { ok: false, error: 'Informe o cliente.' },
        { status: 400 },
      );
    }

    const accessRows = await getAccessRows(user.id);

    if (!canAccess(accessRows, customerId)) {
      return NextResponse.json(
        { ok: false, error: 'Usuário sem permissão para alterar este cliente.' },
        { status: 403 },
      );
    }

    const customer = await getCustomer(customerId);

    if (!customer) {
      return NextResponse.json(
        { ok: false, error: 'Cliente não encontrado.' },
        { status: 404 },
      );
    }

    const normalizedPolicy = buildDefaultPolicy({
      payload,
      customerName: customer.name,
    });

    const frequencyMinutes = toInt(payload.frequencyMinutes, 15);
    const alertEmails = normalizeEmails(payload.alertEmails);

    if (!allowedFrequencies.has(frequencyMinutes)) {
      return NextResponse.json(
        { ok: false, error: 'Frequência inválida.' },
        { status: 400 },
      );
    }

    if (
      normalizedPolicy.warnPercent !== null &&
      (normalizedPolicy.warnPercent < 1 || normalizedPolicy.warnPercent > 100)
    ) {
      return NextResponse.json(
        { ok: false, error: 'Warning deve ficar entre 1% e 100%.' },
        { status: 400 },
      );
    }

    if (
      normalizedPolicy.critPercent !== null &&
      (normalizedPolicy.critPercent < 1 || normalizedPolicy.critPercent > 100)
    ) {
      return NextResponse.json(
        { ok: false, error: 'Crítico deve ficar entre 1% e 100%.' },
        { status: 400 },
      );
    }

    if (
      normalizedPolicy.warnPercent !== null &&
      normalizedPolicy.critPercent !== null &&
      normalizedPolicy.warnPercent >= normalizedPolicy.critPercent
    ) {
      return NextResponse.json(
        { ok: false, error: 'Warning deve ser menor que Crítico.' },
        { status: 400 },
      );
    }

    if (normalizedPolicy.scopeType === 'site' && !normalizedPolicy.siteName) {
      return NextResponse.json(
        { ok: false, error: 'Selecione o grupo/site.' },
        { status: 400 },
      );
    }

    const deviceId =
      normalizedPolicy.scopeType === 'device' && isUuid(payload.deviceId)
        ? payload.deviceId
        : null;
    const agentId =
      normalizedPolicy.scopeType === 'device' ? clean(payload.agentId) : null;
    const hostname =
      normalizedPolicy.scopeType === 'device' ? clean(payload.hostname) : null;

    if (normalizedPolicy.scopeType === 'device' && !agentId) {
      return NextResponse.json(
        { ok: false, error: 'Selecione o dispositivo.' },
        { status: 400 },
      );
    }

    const row = {
      customer_id: customerId,
      name: normalizedPolicy.name,
      alert_type: normalizedPolicy.alertType,
      implementation: normalizedPolicy.implementation,
      check_name: normalizedPolicy.checkName,
      scope_type: normalizedPolicy.scopeType,
      site_name: normalizedPolicy.siteName,
      device_id: deviceId,
      agent_id: agentId,
      hostname,
      enabled: payload.enabled !== false,
      warn_percent: normalizedPolicy.warnPercent,
      crit_percent: normalizedPolicy.critPercent,
      frequency_minutes: frequencyMinutes,
      alert_emails: alertEmails,
      notify_on_recovery: payload.notifyOnRecovery === true,
      visible_parameters: normalizedPolicy.visibleParameters,
      protected_parameters: normalizedPolicy.protectedParameters,
      last_apply_status: 'not_applied',
      last_apply_message:
        'Política salva. Aplicação nos checks será feita no próximo pacote.',
      updated_by_user_id: user.id,
      updated_by_email: user.email ?? null,
      updated_at: new Date().toISOString(),
    };

    const supabaseAdmin = getSupabaseAdmin();

    if (payload.id && isUuid(payload.id)) {
      const { error } = await supabaseAdmin
        .from('monitoring_alert_policies')
        .update(row)
        .eq('id', payload.id)
        .eq('customer_id', customerId);

      if (error) {
        throw new Error(`Erro ao atualizar política: ${error.message}`);
      }

      return NextResponse.json({
        ok: true,
        message: 'Política atualizada com sucesso.',
      });
    }

    const { error } = await supabaseAdmin
      .from('monitoring_alert_policies')
      .insert({
        ...row,
        created_by_user_id: user.id,
        created_by_email: user.email ?? null,
      });

    if (error) {
      throw new Error(`Erro ao salvar política: ${error.message}`);
    }

    return NextResponse.json({
      ok: true,
      message: 'Política salva com sucesso.',
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : 'Erro interno ao salvar política.',
      },
      { status: 500 },
    );
  }
}
