import { NextRequest, NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { createTrmmClientWithSite } from '@/lib/trmm/api';

export const dynamic = 'force-dynamic';

type AccessRow = {
  customer_id: string;
  role: string;
};

type CreateCustomerPayload = {
  name?: string;
  slug?: string;
  notes?: string;
  defaultSiteName?: string;
};

type CustomerRow = {
  id: string;
  name: string;
  slug: string;
  tactical_client_id: string | null;
  trmm_windows_agent_url: string | null;
  trmm_linux_agent_url: string | null;
  trmm_macos_agent_url: string | null;
  notes: string | null;
  created_at: string;
};

type SiteRow = {
  id: string;
  customer_id: string;
  name: string;
  slug: string;
  tactical_site_id: string | null;
  notes: string | null;
  is_active: boolean | null;
  created_at: string;
  updated_at: string | null;
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

function tableDoesNotExist(errorMessage: string): boolean {
  const normalized = errorMessage.toLowerCase();

  return (
    normalized.includes('could not find the table') ||
    (normalized.includes('relation') && normalized.includes('does not exist')) ||
    normalized.includes('schema cache')
  );
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

async function listSitesForCustomers(customerIds: string[]): Promise<SiteRow[]> {
  if (customerIds.length === 0) {
    return [];
  }

  const supabaseAdmin = getSupabaseAdmin();

  const { data, error } = await supabaseAdmin
    .from('sites')
    .select(
      [
        'id',
        'customer_id',
        'name',
        'slug',
        'tactical_site_id',
        'notes',
        'is_active',
        'created_at',
        'updated_at',
      ].join(', '),
    )
    .in('customer_id', customerIds)
    .order('name', { ascending: true });

  if (error) {
    if (tableDoesNotExist(error.message)) {
      console.warn('Tabela sites ainda não existe. A listagem seguirá sem unidades.');
      return [];
    }

    throw new Error(`Erro ao listar sites: ${error.message}`);
  }

  return (data ?? []) as unknown as SiteRow[];
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

    const { data: customersData, error: customersError } = await supabaseAdmin
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
          'created_at',
        ].join(', '),
      )
      .order('name', { ascending: true });

    if (customersError) {
      throw new Error(`Erro ao listar clientes: ${customersError.message}`);
    }

    const customers = (customersData ?? []) as unknown as CustomerRow[];
    const customerIds = customers.map((customer) => customer.id);
    const sites = await listSitesForCustomers(customerIds);

    const sitesByCustomerId = new Map<string, SiteRow[]>();

    for (const site of sites) {
      const current = sitesByCustomerId.get(site.customer_id) ?? [];
      current.push({
        ...site,
        is_active: site.is_active !== false,
      });
      sitesByCustomerId.set(site.customer_id, current);
    }

    return NextResponse.json({
      ok: true,
      customers: customers.map((customer) => ({
        ...customer,
        is_active: true,
        updated_at: customer.created_at,
        sites: sitesByCustomerId.get(customer.id) ?? [],
      })),
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
    const defaultSiteName = cleanString(payload.defaultSiteName);
    const slug = slugify(cleanString(payload.slug) ?? name ?? '');
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

    if (!defaultSiteName) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'Todo cliente precisa ter pelo menos um grupo inicial para organizar seus dispositivos.',
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

    const trmmResult = await createTrmmClientWithSite({
      clientName: name,
      siteName: defaultSiteName,
    });

    const supabaseAdmin = getSupabaseAdmin();

    const { data: customer, error: insertCustomerError } = await supabaseAdmin
      .from('customers')
      .insert({
        name,
        slug,
        tactical_client_id: String(trmmResult.clientId),
        notes,
      })
      .select('id, name, slug')
      .single();

    if (insertCustomerError) {
      throw new Error(`Cliente criado na origem operacional, mas falhou ao salvar no SafeOps: ${insertCustomerError.message}`);
    }

    const { error: siteError } = await supabaseAdmin.from('sites').insert({
      customer_id: customer.id,
      name: defaultSiteName,
      slug: slugify(defaultSiteName),
      tactical_site_id: String(trmmResult.siteId),
      is_active: true,
    });

    if (siteError && !tableDoesNotExist(siteError.message)) {
      throw new Error(`Cliente criado, mas falhou ao criar grupo no SafeOps: ${siteError.message}`);
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

    return NextResponse.json({
      ok: true,
      customerId: customer.id,
      message: 'Cliente e grupo inicial criados com sucesso.',
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
