import { NextRequest, NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { createTrmmSite, findTrmmClientByIdOrName } from '@/lib/trmm/api';

export const dynamic = 'force-dynamic';

type CustomerSitesRouteContext = {
  params: Promise<{
    customerId: string;
  }>;
};

type CreateSitePayload = {
  name?: string;
  slug?: string;
  notes?: string;
};

type AccessRow = {
  customer_id: string;
  role: string;
};

type CustomerRow = {
  id: string;
  tactical_client_id: string | null;
};

type LocalSiteInsertResult = {
  saved: boolean;
  siteId: string | null;
  skippedReason?: string;
};

const operationalRoles = new Set(['admin', 'client']);

function cleanString(value?: string | null): string | null {
  const cleaned = value?.trim();

  return cleaned ? cleaned : null;
}

function normalizeRole(role?: string | null): string {
  return cleanString(role)?.toLowerCase() ?? '';
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase();
}

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function isMissingSitesTableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const maybeError = error as { code?: string; message?: string; details?: string };
  const text = [maybeError.code, maybeError.message, maybeError.details]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return (
    text.includes('public.sites') ||
    text.includes("table 'sites'") ||
    text.includes('could not find the table') ||
    text.includes('schema cache') ||
    text.includes('pgrst205') ||
    text.includes('42p01')
  );
}

function sanitizePublicErrorMessage(message: string): string {
  return message
    .replace(/TRMM/g, 'origem operacional')
    .replace(/Tactical/g, 'origem operacional')
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

async function getCustomer(customerId: string): Promise<CustomerRow | null> {
  const supabaseAdmin = getSupabaseAdmin();

  const { data, error } = await supabaseAdmin
    .from('customers')
    .select('id, tactical_client_id')
    .eq('id', customerId)
    .single();

  if (error) {
    throw new Error(`Erro ao localizar cliente: ${error.message}`);
  }

  return data as CustomerRow | null;
}

async function getOrCreateOperationalSite(input: {
  clientId: number;
  siteName: string;
}): Promise<{ siteId: number; alreadyExisted: boolean }> {
  const client = await findTrmmClientByIdOrName({
    clientId: input.clientId,
  });

  const existingSite = client?.sites.find(
    (site) => normalizeName(site.name) === normalizeName(input.siteName),
  );

  if (existingSite) {
    return {
      siteId: existingSite.id,
      alreadyExisted: true,
    };
  }

  const createdSite = await createTrmmSite({
    clientId: input.clientId,
    siteName: input.siteName,
  });

  return {
    siteId: createdSite.siteId,
    alreadyExisted: false,
  };
}

async function trySaveLocalSite(input: {
  customerId: string;
  name: string;
  slug: string;
  siteId: number;
  notes?: string | null;
}): Promise<LocalSiteInsertResult> {
  const supabaseAdmin = getSupabaseAdmin();

  const { data, error } = await supabaseAdmin
    .from('sites')
    .upsert(
      {
        customer_id: input.customerId,
        name: input.name,
        slug: input.slug,
        tactical_site_id: String(input.siteId),
        notes: cleanString(input.notes),
        is_active: true,
      },
      {
        onConflict: 'customer_id,tactical_site_id',
      },
    )
    .select('id')
    .single();

  if (!error) {
    return {
      saved: true,
      siteId: data?.id ?? null,
    };
  }

  if (isMissingSitesTableError(error)) {
    return {
      saved: false,
      siteId: null,
      skippedReason: 'sites_table_missing',
    };
  }

  return {
    saved: false,
    siteId: null,
    skippedReason: error.message,
  };
}

async function triggerGlobalSync(): Promise<boolean> {
  const runnerUrl = process.env.SAFEOPS_SYNC_RUNNER_URL;
  const runnerToken = process.env.SAFEOPS_SYNC_RUNNER_TOKEN;

  if (!runnerUrl || !runnerToken) {
    return false;
  }

  const normalizedRunnerUrl = runnerUrl.endsWith('/run')
    ? runnerUrl
    : `${runnerUrl.replace(/\/+$/, '')}/run`;

  try {
    const response = await fetch(normalizedRunnerUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${runnerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        trigger: 'create-group-ui',
        scope: 'global',
      }),
      cache: 'no-store',
    });

    return response.ok;
  } catch {
    return false;
  }
}

export async function POST(
  request: NextRequest,
  context: CustomerSitesRouteContext,
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

    const { customerId } = await context.params;
    const accessRows = await getUserAccessRows(user.id);

    if (!canManageCustomer({ accessRows, customerId })) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Usuário sem permissão para criar grupos neste cliente.',
        },
        { status: 403 },
      );
    }

    const payload = (await request.json()) as CreateSitePayload;
    const name = cleanString(payload.name);
    const slug = slugify(cleanString(payload.slug) ?? name ?? '');

    if (!name) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Informe o nome do grupo.',
        },
        { status: 400 },
      );
    }

    if (!slug) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Informe um slug válido.',
        },
        { status: 400 },
      );
    }

    const customer = await getCustomer(customerId);
    const operationalClientId = Number(customer?.tactical_client_id);

    if (!customer || !Number.isFinite(operationalClientId)) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'Este cliente não possui ID operacional vinculado. Sincronize ou recadastre o cliente antes de criar grupos.',
        },
        { status: 400 },
      );
    }

    const operationalSite = await getOrCreateOperationalSite({
      clientId: operationalClientId,
      siteName: name,
    });

    const localSave = await trySaveLocalSite({
      customerId,
      name,
      slug,
      siteId: operationalSite.siteId,
      notes: payload.notes,
    });

    const syncRequested = await triggerGlobalSync();

    const warnings: string[] = [];

    if (!localSave.saved && localSave.skippedReason === 'sites_table_missing') {
      warnings.push(
        'Tabela local de grupos não existe; o grupo foi criado na origem operacional e será exibido após a sincronização.',
      );
    } else if (!localSave.saved && localSave.skippedReason) {
      warnings.push(
        `Grupo criado na origem operacional, mas não foi possível salvar o cache local: ${localSave.skippedReason}`,
      );
    }

    if (!syncRequested) {
      warnings.push('Sincronização automática não foi disparada. Use o botão Atualizar para sincronizar a tela.');
    }

    return NextResponse.json({
      ok: true,
      siteId: localSave.siteId,
      operationalSiteId: String(operationalSite.siteId),
      alreadyExisted: operationalSite.alreadyExisted,
      syncRequested,
      warnings,
      message:
        warnings.length > 0
          ? 'Grupo criado. Verifique os avisos de sincronização.'
          : 'Grupo criado com sucesso.',
    });
  } catch (error) {
    const rawMessage =
      error instanceof Error ? error.message : 'Erro interno ao criar grupo.';

    return NextResponse.json(
      {
        ok: false,
        error: sanitizePublicErrorMessage(rawMessage),
      },
      { status: 500 },
    );
  }
}
