import { NextRequest, NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type PasswordRouteContext = {
  params: Promise<{
    userId: string;
  }>;
};

type ResetPasswordPayload = {
  customerId?: string;
  password?: string;
  mustChangePassword?: boolean;
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

function canManageCustomer(input: {
  accessRows: AccessRow[];
  customerId: string;
}): boolean {
  if (isSafesysAdmin(input.accessRows)) {
    return true;
  }

  return input.accessRows.some(
    (row) =>
      row.customer_id === input.customerId &&
      operationalRoles.has(row.role),
  );
}

async function assertTargetUserBelongsToCustomer(input: {
  targetUserId: string;
  customerId: string;
}) {
  const supabaseAdmin = getSupabaseAdmin();

  const { data, error } = await supabaseAdmin
    .from('user_customer_access')
    .select('user_id')
    .eq('user_id', input.targetUserId)
    .eq('customer_id', input.customerId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Erro ao validar vínculo do usuário: ${error.message}`);
  }

  if (!data) {
    throw new Error('TargetUserNotInCustomer');
  }
}

export async function PATCH(
  request: NextRequest,
  context: PasswordRouteContext,
) {
  try {
    const authenticatedUser = await getAuthenticatedUser();

    if (!authenticatedUser) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Usuário não autenticado.',
        },
        { status: 401 },
      );
    }

    const { userId } = await context.params;
    const payload = (await request.json()) as ResetPasswordPayload;

    const customerId = cleanString(payload.customerId);
    const password = cleanString(payload.password);
    const mustChangePassword = payload.mustChangePassword !== false;

    if (!customerId) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Informe o cliente.',
        },
        { status: 400 },
      );
    }

    if (!password || password.length < 8) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Informe uma nova senha com pelo menos 8 caracteres.',
        },
        { status: 400 },
      );
    }

    const accessRows = await getUserAccessRows(authenticatedUser.id);

    if (!canManageCustomer({ accessRows, customerId })) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Usuário sem permissão para resetar senha neste cliente.',
        },
        { status: 403 },
      );
    }

    await assertTargetUserBelongsToCustomer({
      targetUserId: userId,
      customerId,
    });

    const supabaseAdmin = getSupabaseAdmin();

    const { error: updateAuthError } =
      await supabaseAdmin.auth.admin.updateUserById(userId, {
        password,
      });

    if (updateAuthError) {
      throw new Error(`Erro ao atualizar senha: ${updateAuthError.message}`);
    }

    const { error: updateProfileError } = await supabaseAdmin
      .from('profiles')
      .update({
        must_change_password: mustChangePassword,
        password_updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (updateProfileError) {
      throw new Error(
        `Senha atualizada, mas falhou ao atualizar profile: ${updateProfileError.message}`,
      );
    }

    return NextResponse.json({
      ok: true,
      message: 'Senha resetada com sucesso.',
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Erro interno ao resetar senha.';

    if (message === 'TargetUserNotInCustomer') {
      return NextResponse.json(
        {
          ok: false,
          error: 'Usuário alvo não pertence ao cliente informado.',
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
