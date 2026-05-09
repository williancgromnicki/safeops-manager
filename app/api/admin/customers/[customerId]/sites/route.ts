import { NextRequest, NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { createTrmmSite } from '@/lib/trmm/api';

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

const operationalRoles = new Set(['admin', 'client']);

function cleanString(value?: string | null): string | null {
  const cleaned = value?.trim();

  return cleaned ? cleaned : null;
}

function normalizeRole(role?: string | null): string {
  return cleanString(role)?.toLowerCase() ?? '';
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
    const trmmClientId = Number(customer?.tactical_client_id);

    if (!customer || !Number.isFinite(trmmClientId)) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'Este cliente não possui ID do TRMM vinculado. Sincronize ou recadastre o cliente antes de criar grupos.',
        },
        { status: 400 },
      );
    }

    const trmmResult = await createTrmmSite({
      clientId: trmmClientId,
      siteName: name,
    });

    const supabaseAdmin = getSupabaseAdmin();

    const { data, error } = await supabaseAdmin
      .from('sites')
      .insert({
        customer_id: customerId,
        name,
        slug,
        tactical_site_id: String(trmmResult.siteId),
        notes: cleanString(payload.notes),
        is_active: true,
      })
      .select('id')
      .single();

    if (error) {
      throw new Error(`Grupo criado no TRMM, mas falhou ao salvar no SafeOps: ${error.message}`);
    }

    return NextResponse.json({
      ok: true,
      siteId: data.id,
      message: 'Grupo criado com sucesso.',
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : 'Erro interno ao criar grupo.',
      },
      { status: 500 },
    );
  }
}
