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
  download_token_key: string | null;
  auth_token_id: string | null;
  agent_version: string | null;
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

function getAgentDownloadBaseUrl(): string {
  return (
    process.env.SAFEOPS_AGENT_DOWNLOAD_BASE_URL?.trim() ??
    'https://agents.tacticalrmm.com'
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
        'download_token_key',
        'auth_token_id',
        'agent_version',
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

function shellEscape(value: string): string {
  return value.replace(/'/g, `'\\''`);
}

function buildLinuxScript(installer: InstallerRow): string {
  if (!installer.trmm_client_id || !installer.trmm_site_id) {
    throw new Error('Instalador sem vínculo técnico de cliente/site.');
  }

  const downloadToken = cleanString(installer.download_token_key);
  const authToken = cleanString(installer.auth_token_id);

  if (!downloadToken || !authToken) {
    throw new Error('Instalador sem tokens técnicos para geração do script.');
  }

  const version = cleanString(installer.agent_version) ?? '2.10.0';
  const arch = cleanString(installer.architecture) ?? 'amd64';
  const agentType = cleanString(installer.agent_type) ?? 'server';
  const apiBaseUrl = getApiBaseUrl();
  const downloadBaseUrl = getAgentDownloadBaseUrl();

  const binaryName = `tacticalagent-v${version}-linux-${arch}`;
  const downloadUrl =
    `${downloadBaseUrl}/api/v2/agents/` +
    `?version=${encodeURIComponent(version)}` +
    `&arch=${encodeURIComponent(arch)}` +
    `&token=${encodeURIComponent(downloadToken)}` +
    `&plat=linux` +
    `&api=${encodeURIComponent(apiBaseUrl.replace(/^https?:\/\//, ''))}`;

  return `#!/usr/bin/env bash
set -e

if [ "$EUID" -ne 0 ]; then
  echo "ERROR: Must be run as root"
  exit 1
fi

HAS_SYSTEMD=$(ps --no-headers -o comm 1 || true)
if [ "$HAS_SYSTEMD" != "systemd" ]; then
  echo "ERROR: This install script only supports systemd"
  exit 1
fi

cd /tmp

echo "Downloading SafeOps agent..."
curl -L -o '${shellEscape(binaryName)}' '${shellEscape(downloadUrl)}'

chmod +x '${shellEscape(binaryName)}'

echo "Installing SafeOps agent..."
./'${shellEscape(binaryName)}' -m install \\
  --api '${shellEscape(apiBaseUrl)}' \\
  --client-id ${installer.trmm_client_id} \\
  --site-id ${installer.trmm_site_id} \\
  --agent-type '${shellEscape(agentType)}' \\
  --auth '${shellEscape(authToken)}'

echo "SafeOps agent installation completed."
`;
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
      const script = buildLinuxScript(installer);
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
