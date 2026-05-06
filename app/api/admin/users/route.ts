import { NextRequest, NextResponse } from 'next/server';
import type { User } from '@supabase/supabase-js';

import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type CreateUserPayload = {
  customerId?: string;
  email?: string;
  password?: string;
  fullName?: string;
  role?: string;
  mustChangePassword?: boolean;
};

type AccessRow = {
  customer_id: string;
  role: string;
};

type ManagedUserRow = {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  must_change_password: boolean | null;
  disabled_at: string | null;
  created_at: string;
  user_customer_access:
    | {
        customer_id: string;
        role: string;
      }[]
    | null;
};

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

function normalizeEmail(email?: string | null): string | null {
  return cleanString(email)?.toLowerCase() ?? null;
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

function getManagerRoleForCustomer(
  accessRows: AccessRow[],
  customerId: string,
): string | null {
  if (isSafesysAdmin(accessRows)) {
    return 'admin';
  }

  const access = accessRows.find((row) => row.customer_id === customerId);

  if (!access) {
    return null;
  }

  if (!operationalRoles.has(access.role)) {
    return null;
  }

  return access.role;
}

function validateTargetRole(input: {
  managerRole: string;
  targetRole: string;
}): boolean {
  if (input.managerRole === 'admin') {
    return allowedRolesForAdminManager.has(input.targetRole);
  }

  return allowedRolesForClientManager.has(input.targetRole);
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

async function createOrUpdateAuthUser(input: {
  email: string;
  password: string;
  fullName: string | null;
}) {
  const supabaseAdmin = getSupabaseAdmin();

  const existingUser = await findUserByEmail(input.email);

  if (existingUser) {
    return {
      user: existingUser,
      created: false,
    };
  }

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: {
      created_by: 'safeops-admin',
      full_name: input.fullName,
    },
  });

  if (error) {
    throw new Error(`Erro ao criar usuário no Auth: ${error.message}`);
  }

  if (!data.user) {
    throw new Error('Usuário criado, mas o Supabase não retornou o ID.');
  }

  return {
    user: data.user,
    created: true,
  };
}

async function upsertProfile(input: {
  userId: string;
  email: string;
  fullName: string | null;
  createdBy: string;
  mustChangePassword: boolean;
}) {
  const supabaseAdmin = getSupabaseAdmin();

  const { error } = await supabaseAdmin.from('profiles').upsert(
    {
      id: input.userId,
      email: input.email,
      full_name: input.fullName,
      role: 'customer_user',
      created_by: input.createdBy,
      must_change_password: input.mustChangePassword,
      password_updated_at: new Date().toISOString(),
    },
    {
      onConflict: 'id',
    },
  );

  if (error) {
    throw new Error(`Erro ao criar/atualizar profile: ${error.message}`);
  }
}

async function upsertCustomerAccess(input: {
  userId: string;
  customerId: string;
  role: string;
}) {
  const supabaseAdmin = getSupabaseAdmin();

  const { data: existingAccess, error: findError } = await supabaseAdmin
    .from('user_customer_access')
    .select('user_id, customer_id')
    .eq('user_id', input.userId)
    .eq('customer_id', input.customerId)
    .limit(1)
    .maybeSingle();

  if (findError) {
    throw new Error(`Erro ao verificar vínculo existente: ${findError.message}`);
  }

  if (existingAccess) {
    const { error: updateError } = await supabaseAdmin
      .from('user_customer_access')
      .update({
        role: input.role,
      })
      .eq('user_id', input.userId)
      .eq('customer_id', input.customerId);

    if (updateError) {
      throw new Error(`Erro ao atualizar permissão: ${updateError.message}`);
    }

    return 'updated';
  }

  const { error: insertError } = await supabaseAdmin
    .from('user_customer_access')
    .insert({
      user_id: input.userId,
      customer_id: input.customerId,
      role: input.role,
    });

  if (insertError) {
    throw new Error(`Erro ao criar permissão: ${insertError.message}`);
  }

  return 'created';
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Usuário não autenticado.',
          users: [],
        },
        { status: 401 },
      );
    }

    const customerId = cleanString(request.nextUrl.searchParams.get('customerId'));

    if (!customerId) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Informe o customerId.',
          users: [],
        },
        { status: 400 },
      );
    }

    const accessRows = await getUserAccessRows(user.id);
    const managerRole = getManagerRoleForCustomer(accessRows, customerId);

    if (!managerRole) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Usuário sem permissão para gerenciar este cliente.',
          users: [],
        },
        { status: 403 },
      );
    }

    const supabaseAdmin = getSupabaseAdmin();

    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select(
        [
          'id',
          'email',
          'full_name',
          'role',
          'must_change_password',
          'disabled_at',
          'created_at',
          'user_customer_access:user_customer_access!inner(customer_id, role)',
        ].join(', '),
      )
      .eq('user_customer_access.customer_id', customerId)
      .order('email', { ascending: true });

    if (error) {
      throw new Error(`Erro ao listar usuários do cliente: ${error.message}`);
    }

    const rows = (data ?? []) as unknown as ManagedUserRow[];

    const users = rows.map((row) => {
      const customerAccess = row.user_customer_access?.[0] ?? null;

      return {
        id: row.id,
        email: row.email,
        fullName: row.full_name,
        portalRole: row.role,
        customerRole: customerAccess?.role ?? 'viewer',
        mustChangePassword: Boolean(row.must_change_password),
        disabledAt: row.disabled_at,
        createdAt: row.created_at,
      };
    });

    return NextResponse.json({
      ok: true,
      managerRole,
      users,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : 'Erro interno ao listar usuários.',
        users: [],
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
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

    const payload = (await request.json()) as CreateUserPayload;

    const customerId = cleanString(payload.customerId);
    const email = normalizeEmail(payload.email);
    const password = cleanString(payload.password);
    const fullName = cleanString(payload.fullName);
    const targetRole = normalizeRole(payload.role || 'viewer');
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

    const accessRows = await getUserAccessRows(authenticatedUser.id);
    const managerRole = getManagerRoleForCustomer(accessRows, customerId);

    if (!managerRole) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Usuário sem permissão para gerenciar este cliente.',
        },
        { status: 403 },
      );
    }

    if (!validateTargetRole({ managerRole, targetRole })) {
      return NextResponse.json(
        {
          ok: false,
          error:
            managerRole === 'admin'
              ? 'Papel inválido. Use admin, client ou viewer.'
              : 'Papel inválido. Usuários cliente só podem criar client ou viewer.',
        },
        { status: 400 },
      );
    }

    const { user, created } = await createOrUpdateAuthUser({
      email,
      password,
      fullName,
    });

    await upsertProfile({
      userId: user.id,
      email,
      fullName,
      createdBy: authenticatedUser.id,
      mustChangePassword,
    });

    const accessAction = await upsertCustomerAccess({
      userId: user.id,
      customerId,
      role: targetRole,
    });

    return NextResponse.json({
      ok: true,
      userId: user.id,
      created,
      accessAction,
      message: created
        ? 'Usuário criado e vinculado com sucesso.'
        : 'Usuário existente atualizado e vinculado com sucesso.',
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : 'Erro interno ao criar usuário.',
      },
      { status: 500 },
    );
  }
}
