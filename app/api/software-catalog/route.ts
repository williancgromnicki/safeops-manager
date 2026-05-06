import { NextRequest, NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type CatalogRow = {
  name: string;
};

function cleanQuery(value?: string | null): string {
  return value?.trim() ?? '';
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

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Usuário não autenticado.',
          packages: [],
        },
        { status: 401 },
      );
    }

    const query = cleanQuery(request.nextUrl.searchParams.get('q'));
    const limitParam = Number(request.nextUrl.searchParams.get('limit') ?? 50);

    const limit = Number.isFinite(limitParam)
      ? Math.min(Math.max(limitParam, 10), 100)
      : 50;

    const supabase = await createClient();

    let catalogQuery = supabase
      .from('software_catalog')
      .select('name')
      .eq('is_active', true)
      .order('name', { ascending: true })
      .limit(limit);

    if (query) {
      catalogQuery = catalogQuery.ilike('name', `%${query}%`);
    }

    const { data, error } = await catalogQuery;

    if (error) {
      throw new Error(`Erro ao consultar catálogo: ${error.message}`);
    }

    const packages = ((data ?? []) as CatalogRow[]).map((row) => ({
      name: row.name,
    }));

    return NextResponse.json({
      ok: true,
      totalReturned: packages.length,
      query,
      packages,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : 'Erro interno ao consultar catálogo de softwares.',
        packages: [],
      },
      { status: 500 },
    );
  }
}
