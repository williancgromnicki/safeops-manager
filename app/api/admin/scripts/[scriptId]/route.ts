import { NextRequest, NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type ScriptRouteContext = {
  params: Promise<{
    scriptId: string;
  }>;
};

type AccessRow = {
  customer_id: string;
  role: string;
};

type UpdateScriptPayload = {
  status?: 'approved' | 'pending_review' | 'disabled';
};

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

export async function PATCH(
  request: NextRequest,
  context: ScriptRouteContext,
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

    const accessRows = await getUserAccessRows(user.id);

    if (!isSafesysAdmin(accessRows)) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Apenas Admin Safesys pode aprovar ou alterar status de scripts.',
        },
        { status: 403 },
      );
    }

    const { scriptId } = await context.params;
    const payload = (await request.json()) as UpdateScriptPayload;
    const status = payload.status;

    if (!status || !['approved', 'pending_review', 'disabled'].includes(status)) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Status inválido.',
        },
        { status: 400 },
      );
    }

    const supabaseAdmin = getSupabaseAdmin();

    const { data, error } = await supabaseAdmin
      .from('remote_scripts')
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', scriptId)
      .select('id, name, status')
      .maybeSingle();

    if (error) {
      throw new Error(`Erro ao atualizar script: ${error.message}`);
    }

    if (!data) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Script não encontrado.',
        },
        { status: 404 },
      );
    }

    const message =
      status === 'approved'
        ? 'Script aprovado com sucesso.'
        : status === 'disabled'
          ? 'Script desativado com sucesso.'
          : 'Script retornou para revisão.';

    return NextResponse.json({
      ok: true,
      message,
      script: data,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : 'Erro interno ao atualizar script.',
      },
      { status: 500 },
    );
  }
}
