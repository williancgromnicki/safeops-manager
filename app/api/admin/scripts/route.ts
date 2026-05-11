import { NextRequest, NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type AccessRow = {
  customer_id: string;
  role: string;
};

type CreateScriptPayload = {
  customerId?: string;
  scope?: 'safesys' | 'customer';
  name?: string;
  description?: string;
  shell?: 'powershell' | 'cmd' | 'bash';
  scriptBody?: string;
};

const allowedShells = new Set(['powershell', 'cmd', 'bash']);

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

function canAccessCustomer(input: {
  accessRows: AccessRow[];
  customerId: string;
}) {
  if (isSafesysAdmin(input.accessRows)) {
    return true;
  }

  return input.accessRows.some((row) => row.customer_id === input.customerId);
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Usuário não autenticado.',
          scripts: [],
        },
        { status: 401 },
      );
    }

    const customerId = request.nextUrl.searchParams.get('customerId');

    if (!customerId) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Informe o cliente.',
          scripts: [],
        },
        { status: 400 },
      );
    }

    const accessRows = await getUserAccessRows(user.id);
    const isAdmin = isSafesysAdmin(accessRows);

    if (!canAccessCustomer({ accessRows, customerId })) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Usuário sem permissão para acessar scripts deste cliente.',
          scripts: [],
        },
        { status: 403 },
      );
    }

    const supabaseAdmin = getSupabaseAdmin();

    if (isAdmin) {
      // Admin Safesys vê todos os scripts locais não desativados,
      // independentemente de cliente, autor, escopo ou status.
      const { data, error } = await supabaseAdmin
        .from('remote_scripts')
        .select(
          'id, customer_id, scope, name, description, shell, script_body, status, created_by_user_id, created_by_email, created_at, updated_at',
        )
        .neq('status', 'disabled')
        .order('created_at', { ascending: false });

      if (error) {
        throw new Error(`Erro ao listar scripts locais: ${error.message}`);
      }

      return NextResponse.json({
        ok: true,
        scripts: data ?? [],
      });
    }

    // Usuário comum vê scripts locais do cliente.
    // A biblioteca compartilhada vem do TRMM em /api/admin/scripts/trmm.
    // A execução de script local de outro usuário fica bloqueada no endpoint de execução.
    const { data, error } = await supabaseAdmin
      .from('remote_scripts')
      .select(
        'id, customer_id, scope, name, description, shell, script_body, status, created_by_user_id, created_by_email, created_at, updated_at',
      )
      .eq('customer_id', customerId)
      .neq('status', 'disabled')
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Erro ao listar scripts locais do cliente: ${error.message}`);
    }

    return NextResponse.json({
      ok: true,
      scripts: data ?? [],
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : 'Erro interno ao listar scripts.',
        scripts: [],
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
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

    const payload = (await request.json()) as CreateScriptPayload;

    const customerId = cleanString(payload.customerId);
    const name = cleanString(payload.name);
    const description = cleanString(payload.description);
    const scriptBody = cleanString(payload.scriptBody);
    const shell = cleanString(payload.shell) ?? 'powershell';
    const requestedScope = payload.scope === 'safesys' ? 'safesys' : 'customer';

    if (!customerId) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Informe o cliente.',
        },
        { status: 400 },
      );
    }

    if (!name || !scriptBody) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Informe nome e conteúdo do script.',
        },
        { status: 400 },
      );
    }

    if (!allowedShells.has(shell)) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Tipo de script inválido.',
        },
        { status: 400 },
      );
    }

    const accessRows = await getUserAccessRows(user.id);

    if (!canAccessCustomer({ accessRows, customerId })) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Usuário sem permissão para cadastrar scripts neste cliente.',
        },
        { status: 403 },
      );
    }

    const isAdmin = isSafesysAdmin(accessRows);
    const scope = requestedScope === 'safesys' && isAdmin ? 'safesys' : 'customer';
    const status = scope === 'safesys' && isAdmin ? 'approved' : 'pending_review';

    const supabaseAdmin = getSupabaseAdmin();

    const { error } = await supabaseAdmin.from('remote_scripts').insert({
      customer_id: scope === 'safesys' ? null : customerId,
      scope,
      name,
      description,
      shell,
      script_body: scriptBody,
      status,
      created_by_user_id: user.id,
      created_by_email: user.email ?? null,
    });

    if (error) {
      throw new Error(`Erro ao salvar script: ${error.message}`);
    }

    return NextResponse.json({
      ok: true,
      message:
        status === 'approved'
          ? 'Script aprovado cadastrado com sucesso.'
          : 'Script cadastrado e enviado para revisão.',
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : 'Erro interno ao cadastrar script.',
      },
      { status: 500 },
    );
  }
}
