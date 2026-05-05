import { NextRequest, NextResponse } from 'next/server';
import type { User } from '@supabase/supabase-js';

import { resolveCurrentCustomer } from '@/lib/data/get-current-customer';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type PermissionPayload = {
  email?: string;
  customerId?: string;
  role?: string;
};

type AccessRow = {
  user_id: string;
  customer_id: string;
};

const allowedRoles = new Set(['admin', 'client', 'viewer']);

function cleanString(value?: string | null): string | null {
  const cleaned = value?.trim();

  return cleaned ? cleaned : null;
}

async function assertAdmin(): Promise<void> {
  const context = await resolveCurrentCustomer();

  if (!context) {
    throw new Error('Unauthorized');
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from('user_customer_access')
    .select('role')
    .eq('user_id', context.userId)
    .eq('role', 'admin')
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Erro ao validar permissão admin: ${error.message}`);
  }

  if (!data) {
    throw new Error('Forbidden');
  }
}

async function findUserByEmail(email: string): Promise<User | null> {
  const supabaseAdmin = getSupabaseAdmin();

  let page = 1;
  const perPage = 1000;

  while (page <= 10) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) {
      throw new Error(`Erro ao listar usuários: ${error.message}`);
    }

    const match =
      data.users.find(
        (user) => user.email?.trim().toLowerCase() === email,
      ) ?? null;

    if (match) {
      return match;
    }

    if (data.users.length < perPage) {
      return null;
    }

    page += 1;
  }

  return null;
}

export async function POST(request: NextRequest) {
  try {
    await assertAdmin();

    const payload = (await request.json()) as PermissionPayload;
    const email = cleanString(payload.email)?.toLowerCase() ?? null;
    const customerId = cleanString(payload.customerId);
    const role = cleanString(payload.role) ?? 'client';

    if (!email) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Informe o e-mail do usuário.',
        },
        { status: 400 },
      );
    }

    if (!customerId) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Informe o cliente.',
        },
        { status: 400 },
      );
    }

    if (!allowedRoles.has(role)) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Papel inválido. Use admin, client ou viewer.',
        },
        { status: 400 },
      );
    }

    const user = await findUserByEmail(email);

    if (!user) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Usuário não encontrado. Crie o usuário antes de vincular.',
        },
        { status: 404 },
      );
    }

    const supabaseAdmin = getSupabaseAdmin();

    const { data: customer, error: customerError } = await supabaseAdmin
      .from('customers')
      .select('id')
      .eq('id', customerId)
      .limit(1)
      .maybeSingle();

    if (customerError) {
      throw new Error(`Erro ao validar cliente: ${customerError.message}`);
    }

    if (!customer) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Cliente não encontrado.',
        },
        { status: 404 },
      );
    }

    const { data: existingAccess, error: accessError } = await supabaseAdmin
      .from('user_customer_access')
      .select('user_id, customer_id')
      .eq('user_id', user.id)
      .eq('customer_id', customerId)
      .limit(1)
      .maybeSingle();

    if (accessError) {
      throw new Error(`Erro ao verificar vínculo: ${accessError.message}`);
    }

    if (existingAccess) {
      const access = existingAccess as AccessRow;

      const { error: updateError } = await supabaseAdmin
        .from('user_customer_access')
        .update({
          role,
        })
        .eq('user_id', access.user_id)
        .eq('customer_id', access.customer_id);

      if (updateError) {
        throw new Error(`Erro ao atualizar permissão: ${updateError.message}`);
      }

      return NextResponse.json({
        ok: true,
        message: 'Permissão atualizada com sucesso.',
      });
    }

    const { error: insertError } = await supabaseAdmin
      .from('user_customer_access')
      .insert({
        user_id: user.id,
        customer_id: customerId,
        role,
      });

    if (insertError) {
      throw new Error(`Erro ao criar permissão: ${insertError.message}`);
    }

    return NextResponse.json({
      ok: true,
      message: 'Permissão criada com sucesso.',
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Erro interno ao salvar permissão.';

    if (message === 'Unauthorized') {
      return NextResponse.json(
        { ok: false, error: 'Usuário não autenticado.' },
        { status: 401 },
      );
    }

    if (message === 'Forbidden') {
      return NextResponse.json(
        { ok: false, error: 'Usuário sem permissão administrativa.' },
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
