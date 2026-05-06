import { NextRequest, NextResponse } from 'next/server';

import { slugify } from '@/lib/integrations/normalize-alert';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type IncomingInstaller = {
  client?: string | null;
  site?: string | null;
  platform?: string | null;
  agent_type?: string | null;
  architecture?: string | null;
  label?: string | null;
  installer_url?: string | null;
  expires_at?: string | null;
};

type IncomingPayload = {
  installers?: IncomingInstaller[];
};

function cleanString(value?: string | null): string | null {
  const cleaned = value?.trim();

  return cleaned ? cleaned : null;
}

function normalizePlatform(value?: string | null): string {
  const normalized = cleanString(value)?.toLowerCase() ?? 'windows';

  if (['windows', 'linux', 'macos'].includes(normalized)) {
    return normalized;
  }

  return 'windows';
}

function normalizeAgentType(value?: string | null): string {
  const normalized = cleanString(value)?.toLowerCase() ?? 'server';

  if (['server', 'workstation'].includes(normalized)) {
    return normalized;
  }

  return 'server';
}

function normalizeArchitecture(value?: string | null): string {
  const normalized = cleanString(value)?.toLowerCase() ?? 'amd64';

  const map: Record<string, string> = {
    x64: 'amd64',
    '64': 'amd64',
    '64bit': 'amd64',
    '64-bit': 'amd64',
    amd64: 'amd64',
    x86: '386',
    '32': '386',
    '32bit': '386',
    '32-bit': '386',
    '386': '386',
    arm64: 'arm64',
    arm: 'arm',
  };

  return map[normalized] ?? normalized;
}

function normalizeExpiresAt(value?: string | null): string | null {
  const cleaned = cleanString(value);

  if (!cleaned) {
    return null;
  }

  const date = new Date(cleaned);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

async function resolveCustomerId(clientName: string): Promise<string> {
  const supabaseAdmin = getSupabaseAdmin();

  const { data: existingCustomer, error: findError } = await supabaseAdmin
    .from('customers')
    .select('id')
    .eq('name', clientName)
    .limit(1)
    .maybeSingle();

  if (findError) {
    throw new Error(`Erro ao buscar cliente: ${findError.message}`);
  }

  if (existingCustomer?.id) {
    return existingCustomer.id as string;
  }

  const { data: newCustomer, error: createError } = await supabaseAdmin
    .from('customers')
    .insert({
      name: clientName,
      slug: slugify(clientName),
    })
    .select('id')
    .single();

  if (createError) {
    throw new Error(`Erro ao criar cliente: ${createError.message}`);
  }

  return newCustomer.id as string;
}

export async function POST(request: NextRequest) {
  const token = request.headers.get('x-safeops-webhook-token');

  if (!token || token !== process.env.SAFEOPS_WEBHOOK_TOKEN) {
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

  if (!Array.isArray(payload.installers) || payload.installers.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Missing installers.',
      },
      { status: 400 },
    );
  }

  try {
    const supabaseAdmin = getSupabaseAdmin();

    let received = 0;
    let upserted = 0;
    let skipped = 0;

    const results: Array<{
      client: string;
      site: string | null;
      action: 'upserted' | 'skipped';
      reason?: string;
    }> = [];

    for (const installer of payload.installers) {
      received += 1;

      const clientName = cleanString(installer.client);
      const siteName = cleanString(installer.site);
      const installerUrl = cleanString(installer.installer_url);

      if (!clientName || !installerUrl) {
        skipped += 1;
        results.push({
          client: clientName ?? 'unknown',
          site: siteName,
          action: 'skipped',
          reason: 'missing_client_or_url',
        });
        continue;
      }

      const customerId = await resolveCustomerId(clientName);
      const platform = normalizePlatform(installer.platform);
      const agentType = normalizeAgentType(installer.agent_type);
      const architecture = normalizeArchitecture(installer.architecture);

      const defaultLabel = [
        platform === 'windows'
          ? 'Windows'
          : platform === 'linux'
            ? 'Linux'
            : 'macOS',
        agentType === 'server' ? 'Server' : 'Workstation',
        architecture,
        siteName ? `- ${siteName}` : '',
      ]
        .filter(Boolean)
        .join(' ');

      const label = cleanString(installer.label) ?? defaultLabel;

      const { error: upsertError } = await supabaseAdmin
        .from('agent_installers')
        .upsert(
          {
            customer_id: customerId,
            site_name: siteName,
            platform,
            agent_type: agentType,
            architecture,
            label,
            installer_url: installerUrl,
            expires_at: normalizeExpiresAt(installer.expires_at),
            source: 'SafeOps Sync',
            is_active: true,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict:
              'customer_id,site_name,platform,agent_type,architecture',
          },
        );

      if (upsertError) {
        throw new Error(`Erro ao sincronizar instalador: ${upsertError.message}`);
      }

      upserted += 1;

      results.push({
        client: clientName,
        site: siteName,
        action: 'upserted',
      });
    }

    return NextResponse.json({
      ok: true,
      received,
      upserted,
      skipped,
      installers: results,
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
