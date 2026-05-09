import { NextRequest, NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { deleteTrmmClient, updateTrmmClientName } from '@/lib/trmm/api';

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
};

type AccessRow = {
  customer_id: string;
  role: string;
};

type CustomerRow = {
  id: string;
  name: string;
  slug: string;
  tactical_client_id: string | null;
  notes: string | null;
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

async function getCustomer(customerId: string): Promise<CustomerRow> {
  const supabaseAdmin = getSupabaseAdmin();

  const { data, error } = await supabaseAdmin
    .from('customers')
    .select('id, name, slug, tactical_client_id, notes')
    .eq('id', customerId)
    .single();

  if (error || !data) {
    throw new Error(
      `Cliente não encontrado no SafeOps: ${error?.message ?? customerId}`,
    );
  }

  return data as CustomerRow;
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

    const currentCustomer = await getCustomer(customerId);
    const trmmClientId = Number(currentCustomer.tactical_client_id);

    if (Number.isFinite(trmmClientId)) {
      await updateTrmmClientName({
        clientId: trmmClientId,
        clientName: name,
      });
    }

    const supabaseAdmin = getSupabaseAdmin();

    const { error } = await supabaseAdmin
      .from('customers')
      .update({
        name,
        slug,
        notes: cleanString(payload.notes),
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

export async function DELETE(
  _request: NextRequest,
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
    const currentCustomer = await getCustomer(customerId);
    const trmmClientId = Number(currentCustomer.tactical_client_id);

    if (Number.isFinite(trmmClientId)) {
      await deleteTrmmClient({
        clientId: trmmClientId,
      });
    }

    const supabaseAdmin = getSupabaseAdmin();

    // Limpamos relacionamentos locais antes de excluir o cliente para evitar FK sem cascade.
    await supabaseAdmin.from('sites').delete().eq('customer_id', customerId);
    await supabaseAdmin
      .from('user_customer_access')
      .delete()
      .eq('customer_id', customerId);

    const { error } = await supabaseAdmin
      .from('customers')
      .delete()
      .eq('id', customerId);

    if (error) {
      throw new Error(`Erro ao remover cliente no SafeOps: ${error.message}`);
    }

    return NextResponse.json({
      ok: true,
      message: 'Cliente removido com sucesso.',
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Erro interno ao remover cliente.';

    if (message === 'Forbidden') {
      return NextResponse.json(
        {
          ok: false,
          error: 'Usuário sem permissão para remover clientes.',
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
