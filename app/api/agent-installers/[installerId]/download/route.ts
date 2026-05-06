import { NextRequest, NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type DownloadRouteContext = {
  params: Promise<{
    installerId: string;
  }>;
};

type InstallerRow = {
  id: string;
  customer_id: string;
  site_name: string | null;
  platform: string;
  agent_type: string;
  architecture: string;
  label: string;
  installer_url: string | null;
  expires_at: string | null;
  install_method: string | null;
  trmm_client_id: number | null;
  trmm_site_id: number | null;
  token_hours: number | null;
  download_filename: string | null;
  is_active: boolean;
};

type AccessRow = {
  customer_id: string;
  role: string;
};

const allowedRoles = new Set(['admin', 'client']);

function cleanString(value?: string | null): string | null {
  const cleaned = value?.trim();

  return cleaned ? cleaned : null;
}

function normalizeRole(role?: string | null): string {
  return cleanString(role)?.toLowerCase() ?? '';
}

function getApiBaseUrl(): string {
  return (
    process.env.TRMM_DEPLOYMENT_BASE_URL?.trim() ??
    'https://api.safesys.net.br'
  ).replace(/\/+$/, '');
}

function isExpired(value?: string | null): boolean {
  if (!value) {
    return false;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return false;
  }

  return date.getTime() < Date.now();
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

async function getAccessRows(userId: string): Promise<AccessRow[]> {
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
    role: normalizeRole(row.role),
  }));
}

function canDownloadInstaller(input: {
  accessRows: AccessRow[];
  customerId: string;
}): boolean {
  const isAdmin = input.accessRows.some((row) => row.role === 'admin');

  if (isAdmin) {
    return true;
  }

  return input.accessRows.some(
    (row) =>
      row.customer_id === input.customerId && allowedRoles.has(row.role),
  );
}

async function fetchInstaller(installerId: string): Promise<InstallerRow | null> {
  const supabaseAdmin = getSupabaseAdmin();

  const { data, error } = await supabaseAdmin
    .from('agent_installers')
    .select(
      [
        'id',
        'customer_id',
        'site_name',
        'platform',
        'agent_type',
        'architecture',
        'label',
        'installer_url',
        'expires_at',
        'install_method',
        'trmm_client_id',
        'trmm_site_id',
        'token_hours',
        'download_filename',
        'is_active',
      ].join(', '),
    )
    .eq('id', installerId)
    .eq('is_active', true)
    .maybeSingle<InstallerRow>();

  if (error) {
    throw new Error(`Erro ao carregar instalador: ${error.message}`);
  }

  return data ?? null;
}

function buildLinuxPayload(installer: InstallerRow) {
  if (!installer.trmm_client_id || !installer.trmm_site_id) {
    throw new Error('Instalador sem vínculo técnico de cliente/site.');
  }

  return {
    installMethod: 'bash',
    client: installer.trmm_client_id,
    site: installer.trmm_site_id,
    expires: installer.token_hours ?? 24,
    agenttype: installer.agent_type,
    power: 0,
    rdp: 0,
    ping: 0,
    goarch: installer.architecture,
    api: getApiBaseUrl(),
    fileName:
      installer.download_filename ??
      `safeops-${installer.platform}-${installer.agent_type}-${installer.architecture}.sh`,
    plat: 'linux',
  };
}

async function generateLinuxInstaller(installer: InstallerRow) {
  const response = await fetch(`${getApiBaseUrl()}/agents/installer/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
    body: JSON.stringify(buildLinuxPayload(installer)),
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `Falha ao gerar script Linux: HTTP ${response.status} - ${text.slice(
        0,
        300,
      )}`,
    );
  }

  if (!text.trim().startsWith('#!')) {
    throw new Error(
      'A API de instalação retornou uma resposta inesperada para o script Linux.',
    );
  }

  return text;
}

export async function GET(
  _request: NextRequest,
  context: DownloadRouteContext,
) {
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

    const { installerId } = await context.params;
    const installer = await fetchInstaller(installerId);

    if (!installer) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Instalador não encontrado.',
        },
        { status: 404 },
      );
    }

    const accessRows = await getAccessRows(user.id);

    if (
      !canDownloadInstaller({
        accessRows,
        customerId: installer.customer_id,
      })
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Usuário sem permissão para baixar este instalador.',
        },
        { status: 403 },
      );
    }

    const installMethod = installer.install_method ?? 'deployment_link';

    if (installMethod === 'deployment_link') {
      if (!installer.installer_url) {
        return NextResponse.json(
          {
            ok: false,
            error: 'Link de instalador não disponível.',
          },
          { status: 409 },
        );
      }

      if (isExpired(installer.expires_at)) {
        return NextResponse.json(
          {
            ok: false,
            error: 'Este link de instalação está expirado.',
          },
          { status: 410 },
        );
      }

      return NextResponse.redirect(installer.installer_url);
    }

    if (installMethod === 'linux_script') {
      const script = await generateLinuxInstaller(installer);
      const filename =
        installer.download_filename ??
        `safeops-${installer.agent_type}-${installer.architecture}.sh`;

      return new NextResponse(script, {
        status: 200,
        headers: {
          'Content-Type': 'application/x-sh; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Cache-Control': 'no-store',
        },
      });
    }

    return NextResponse.json(
      {
        ok: false,
        error: 'Método de instalador ainda não suportado.',
      },
      { status: 400 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : 'Erro interno ao baixar instalador.',
      },
      { status: 500 },
    );
  }
}
