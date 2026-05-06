import { NextRequest, NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type CatalogItem = {
  name?: string;
};

function getApiBaseUrl(): string {
  return (
    process.env.TRMM_DEPLOYMENT_BASE_URL?.trim() ??
    'https://api.safesys.net.br'
  ).replace(/\/+$/, '');
}

function getPortalOrigin(): string {
  return (
    process.env.SAFEOPS_TRMM_BASE_URL?.trim() ??
    'https://safeops.safesys.net.br'
  ).replace(/\/+$/, '');
}

function cleanQuery(value?: string | null): string {
  return value?.trim().toLowerCase() ?? '';
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

async function fetchCatalog(): Promise<CatalogItem[]> {
  const apiBaseUrl = getApiBaseUrl();
  const portalOrigin = getPortalOrigin();

  const response = await fetch(`${apiBaseUrl}/software/chocos/`, {
    method: 'GET',
    headers: {
      Accept: 'application/json, text/plain, */*',
      'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
      Origin: portalOrigin,
      Referer: `${portalOrigin}/`,
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) SafeOpsManager/1.0',
    },
    cache: 'no-store',
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `Erro ao carregar catálogo de softwares: HTTP ${response.status} - ${text.slice(
        0,
        300,
      )}`,
    );
  }

  let data: unknown;

  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Catálogo de softwares retornou JSON inválido.');
  }

  if (!Array.isArray(data)) {
    throw new Error('Catálogo de softwares retornou formato inválido.');
  }

  return data as CatalogItem[];
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
    const limitParam = Number(request.nextUrl.searchParams.get('limit') ?? 100);

    const limit = Number.isFinite(limitParam)
      ? Math.min(Math.max(limitParam, 10), 300)
      : 100;

    const catalog = await fetchCatalog();

    const packages = catalog
      .map((item) => item.name?.trim())
      .filter((name): name is string => Boolean(name))
      .filter((name) => {
        if (!query) {
          return true;
        }

        return name.toLowerCase().includes(query);
      })
      .sort((a, b) => a.localeCompare(b))
      .slice(0, limit)
      .map((name) => ({
        name,
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
