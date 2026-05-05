import { NextRequest, NextResponse } from 'next/server';

import { resolveCurrentCustomer } from '@/lib/data/get-current-customer';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type CreateUserPayload = {
  email?: string;
  password?: string;
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

    const payload = (await request.json()) as CreateUserPayload;
    const email = cleanString(payload.email)?.toLowerCase() ?? null;
    const password = cleanString(payload.password);

    if (!email) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Informe o e-mail do usuário.',
        },
        { status: 400 },
      );
    }

    if (!password || password.length < 8) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Informe uma senha temporária com pelo menos 8 caracteres.',
        },
        { status: 400 },
      );
    }

    const supabaseAdmin = getSupabaseAdmin();

    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        created_by: 'safeops-admin',
      },
    });

    if (error) {
      throw new Error(`Erro ao criar usuário: ${error.message}`);
    }

    return NextResponse.json({
      ok: true,
      message: 'Usuário criado com sucesso.',
      userId: data.user?.id,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Erro interno ao criar usuário.';

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
