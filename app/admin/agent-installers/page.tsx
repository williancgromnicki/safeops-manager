import { redirect } from 'next/navigation';

import { EmptyState } from '@/components/EmptyState';
import { resolveCurrentCustomer } from '@/lib/data/get-current-customer';
import { createClient } from '@/lib/supabase/server';
import { RefreshPageButton } from '@/components/RefreshPageButton';

export const dynamic = 'force-dynamic';

type AgentInstallersPageProps = {
  searchParams?: Promise<{
    customerId?: string;
  }>;
};

type AgentInstallerRow = {
  id: string;
  site_name: string | null;
  platform: string;
  agent_type: string;
  architecture: string;
  label: string;
  installer_url: string | null;
  expires_at: string | null;
  source: string | null;
  install_method: string | null;
  token_hours: number | null;
  download_filename: string | null;
  is_active: boolean;
  updated_at: string | null;
};

function formatDateTime(value?: string | null): string {
  if (!value) {
    return 'Gerado sob demanda';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString('pt-BR');
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

function isExpiringSoon(value?: string | null): boolean {
  if (!value) {
    return false;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return false;
  }

  const diffMs = date.getTime() - Date.now();
  const fiveDaysMs = 5 * 24 * 60 * 60 * 1000;

  return diffMs > 0 && diffMs <= fiveDaysMs;
}

function platformLabel(value: string): string {
  const normalized = value.toLowerCase();

  const labels: Record<string, string> = {
    windows: 'Windows',
    linux: 'Linux',
    macos: 'macOS',
  };

  return labels[normalized] ?? value;
}

function agentTypeLabel(value: string): string {
  const normalized = value.toLowerCase();

  const labels: Record<string, string> = {
    server: 'Servidor',
    workstation: 'Estação de trabalho',
  };

  return labels[normalized] ?? value;
}

function actionLabel(installer: AgentInstallerRow): string {
  const method = installer.install_method ?? 'deployment_link';

  if (method === 'linux_script') {
    return 'Baixar script .sh';
  }

  if (method === 'macos_script') {
    return 'Baixar script macOS';
  }

  return 'Abrir instalador';
}

function ExpiryBadge({ expiresAt }: { expiresAt?: string | null }) {
  if (!expiresAt) {
    return (
      <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 ring-1 ring-blue-600/20">
        Sob demanda
      </span>
    );
  }

  if (isExpired(expiresAt)) {
    return (
      <span className="rounded-full bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700 ring-1 ring-rose-600/20">
        Expirado
      </span>
    );
  }

  if (isExpiringSoon(expiresAt)) {
    return (
      <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 ring-1 ring-amber-600/20">
        Expira em breve
      </span>
    );
  }

  return (
    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-600/20">
      Disponível
    </span>
  );
}

function InstallerCard({ installer }: { installer: AgentInstallerRow }) {
  const expired = isExpired(installer.expires_at);
  const downloadHref = `/api/agent-installers/${encodeURIComponent(
    installer.id,
  )}/download`;

  return (
    <div className="rounded-2xl border border-surface-border bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-brand-900">
            {installer.label}
          </h3>

          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            {platformLabel(installer.platform)} •{' '}
            {agentTypeLabel(installer.agent_type)} •{' '}
            {installer.architecture}
          </p>

          {installer.site_name ? (
            <p className="mt-1 text-xs text-slate-500">
              Site: {installer.site_name}
            </p>
          ) : null}
        </div>

        <ExpiryBadge expiresAt={installer.expires_at} />
      </div>

      <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Validade
        </p>
        <p className="mt-1 text-sm font-medium text-slate-800">
          {formatDateTime(installer.expires_at)}
        </p>

        {installer.install_method === 'linux_script' ? (
          <p className="mt-2 text-xs text-slate-500">
            O script é gerado no momento do download e possui validade
            temporária.
          </p>
        ) : null}
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <a
          href={downloadHref}
          target="_blank"
          rel="noreferrer"
          className={[
            'inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold shadow-sm transition',
            expired
              ? 'pointer-events-none bg-slate-200 text-slate-500'
              : 'bg-brand-700 text-white hover:bg-brand-800',
          ].join(' ')}
        >
          {actionLabel(installer)}
        </a>
      </div>

      {expired ? (
        <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          Este instalador expirou. Solicite a geração de um novo link de
          implantação.
        </div>
      ) : null}
    </div>
  );
}

export default async function AgentInstallersPage({
  searchParams,
}: AgentInstallersPageProps) {
  const query = searchParams ? await searchParams : {};
  const customerContext = await resolveCurrentCustomer(query.customerId);

  if (!customerContext) {
    redirect('/login');
  }

  const activeCustomer = customerContext.activeCustomer;

  if (!activeCustomer) {
    return (
      <section className="space-y-6">
        <EmptyState
          title="Nenhum cliente vinculado"
          description="Seu usuário ainda não possui clientes vinculados para baixar instaladores."
        />
      </section>
    );
  }

  const allowedRoles = new Set(['admin', 'client']);

  if (!allowedRoles.has(activeCustomer.role)) {
    return (
      <section className="space-y-6">
        <EmptyState
          title="Acesso não permitido"
          description="Seu usuário não possui permissão para baixar instaladores deste cliente."
        />
      </section>
    );
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from('agent_installers')
    .select(
      [
        'id',
        'site_name',
        'platform',
        'agent_type',
        'architecture',
        'label',
        'installer_url',
        'expires_at',
        'source',
        'install_method',
        'token_hours',
        'download_filename',
        'is_active',
        'updated_at',
      ].join(', '),
    )
    .eq('customer_id', activeCustomer.customerId)
    .eq('is_active', true)
    .order('site_name', { ascending: true })
    .order('platform', { ascending: true })
    .order('agent_type', { ascending: true });

  if (error) {
    throw new Error(`Erro ao carregar instaladores: ${error.message}`);
  }

  const installers = (data ?? []) as unknown as AgentInstallerRow[];

  return (
    <div className="rounded-2xl border border-surface-border bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="section-title">Instaladores de agentes</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Baixe os instaladores do agente SafeOps para implantação nos
            dispositivos do cliente{' '}
            <span className="font-semibold text-slate-800">
              {activeCustomer.customerName}
            </span>
            .
          </p>
        </div>
    
        <RefreshPageButton />
      </div>
    </div>

      {installers.length === 0 ? (
        <EmptyState
          title="Nenhum instalador disponível"
          description="Ainda não há instaladores disponíveis para este cliente."
        />
      ) : (
        <div className="grid gap-5 xl:grid-cols-2">
          {installers.map((installer) => (
            <InstallerCard key={installer.id} installer={installer} />
          ))}
        </div>
      )}
    </section>
  );
}
