import { NextRequest, NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type UserRouteContext = { params: Promise<{ userId: string }> };

type UpdateUserPayload = {
  customerId?: string;
  fullName?: string;
  role?: string;
  mustChangePassword?: boolean;
  disabled?: boolean;
};

type DeleteUserPayload = { customerId?: string };

type AccessRow = { customer_id: string; role: string };

const operationalRoles = new Set(['admin', 'client']);
const allowedRolesForClientManager = new Set(['client', 'viewer']);
const allowedRolesForAdminManager = new Set(['admin', 'client', 'viewer']);

function cleanString(value?: string | null): string | null {
  const cleaned = value?.trim();
  return cleaned ? cleaned : null;
}

function normalizeRole(role?: string | null): string {
  return cleanString(role)?.toLowerCase() ?? '';
}

async function getAuthenticatedUser() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error) {
    const message = error.message.toLowerCase();
    if (message.includes('auth session missing') || message.includes('session missing') || message.includes('jwt')) return null;
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

  if (error) throw new Error(`Erro ao buscar permissões do usuário: ${error.message}`);

  return ((data ?? []) as unknown as AccessRow[]).map((row) => ({
    customer_id: row.customer_id,
    role: normalizeRole(row.role),
  }));
}

function isSafesysAdmin(accessRows: AccessRow[]): boolean {
  return accessRows.some((row) => row.role === 'admin');
}

function getManagerRoleForCustomer(accessRows: AccessRow[], customerId: string): string | null {
  if (isSafesysAdmin(accessRows)) return 'admin';

  const access = accessRows.find((row) => row.customer_id === customerId);
  if (!access || !operationalRoles.has(access.role)) return null;

  return access.role;
}

function validateTargetRole(input: { managerRole: string; targetRole: string }): boolean {
  if (input.managerRole === 'admin') return allowedRolesForAdminManager.has(input.targetRole);
  return allowedRolesForClientManager.has(input.targetRole);
}

