import { NextRequest, NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type AccessRow = {
  customer_id: string;
  role: string;
};

type CreateCustomerPayload = {
  name?: string;
  slug?: string;
  notes?: string;
  tacticalClientId?: string;
  windowsAgentUrl?: string;
  linuxAgentUrl?: string;
  macosAgentUrl?: string;
  createDefaultSite?: boolean;
  defaultSiteName?: string;
};

function cleanString(value?: string | null): string | null {
  const cleaned = value?.trim();

  return cleaned ? cleaned : null;
}

function normalizeRole(role?: string | null): string {
  return cleanString(role)?.toLowerCase() ?? '';
}

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
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

async function assertSafesysAdmin(userId: string) {
  const accessRows = await getUserAccessRows(userId);

  if (!isSafesysAdmin(accessRows)) {
    throw new Error('Forbidden');
  }
}

export async function GET() {
  try {
    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Usuário não autenticado.',
          customers: [],
        },
        { status: 401 },
      );
    }

    await assertSafesysAdmin(user.id);

    const supabaseAdmin = getSupabaseAdmin();

    const { data, error } = await supabaseAdmin
      .from('customers')
      .select(
        [
          'id',
          'name',
          'slug',
          'tactical_client_id',
          'trmm_windows_agent_url',
          'trmm_linux_agent_url',
          'trmm_macos_agent_url',
          'notes',
          'is_active',
          'created_at',
          'updated_at',
          'sites(id, customer_id, name, slug, tactical_site_id, notes, is_active, created_at, updated_at)',
        ].join(', '),
      )
      .order('name', { ascending: true });

    if (error) {
      throw new Error(`Erro ao listar clientes: ${error.message}`);
    }

    return NextResponse.json({
      ok: true,
      customers: data ?? [],
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Erro interno ao listar clientes.';

    if (message === 'Forbidden') {
      return NextResponse.json(
        {
          ok: false,
          error: 'Usuário sem permissão para gerenciar clientes.',
          customers: [],
        },
        { status: 403 },
      );
    }

    return NextResponse.json(
      {
        ok: false,
        error: message,
        customers: [],
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

    await assertSafesysAdmin(user.id);

    const payload = (await request.json()) as CreateCustomerPayload;

    const name = cleanString(payload.name);
    const slug = slugify(cleanString(payload.slug) ?? name ?? '');
    const notes = cleanString(payload.notes);
    const tacticalClientId = cleanString(payload.tacticalClientId);
    const windowsAgentUrl = cleanString(payload.windowsAgentUrl);
    const linuxAgentUrl = cleanString(payload.linuxAgentUrl);
    const macosAgentUrl = cleanString(payload.macosAgentUrl);

    if (!name) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Informe o nome do cliente.',
        },
        { status: 400 },
      );
    }

    if (!slug) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Não foi possível gerar o slug do cliente.',
        },
        { status: 400 },
      );
    }

    const supabaseAdmin = getSupabaseAdmin();

    const { data: customer, error: insertCustomerError } = await supabaseAdmin
      .from('customers')
      .insert({
        name,
        slug,
        tactical_client_id: tacticalClientId,
        trmm_windows_agent_url: windowsAgentUrl,
        trmm_linux_agent_url: linuxAgentUrl,
        trmm_macos_agent_url: macosAgentUrl,
        notes,
        is_active: true,
      })
      .select('id, name, slug')
      .single();

    if (insertCustomerError) {
      throw new Error(`Erro ao criar cliente: ${insertCustomerError.message}`);
    }

    const { error: accessError } = await supabaseAdmin
      .from('user_customer_access')
      .upsert(
        {
          user_id: user.id,
          customer_id: customer.id,
          role: 'admin',
        },
        {
          onConflict: 'user_id,customer_id',
        },
      );

    if (accessError) {
      throw new Error(
        `Cliente criado, mas falhou ao vincular seu usuário: ${accessError.message}`,
      );
    }

    const createDefaultSite = payload.createDefaultSite !== false;
    const defaultSiteName =
      cleanString(payload.defaultSiteName) ?? 'Matriz';

    if (createDefaultSite) {
      const siteSlug = slugify(defaultSiteName);

      const { error: siteError } = await supabaseAdmin.from('sites').insert({
        customer_id: customer.id,
        name: defaultSiteName,
        slug: siteSlug,
        is_active: true,
      });

      if (siteError) {
        throw new Error(
          `Cliente criado, mas falhou ao criar site padrão: ${siteError.message}`,
        );
      }
    }

    return NextResponse.json({
      ok: true,
      customerId: customer.id,
      message: 'Cliente criado com sucesso.',
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Erro interno ao criar cliente.';

    if (message === 'Forbidden') {
      return NextResponse.json(
        {
          ok: false,
          error: 'Usuário sem permissão para criar clientes.',
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
