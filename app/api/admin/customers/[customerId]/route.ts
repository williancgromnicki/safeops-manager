import { NextRequest, NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type CustomerRouteContext = {
  params: Promise<{
    customerId: string;
  }>;
};

type UpdateCustomerPayload = {
  name?: string;
  slug?: string;
  notes?: string;
  tacticalClientId?: string;
  windowsAgentUrl?: string;
  linuxAgentUrl?: string;
  macosAgentUrl?: string;
  isActive?: boolean;
};

type AccessRow = {
  customer_id: string;
  role: string;
};

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

function isSafesysAdmin(accessRows: AccessRow[]): boolean {
  return accessRows.some((row) => row.role === 'admin');
}

async function assertSafesysAdmin(userId: string) {
  const accessRows = await getUserAccessRows(userId);

  if (!isSafesysAdmin(accessRows)) {
    throw new Error('Forbidden');
  }
}

export async function PATCH(
  request: NextRequest,
  context: CustomerRouteContext,
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

    await assertSafesysAdmin(user.id);

    const { customerId } = await context.params;
    const payload = (await request.json()) as UpdateCustomerPayload;

    const name = cleanString(payload.name);
    const slug = cleanString(payload.slug)
      ? slugify(cleanString(payload.slug) ?? '')
      : name
        ? slugify(name)
        : null;

    if (!name) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Informe o nome do cliente.',
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

    const { error } = await supabaseAdmin
      .from('customers')
      .update({
        name,
        slug,
        tactical_client_id: cleanString(payload.tacticalClientId),
        trmm_windows_agent_url: cleanString(payload.windowsAgentUrl),
        trmm_linux_agent_url: cleanString(payload.linuxAgentUrl),
        trmm_macos_agent_url: cleanString(payload.macosAgentUrl),
        notes: cleanString(payload.notes),
        is_active: payload.isActive !== false,
      })
      .eq('id', customerId);

    if (error) {
      throw new Error(`Erro ao atualizar cliente: ${error.message}`);
    }

    return NextResponse.json({
      ok: true,
      message: 'Cliente atualizado com sucesso.',
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Erro interno ao atualizar cliente.';

    if (message === 'Forbidden') {
      return NextResponse.json(
        {
          ok: false,
          error: 'Usuário sem permissão para atualizar clientes.',
        },
        { status: 403 },
      );
    }

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status: 500 },
    );
  }
}
