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

type OfficialInstallerPayload = {
  installMethod: 'bash';
  client: number;
  site: number;
  expires: number;
  agenttype: string;
  power: number;
  rdp: number;
  ping: number;
  goarch: string;
  api: string;
  fileName: string;
  plat: 'linux';
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
    process.env.TRMM_API_URL?.trim() ??
    'https://api.safesys.net.br'
  ).replace(/\/+$/, '');
}

function getInstallerApiUrl(): string {
  return `${getApiBaseUrl()}/agents/installer/`;
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

function slugifyFilename(value?: string | null): string {
  const normalized = cleanString(value) ?? 'safeops';

  return normalized
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, 'e')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'safeops';
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

function normalizeAgentType(value?: string | null): string {
  const normalized = cleanString(value)?.toLowerCase() ?? 'server';

  if (['server', 'workstation'].includes(normalized)) {
    return normalized;
  }

  return 'server';
}

function normalizeTokenHours(value?: number | null): number {
  if (!value || !Number.isFinite(value) || value < 1) {
    return 24;
  }

  return Math.min(Math.floor(value), 9999999);
}

function buildOfficialInstallerPayload(
  installer: InstallerRow,
): OfficialInstallerPayload {
  if (!installer.trmm_client_id || !installer.trmm_site_id) {
    throw new Error('Instalador sem vínculo técnico de cliente/site.');
  }

  const agentType = normalizeAgentType(installer.agent_type);
  const architecture = normalizeArchitecture(installer.architecture);
  const filenameBase = [
    'safeops',
    slugifyFilename(installer.site_name ?? installer.label),
    agentType,
    architecture,
  ]
    .filter(Boolean)
    .join('-');

  /*
   * O endpoint oficial de geração de instalador recebe `fileName` mesmo quando
   * installMethod=bash. No HAR capturado, o payload enviado pelo console usa .exe.
   * Para manter compatibilidade com o backend original, preservamos esse padrão.
   */
  const fileName = `${filenameBase}.exe`;

  return {
    installMethod: 'bash',
    client: installer.trmm_client_id,
    site: installer.trmm_site_id,
    expires: normalizeTokenHours(installer.token_hours),
    agenttype: agentType,
    power: 0,
    rdp: 0,
    ping: 0,
    goarch: architecture,
    api: getApiBaseUrl(),
    fileName,
    plat: 'linux',
  };
}

function sanitizeOfficialLinuxScript(script: string): string {
  return script
    .replace(/Downloading tactical agent\.\.\./gi, 'Downloading SafeOps agent...')
    .replace(/ERROR: Unable to download tactical agent/gi, 'ERROR: Unable to download SafeOps agent')
    .replace(/Description=Tactical RMM Linux Agent/g, 'Description=SafeOps Linux Agent');
}

function validateLinuxScript(script: string): string {
  const trimmed = script.trimStart();

  if (!trimmed.startsWith('#!/usr/bin/env bash')) {
    throw new Error(
      `Resposta inesperada ao gerar script Linux: ${trimmed.slice(0, 300)}`,
    );
  }

  if (trimmed.toLowerCase().includes('{error:invalid token}')) {
    throw new Error(
      'A API retornou token inválido ao gerar o instalador Linux. Gere novamente o instalador no console e sincronize os instaladores.',
    );
  }

  return script;
}

async function fetchOfficialLinuxScript(installer: InstallerRow): Promise<string> {
  const payload = buildOfficialInstallerPayload(installer);
  const headers: Record<string, string> = {
    Accept: 'application/json, text/plain, */*',
    'Content-Type': 'application/json',
  };

  /*
   * O HAR capturado mostrou que o endpoint /agents/installer/ respondeu sem
   * Authorization/Cookie. Mesmo assim, mantemos suporte opcional a token server-side
   * caso o backend passe a exigir autenticação no futuro.
   */
  const apiToken =
    cleanString(process.env.TRMM_API_KEY) ??
    cleanString(process.env.SAFEOPS_TRMM_API_KEY);

  if (apiToken) {
    headers.Authorization = `Token ${apiToken}`;
  }

  const response = await fetch(getInstallerApiUrl(), {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    cache: 'no-store',
  });

  const body = await response.text();

  if (!response.ok) {
    throw new Error(
      `Erro ao gerar instalador Linux na API: HTTP ${response.status} - ${body.slice(0, 300)}`,
    );
  }

  const validatedScript = validateLinuxScript(body);

  return sanitizeOfficialLinuxScript(validatedScript);
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
      const script = await fetchOfficialLinuxScript(installer);
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