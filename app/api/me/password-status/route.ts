import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type ProfilePasswordRow = {
  id: string;
  must_change_password: boolean | null;
};

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

export async function GET() {
  try {
    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        {
          ok: false,
          authenticated: false,
          mustChangePassword: false,
        },
        { status: 401 },
      );
    }

    const supabaseAdmin = getSupabaseAdmin();

    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('id, must_change_password')
      .eq('id', user.id)
      .maybeSingle<ProfilePasswordRow>();

    if (error) {
      throw new Error(`Erro ao consultar profile: ${error.message}`);
    }

    return NextResponse.json({
      ok: true,
      authenticated: true,
      mustChangePassword: Boolean(data?.must_change_password),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : 'Erro interno ao consultar status de senha.',
      },
      { status: 500 },
    );
  }
}
