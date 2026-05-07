import { NextRequest, NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

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
  tacticalSiteId?: string;
};

type AccessRow = {
  customer_id: string;
  role: string;
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
      row.customer_id === input.customerId &&
      operationalRoles.has(row.role),
  );
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
          error: 'Usuário sem permissão para criar sites neste cliente.',
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
          error: 'Informe o nome do site.',
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

    const supabaseAdmin = getSupabaseAdmin();

    const { data, error } = await supabaseAdmin
      .from('sites')
      .insert({
        customer_id: customerId,
        name,
        slug,
        tactical_site_id: cleanString(payload.tacticalSiteId),
        notes: cleanString(payload.notes),
        is_active: true,
      })
      .select('id')
      .single();

    if (error) {
      throw new Error(`Erro ao criar site: ${error.message}`);
    }

    return NextResponse.json({
      ok: true,
      siteId: data.id,
      message: 'Site criado com sucesso.',
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : 'Erro interno ao criar site.',
      },
      { status: 500 },
    );
  }
}
