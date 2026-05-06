import { NextRequest, NextResponse } from 'next/server';

import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type IncomingCatalogItem = {
  name?: string | null;
};

type IncomingPayload = {
  packages?: IncomingCatalogItem[];
};

function validateToken(request: NextRequest): boolean {
  const token = request.headers.get('x-safeops-webhook-token');

  return Boolean(token && token === process.env.SAFEOPS_WEBHOOK_TOKEN);
}

function cleanPackageName(value?: string | null): string | null {
  const cleaned = value?.trim();

  if (!cleaned) {
    return null;
  }

  return cleaned;
}

export async function POST(request: NextRequest) {
  if (!validateToken(request)) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Unauthorized',
      },
      { status: 401 },
    );
  }

  let payload: IncomingPayload;

  try {
    payload = (await request.json()) as IncomingPayload;
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: 'Invalid JSON payload',
      },
      { status: 400 },
    );
  }

  if (!Array.isArray(payload.packages)) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Missing packages.',
      },
      { status: 400 },
    );
  }

  try {
    const supabaseAdmin = getSupabaseAdmin();

    const uniqueNames = Array.from(
      new Set(
        payload.packages
          .map((item) => cleanPackageName(item.name))
          .filter((name): name is string => Boolean(name)),
      ),
    ).sort((a, b) => a.localeCompare(b));

    const now = new Date().toISOString();

    const chunkSize = 1000;
    let upserted = 0;

    for (let index = 0; index < uniqueNames.length; index += chunkSize) {
      const chunk = uniqueNames.slice(index, index + chunkSize);

      const rows = chunk.map((name) => ({
        name,
        source: 'chocolatey',
        is_active: true,
        last_synced_at: now,
        updated_at: now,
      }));

      const { error } = await supabaseAdmin.from('software_catalog').upsert(
        rows,
        {
          onConflict: 'name',
        },
      );

      if (error) {
        throw new Error(`Erro ao sincronizar catálogo: ${error.message}`);
      }

      upserted += rows.length;
    }

    const { error: deactivateError } = await supabaseAdmin
      .from('software_catalog')
      .update({
        is_active: false,
        updated_at: now,
      })
      .eq('source', 'chocolatey')
      .lt('last_synced_at', now);

    if (deactivateError) {
      throw new Error(
        `Catálogo sincronizado, mas falhou ao desativar itens antigos: ${deactivateError.message}`,
      );
    }

    return NextResponse.json({
      ok: true,
      received: payload.packages.length,
      unique: uniqueNames.length,
      upserted,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : 'Internal server error',
      },
      { status: 500 },
    );
  }
}
