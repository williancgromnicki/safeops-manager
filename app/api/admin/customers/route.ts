import { NextRequest, NextResponse } from 'next/server';

import { resolveCurrentCustomer } from '@/lib/data/get-current-customer';
import { slugify } from '@/lib/integrations/normalize-alert';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type CreateCustomerPayload = {
  name?: string;
  notes?: string;
};

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

export async function POST(request: NextRequest) {
  try {
    await assertAdmin();

    const payload = (await request.json()) as CreateCustomerPayload;
    const name = cleanString(payload.name);
    const notes = cleanString(payload.notes);

    if (!name) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Informe o nome do cliente.',
        },
        { status: 400 },
      );
    }

    const supabaseAdmin = getSupabaseAdmin();
    const slug = slugify(name);

    const { data: existingCustomer, error: findError } = await supabaseAdmin
      .from('customers')
      .select('id')
      .or(`name.eq.${name},slug.eq.${slug}`)
      .limit(1)
      .maybeSingle();

    if (findError) {
      throw new Error(`Erro ao verificar cliente existente: ${findError.message}`);
    }

    if (existingCustomer) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Já existe um cliente com esse nome ou slug.',
        },
        { status: 409 },
      );
    }

    const { error: insertError } = await supabaseAdmin.from('customers').insert({
      name,
      slug,
      notes,
    });

    if (insertError) {
      throw new Error(`Erro ao criar cliente: ${insertError.message}`);
    }

    return NextResponse.json({
      ok: true,
      message: 'Cliente criado com sucesso.',
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Erro interno ao criar cliente.';

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
