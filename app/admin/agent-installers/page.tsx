import { redirect } from 'next/navigation';

import { EmptyState } from '@/components/EmptyState';
import { resolveCurrentCustomer } from '@/lib/data/get-current-customer';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type AgentInstallersPageProps = {
  searchParams?: Promise<{
    customerId?: string;
  }>;
};

type CustomerInstallerRow = {
  id: string;
  name: string;
  slug: string | null;
  trmm_windows_agent_url: string | null;
  trmm_linux_agent_url: string | null;
  trmm_macos_agent_url: string | null;
  notes: string | null;
};

function hasValue(value?: string | null): boolean {
  return Boolean(value?.trim());
}

function InstallerCard({
  title,
  description,
  url,
  disabledMessage,
}: {
  title: string;
  description: string;
  url?: string | null;
  disabledMessage: string;
}) {
  const available = hasValue(url);

  return (
    <div className="rounded-2xl border border-surface-border bg-white p-5 shadow-sm">
      <div>
        <h3 className="text-lg font-semibold text-brand-900">{title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          {description}
        </p>
      </div>

      <div className="mt-5">
        {available ? (
          <a
            href={url ?? '#'}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-800"
          >
            Baixar instalador
          </a>
        ) : (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {disabledMessage}
          </div>
        )}
      </div>
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
    .from('customers')
    .select(
      [
        'id',
        'name',
        'slug',
        'trmm_windows_agent_url',
        'trmm_linux_agent_url',
        'trmm_macos_agent_url',
        'notes',
      ].join(', '),
    )
    .eq('id', activeCustomer.customerId)
    .maybeSingle<CustomerInstallerRow>();

  if (error) {
    throw new Error(`Erro ao carregar instaladores: ${error.message}`);
  }

  if (!data) {
    return (
      <section className="space-y-6">
        <EmptyState
          title="Cliente não encontrado"
          description="Não foi possível localizar os dados de implantação deste cliente."
        />
      </section>
    );
  }

  const hasAnyInstaller =
    hasValue(data.trmm_windows_agent_url) ||
    hasValue(data.trmm_linux_agent_url) ||
    hasValue(data.trmm_macos_agent_url);

  return (
    <section className="space-y-6">
      <div className="rounded-2xl border border-surface-border bg-white p-5 shadow-sm">
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
          <p className="mt-1 text-xs text-slate-500">
            Use estes instaladores somente nos dispositivos pertencentes a este
            cliente.
          </p>
        </div>
      </div>

      {!hasAnyInstaller ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
          Nenhum instalador foi cadastrado para este cliente ainda. Solicite à
          Safesys a liberação dos links de implantação.
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-3">
        <InstallerCard
          title="Windows"
          description="Instalador para estações e servidores Microsoft Windows."
          url={data.trmm_windows_agent_url}
          disabledMessage="Instalador Windows ainda não cadastrado para este cliente."
        />

        <InstallerCard
          title="Linux"
          description="Instalador para servidores e endpoints Linux compatíveis."
          url={data.trmm_linux_agent_url}
          disabledMessage="Instalador Linux ainda não cadastrado para este cliente."
        />

        <InstallerCard
          title="macOS"
          description="Instalador para dispositivos Apple compatíveis."
          url={data.trmm_macos_agent_url}
          disabledMessage="Instalador macOS ainda não cadastrado para este cliente."
        />
      </div>

      {data.notes ? (
        <div className="rounded-2xl border border-surface-border bg-white p-5 shadow-sm">
          <h3 className="text-lg font-semibold text-brand-900">
            Observações de implantação
          </h3>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-600">
            {data.notes}
          </p>
        </div>
      ) : null}
    </section>
  );
}