async function getTargetCustomerRole(input: { targetUserId: string; customerId: string }): Promise<string | null> {
  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from('user_customer_access')
    .select('role')
    .eq('user_id', input.targetUserId)
    .eq('customer_id', input.customerId)
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Erro ao validar vínculo do usuário: ${error.message}`);
  return normalizeRole(data?.role);
}

async function countRemainingAccessRows(userId: string): Promise<number> {
  const supabaseAdmin = getSupabaseAdmin();
  const { count, error } = await supabaseAdmin
    .from('user_customer_access')
    .select('user_id', { count: 'exact', head: true })
    .eq('user_id', userId);

  if (error) throw new Error(`Erro ao contar vínculos restantes: ${error.message}`);
  return count ?? 0;
}

function assertCanManageTarget(input: { managerRole: string; targetCurrentRole: string | null }) {
  if (!input.targetCurrentRole) throw new Error('TargetUserNotInCustomer');
  if (input.managerRole !== 'admin' && input.targetCurrentRole === 'admin') throw new Error('CannotManageAdminUser');
}

function errorResponse(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;

  if (message === 'TargetUserNotInCustomer') {
    return NextResponse.json({ ok: false, error: 'Usuário alvo não pertence ao cliente informado.' }, { status: 403 });
  }

  if (message === 'CannotManageAdminUser') {
    return NextResponse.json({ ok: false, error: 'Usuários cliente não podem alterar/remover administradores Safesys.' }, { status: 403 });
  }

  return NextResponse.json({ ok: false, error: message }, { status: 500 });
}

export async function PATCH(request: NextRequest, context: UserRouteContext) {
  try {
    const authenticatedUser = await getAuthenticatedUser();
    if (!authenticatedUser) return NextResponse.json({ ok: false, error: 'Usuário não autenticado.' }, { status: 401 });

    const { userId } = await context.params;
    const payload = (await request.json()) as UpdateUserPayload;
    const customerId = cleanString(payload.customerId);
    const fullName = cleanString(payload.fullName);
    const targetRole = normalizeRole(payload.role || 'viewer');
    const mustChangePassword = payload.mustChangePassword === true;
    const disabled = payload.disabled === true;

    if (!customerId) return NextResponse.json({ ok: false, error: 'Informe o cliente.' }, { status: 400 });

    const accessRows = await getUserAccessRows(authenticatedUser.id);
    const managerRole = getManagerRoleForCustomer(accessRows, customerId);
    if (!managerRole) return NextResponse.json({ ok: false, error: 'Usuário sem permissão para gerenciar este cliente.' }, { status: 403 });

    if (!validateTargetRole({ managerRole, targetRole })) {
      return NextResponse.json({ ok: false, error: managerRole === 'admin' ? 'Papel inválido. Use admin, client ou viewer.' : 'Papel inválido. Usuários cliente só podem definir client ou viewer.' }, { status: 400 });
    }

    const targetCurrentRole = await getTargetCustomerRole({ targetUserId: userId, customerId });
    assertCanManageTarget({ managerRole, targetCurrentRole });

    const supabaseAdmin = getSupabaseAdmin();
    const { error: updateProfileError } = await supabaseAdmin
      .from('profiles')
      .update({
        full_name: fullName,
        must_change_password: mustChangePassword,
        disabled_at: disabled ? new Date().toISOString() : null,
      })
      .eq('id', userId);

    if (updateProfileError) throw new Error(`Erro ao atualizar profile: ${updateProfileError.message}`);

    const { error: updateAccessError } = await supabaseAdmin
      .from('user_customer_access')
      .update({ role: targetRole })
      .eq('user_id', userId)
      .eq('customer_id', customerId);

    if (updateAccessError) throw new Error(`Erro ao atualizar permissão: ${updateAccessError.message}`);

    const { error: updateAuthError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      user_metadata: { full_name: fullName, updated_by: 'safeops-admin' },
    });

    if (updateAuthError) console.error('Profile atualizado, mas falhou metadata do Auth:', updateAuthError);

    return NextResponse.json({ ok: true, message: 'Usuário atualizado com sucesso.' });
  } catch (error) {
    return errorResponse(error, 'Erro interno ao atualizar usuário.');
  }
}

export async function DELETE(request: NextRequest, context: UserRouteContext) {
  try {
    const authenticatedUser = await getAuthenticatedUser();
    if (!authenticatedUser) return NextResponse.json({ ok: false, error: 'Usuário não autenticado.' }, { status: 401 });

    const { userId } = await context.params;
    const payload = (await request.json().catch(() => ({}))) as DeleteUserPayload;
    const customerId = cleanString(payload.customerId);

    if (!customerId) return NextResponse.json({ ok: false, error: 'Informe o cliente.' }, { status: 400 });
    if (userId === authenticatedUser.id) return NextResponse.json({ ok: false, error: 'Você não pode remover seu próprio acesso por esta tela.' }, { status: 400 });

    const accessRows = await getUserAccessRows(authenticatedUser.id);
    const managerRole = getManagerRoleForCustomer(accessRows, customerId);
    if (!managerRole) return NextResponse.json({ ok: false, error: 'Usuário sem permissão para gerenciar este cliente.' }, { status: 403 });

    const targetCurrentRole = await getTargetCustomerRole({ targetUserId: userId, customerId });
    assertCanManageTarget({ managerRole, targetCurrentRole });

    const supabaseAdmin = getSupabaseAdmin();
    const { error: deleteAccessError } = await supabaseAdmin
      .from('user_customer_access')
      .delete()
      .eq('user_id', userId)
      .eq('customer_id', customerId);

    if (deleteAccessError) throw new Error(`Erro ao remover vínculo: ${deleteAccessError.message}`);

    const remainingAccessCount = await countRemainingAccessRows(userId);
    if (remainingAccessCount === 0) {
      const { error: disableProfileError } = await supabaseAdmin
        .from('profiles')
        .update({ disabled_at: new Date().toISOString() })
        .eq('id', userId);

      if (disableProfileError) throw new Error(`Vínculo removido, mas falhou ao desativar profile: ${disableProfileError.message}`);
    }

    return NextResponse.json({
      ok: true,
      message: remainingAccessCount === 0
        ? 'Usuário removido deste cliente e desativado por não possuir outros vínculos.'
        : 'Usuário removido deste cliente com sucesso.',
    });
  } catch (error) {
    return errorResponse(error, 'Erro interno ao remover usuário.');
  }
}
