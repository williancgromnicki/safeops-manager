import { NextRequest, NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type ChangePasswordPayload = {
  newPassword?: string;
  confirmPassword?: string;
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

export async function PATCH(request: NextRequest) {
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

    const payload = (await request.json()) as ChangePasswordPayload;

    const newPassword = payload.newPassword?.trim() ?? '';
    const confirmPassword = payload.confirmPassword?.trim() ?? '';

    if (!newPassword || newPassword.length < 8) {
      return NextResponse.json(
        {
          ok: false,
          error: 'A nova senha precisa ter pelo menos 8 caracteres.',
        },
        { status: 400 },
      );
    }

    if (newPassword !== confirmPassword) {
      return NextResponse.json(
        {
          ok: false,
          error: 'A confirmação de senha não confere.',
        },
        { status: 400 },
      );
    }

    const supabaseAdmin = getSupabaseAdmin();

    const { error: updateAuthError } =
      await supabaseAdmin.auth.admin.updateUserById(user.id, {
        password: newPassword,
      });

    if (updateAuthError) {
      throw new Error(`Erro ao atualizar senha: ${updateAuthError.message}`);
    }

    const { error: updateProfileError } = await supabaseAdmin
      .from('profiles')
      .update({
        must_change_password: false,
        password_updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    if (updateProfileError) {
      throw new Error(
        `Senha atualizada, mas falhou ao atualizar profile: ${updateProfileError.message}`,
      );
    }

    return NextResponse.json({
      ok: true,
      message: 'Senha alterada com sucesso.',
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : 'Erro interno ao alterar senha.',
      },
      { status: 500 },
    );
  }
}
