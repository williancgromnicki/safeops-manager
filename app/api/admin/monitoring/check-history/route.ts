import { NextRequest, NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { fetchTrmmApi } from '@/lib/trmm/api';

export const dynamic = 'force-dynamic';

type AccessRow = {
  customer_id: string;
  role: string;
};

type RawHistoryItem = {
  x?: string | null;
  y?: number | string | null;
  results?: string | null;
  [key: string]: unknown;
};

function clean(value?: string | null) {
  const v = value?.trim();
  return v ? v : null;
}

function norm(value?: string | null) {
  return (value ?? '').trim().toLowerCase();
}

function isAdmin(rows: AccessRow[]) {
  return rows.some((row) => norm(row.role) === 'admin');
}

function canAccess(rows: AccessRow[], customerId: string) {
  return isAdmin(rows) || rows.some((row) => row.customer_id === customerId);
}

async function userFromSession() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    const msg = error.message.toLowerCase();

    if (msg.includes('session') || msg.includes('jwt')) {
      return null;
    }

    throw new Error(`Erro ao validar usuário autenticado: ${error.message}`);
  }

  return user ?? null;
}

async function accessRows(userId: string): Promise<AccessRow[]> {
  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from('user_customer_access')
    .select('customer_id, role')
    .eq('user_id', userId);

  if (error) {
    throw new Error(`Erro ao buscar permissões: ${error.message}`);
  }

  return ((data ?? []) as unknown as AccessRow[]).map((row) => ({
    customer_id: row.customer_id,
    role: norm(row.role),
  }));
}

function getTimeFilter(range: string) {
  if (range === '7d') return 7;
  if (range === '30d') return 30;
  if (range === 'all') return 0;

  return 1;
}

function readHistoryList(response: unknown): RawHistoryItem[] {
  if (Array.isArray(response)) {
    return response as RawHistoryItem[];
  }

  if (typeof response !== 'object' || response === null) {
    return [];
  }

  const record = response as Record<string, unknown>;

  for (const key of ['history', 'results', 'data', 'records', 'samples']) {
    if (Array.isArray(record[key])) {
      return record[key] as RawHistoryItem[];
    }
  }

  return [];
}

function extractPercentFromText(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);

    if (!match?.[1]) {
      continue;
    }

    const parsed = Number(match[1].replace(',', '.'));

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function inferPremiumMetricValue(output?: string | null) {
  if (!output) {
    return null;
  }

  const text = output.replace(/\s+/g, ' ').trim();

  // Checks Premium Safesys de disco devem plotar o percentual livre,
  // porque os thresholds são baseados em espaço livre mínimo.
  const diskFree = extractPercentFromText(text, [
    /Free:\s*([0-9]+(?:[.,][0-9]+)?)%/i,
    /Free Space:\s*([0-9]+(?:[.,][0-9]+)?)%/i,
  ]);

  if (diskFree !== null && /disk|drive|space/i.test(text)) {
    return diskFree;
  }

  // Checks Premium Safesys de memória/CPU plotam uso percentual.
  const usage = extractPercentFromText(text, [
    /Memory Usage:\s*([0-9]+(?:[.,][0-9]+)?)%/i,
    /CPU Usage:\s*([0-9]+(?:[.,][0-9]+)?)%/i,
    /Used:\s*([0-9]+(?:[.,][0-9]+)?)%/i,
    /Usage:\s*([0-9]+(?:[.,][0-9]+)?)%/i,
  ]);

  if (usage !== null) {
    return usage;
  }

  return null;
}

function normalizeHistoryItem(item: RawHistoryItem, index: number) {
  const output = typeof item.results === 'string' ? item.results : null;
  const premiumMetricValue = inferPremiumMetricValue(output);
  const rawValue = item.y;
  const fallbackValue =
    typeof rawValue === 'number'
      ? rawValue
      : typeof rawValue === 'string' && Number.isFinite(Number(rawValue))
        ? Number(rawValue)
        : null;

  const value = premiumMetricValue ?? fallbackValue;

  return {
    id: `history-${index}`,
    checkedAt: typeof item.x === 'string' ? item.x : null,
    value,
    status: null,
    output,
  };
}

export async function GET(request: NextRequest) {
  try {
    const user = await userFromSession();

    if (!user) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Usuário não autenticado.',
          history: [],
        },
        { status: 401 },
      );
    }

    const customerId = clean(request.nextUrl.searchParams.get('customerId'));
    const checkId = clean(request.nextUrl.searchParams.get('checkId'));
    const range = clean(request.nextUrl.searchParams.get('range')) ?? '24h';

    if (!customerId || !checkId) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Informe cliente e check.',
          history: [],
        },
        { status: 400 },
      );
    }

    const rows = await accessRows(user.id);

    if (!canAccess(rows, customerId)) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Usuário sem permissão para acessar este cliente.',
          history: [],
        },
        { status: 403 },
      );
    }

    const timeFilter = getTimeFilter(range);
    const path = `/checks/${encodeURIComponent(checkId)}/history/`;

    const response = await fetchTrmmApi<unknown>(path, {
      method: 'PATCH',
      body: JSON.stringify({
        timeFilter,
      }),
    });

    const history = readHistoryList(response).map(normalizeHistoryItem);

    return NextResponse.json({
      ok: true,
      sourcePath: path,
      timeFilter,
      history,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : 'Erro interno ao carregar histórico do check.',
        history: [],
      },
      { status: 500 },
    );
  }
}
