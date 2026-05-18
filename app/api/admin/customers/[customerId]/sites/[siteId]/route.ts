import { NextRequest, NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { fetchTrmmApi, findTrmmClientByIdOrName } from '@/lib/trmm/api';

export const dynamic = 'force-dynamic';

type DeleteSiteRouteContext = {
  params: Promise<{
    customerId: string;
    siteId: string;
  }>;
};

type AccessRow = {
  customer_id: string;
  role: string;
};

type CustomerRow = {
  id: string;
  tactical_client_id: string | null;
};

type OperationalAgent = {
  agent_id?: string | null;
  hostname?: string | null;
  site?: number | null;
  site_name?: string | null;
};

const operationalRoles = new Set(['admin', 'client']);

function cleanString(value?: string | null): string | null {
  const cleaned = value?.trim();
  return cleaned ? cleaned : null;
}

function normalizeRole(role?: string | null): string {
  return cleanString(role)?.toLowerCase() ?? '';
}

function normalize(value?: string | null): string {
  return cleanString(value)?.toLowerCase() ?? '';
}

function parsePositiveInteger(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return Math.floor(parsed);
}

function isMissingSitesTableError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : '';

  const normalized = message.toLowerCase();

  return (
    normalized.includes('public.sites') ||
    normalized.includes("table 'public.sites'") ||
    normalized.includes('schema cache') ||
    normalized.includes('relation "public.sites" does not exist') ||
    normalized.includes('could not find the table')
  );
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
    .maybeSingle<CustomerRow>();

  if (error) {
    throw new Error(`Erro ao localizar cliente: ${error.message}`);
  }

  return data ?? null;
}

async function countLocalDevicesInSite(input: {
  customerId: string;
  siteName: string;
}): Promise<number> {
  const supabaseAdmin = getSupabaseAdmin();

  const { count, error } = await supabaseAdmin
    .from('devices')
    .select('id', { count: 'exact', head: true })
    .eq('customer_id', input.customerId)
    .eq('visible_to_customer', true)
    .ilike('site', input.siteName);

  if (error) {
    throw new Error(`Erro ao validar dispositivos do grupo: ${error.message}`);
  }

  return count ?? 0;
}

async function deleteLocalSiteCache(input: {
  customerId: string;
  siteId: number;
}) {
  const supabaseAdmin = getSupabaseAdmin();

  const { error } = await supabaseAdmin
    .from('sites')
    .delete()
    .eq('customer_id', input.customerId)
    .eq('tactical_site_id', String(input.siteId));

  if (error && !isMissingSitesTableError(error.message)) {
    throw new Error(
      `Grupo removido da origem operacional, mas houve erro ao limpar o cache local: ${error.message}`,
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  context: DeleteSiteRouteContext,
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

    const { customerId, siteId } = await context.params;
    const targetSiteId = parsePositiveInteger(siteId);

    if (!targetSiteId) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Grupo inválido.',
        },
        { status: 400 },
      );
    }

    const accessRows = await getUserAccessRows(user.id);

    if (!canManageCustomer({ accessRows, customerId })) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'Usuário sem permissão operacional para excluir grupos deste cliente.',
        },
        { status: 403 },
      );
    }

    const customer = await getCustomer(customerId);
    const operationalClientId = parsePositiveInteger(customer?.tactical_client_id);

    if (!customer || !operationalClientId) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'Cliente sem vínculo operacional. Sincronize o cliente antes de excluir grupos.',
        },
        { status: 400 },
      );
    }

    const operationalClient = await findTrmmClientByIdOrName({
      clientId: operationalClientId,
    });

    const targetSite = operationalClient?.sites.find(
      (site) => Number(site.id) === targetSiteId,
    );

    if (!targetSite) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'Grupo não encontrado para este cliente. Atualize a lista de grupos e tente novamente.',
        },
        { status: 404 },
      );
    }

    const localDeviceCount = await countLocalDevicesInSite({
      customerId,
      siteName: targetSite.name,
    });

    if (localDeviceCount > 0) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'Este grupo ainda possui dispositivos vinculados. Mova os dispositivos para outro grupo antes de excluir.',
        },
        { status: 409 },
      );
    }

    const operationalAgents = await fetchTrmmApi<OperationalAgent[]>(
      `/agents/?site=${encodeURIComponent(String(targetSiteId))}`,
      {
        method: 'GET',
      },
    );

    const activeOperationalAgents = Array.isArray(operationalAgents)
      ? operationalAgents.filter((agent) => cleanString(agent.agent_id))
      : [];

    if (activeOperationalAgents.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'Este grupo ainda possui agentes na origem operacional. Mova os dispositivos para outro grupo antes de excluir.',
        },
        { status: 409 },
      );
    }

    await fetchTrmmApi<string>(`/clients/sites/${targetSiteId}/`, {
      method: 'DELETE',
      parseAsText: true,
    });

    await deleteLocalSiteCache({
      customerId,
      siteId: targetSiteId,
    });

    return NextResponse.json({
      ok: true,
      message: `Grupo ${targetSite.name} excluído com sucesso.`,
      site: {
        id: targetSiteId,
        name: targetSite.name,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : 'Erro interno ao excluir grupo.',
      },
      { status: 500 },
    );
  }
}
