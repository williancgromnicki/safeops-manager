import { NextRequest, NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type SiteRouteContext = {
  params: Promise<{
    siteId: string;
  }>;
};

type UpdateSitePayload = {
  customerId?: string;
  name?: string;
  slug?: string;
  notes?: string;
  tacticalSiteId?: string;
  isActive?: boolean;
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

export async function PATCH(
  request: NextRequest,
  context: SiteRouteContext,
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

    const { siteId } = await context.params;
    const payload = (await request.json()) as UpdateSitePayload;

    const customerId = cleanString(payload.customerId);
    const name = cleanString(payload.name);
    const slug = slugify(cleanString(payload.slug) ?? name ?? '');

    if (!customerId) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Informe o cliente.',
        },
        { status: 400 },
      );
    }

    if (!name || !slug) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Informe nome e slug válidos.',
        },
        { status: 400 },
      );
    }

    const accessRows = await getUserAccessRows(user.id);

    if (!canManageCustomer({ accessRows, customerId })) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Usuário sem permissão para atualizar sites neste cliente.',
        },
        { status: 403 },
      );
    }

    const supabaseAdmin = getSupabaseAdmin();

    const { error } = await supabaseAdmin
      .from('sites')
      .update({
        name,
        slug,
        tactical_site_id: cleanString(payload.tacticalSiteId),
        notes: cleanString(payload.notes),
        is_active: payload.isActive !== false,
      })
      .eq('id', siteId)
      .eq('customer_id', customerId);

    if (error) {
      throw new Error(`Erro ao atualizar site: ${error.message}`);
    }

    return NextResponse.json({
      ok: true,
      message: 'Site atualizado com sucesso.',
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : 'Erro interno ao atualizar site.',
      },
      { status: 500 },
    );
  }
}
