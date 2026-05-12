import { redirect } from 'next/navigation';

import { DataTable } from '@/components/DataTable';
import { EmptyState } from '@/components/EmptyState';
import { RemoteJobsRefreshButton } from '@/components/RemoteJobsRefreshButton';
import { resolveCurrentCustomer } from '@/lib/data/get-current-customer';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type RemoteJobsPageProps = {
  searchParams?: Promise<{
    customerId?: string;
  }>;
};

type RemoteJobRow = {
  id: string;
  customer_id: string;
  device_id: string | null;
  job_type: string;
  status: string;
  requested_by_email: string | null;
  requested_by_role: string | null;
  command_key: string | null;
  command_label: string | null;
  parameters: Record<string, unknown> | null;
  result: Record<string, unknown> | null;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  devices:
    | {
        hostname: string;
      }
    | {
        hostname: string;
      }[]
    | null;
  customers:
    | {
        name: string;
      }
    | {
        name: string;
      }[]
    | null;
};

function normalizeRelatedName(
  value:
    | {
        name: string;
      }
    | {
        name: string;
      }[]
    | null,
): string {
  if (Array.isArray(value)) {
    return value[0]?.name ?? '—';
  }

  return value?.name ?? '—';
}

function normalizeDeviceHostname(
  value:
    | {
        hostname: string;
      }
    | {
        hostname: string;
      }[]
    | null,
): string {
  if (Array.isArray(value)) {
    return value[0]?.hostname ?? '—';
  }

  return value?.hostname ?? '—';
}

function formatDateTime(value?: string | null): string {
  if (!value) {
    return '—';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString('pt-BR');
}

function translateJobType(value: string): string {
  const normalized = value.toLowerCase();

  if (normalized === 'software_install') {
    return 'Instalação de software';
  }

  if (normalized === 'remote_background') {
    return 'Ação remota';
  }

  if (normalized === 'remote_background_session') {
    return 'Sessão remota';
  }

  if (normalized === 'take_control_session') {
    return 'Sessão de acesso remoto';
  }

  if (normalized === 'script_execution') {
    return 'Execução de script';
  }

  if (normalized === 'windows_update_scan') {
    return 'Verificação de updates';
  }

  if (normalized === 'windows_update_approval') {
    return 'Ação de update';
  }

  if (normalized === 'windows_update_install') {
    return 'Instalação de updates';
  }

  if (normalized === 'windows_update_precheck') {
    return 'Pré-check de updates';
  }

  return value;
}

function translateStatus(value: string): string {
  const normalized = value.toLowerCase();

  const labels: Record<string, string> = {
    queued: 'Na fila',
    running: 'Executando',
    success: 'Sucesso',
    failed: 'Falhou',
    cancelled: 'Cancelado',
  };

  return labels[normalized] ?? value;
}

function statusClassName(value: string): string {
  const normalized = value.toLowerCase();

  if (normalized === 'success') {
    return 'bg-emerald-50 text-emerald-700 ring-emerald-600/20';
  }

  if (normalized === 'failed') {
    return 'bg-rose-50 text-rose-700 ring-rose-600/20';
  }

  if (normalized === 'running') {
    return 'bg-blue-50 text-blue-700 ring-blue-600/20';
  }

  if (normalized === 'queued') {
    return 'bg-amber-50 text-amber-700 ring-amber-600/20';
  }

  return 'bg-slate-50 text-slate-700 ring-slate-600/20';
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={[
        'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset',
        statusClassName(status),
      ].join(' ')}
    >
      {translateStatus(status)}
    </span>
  );
}

function formatParameters(value: Record<string, unknown> | null): string {
  if (!value || Object.keys(value).length === 0) {
    return '—';
  }

  const packageId =
    typeof value.package_id === 'string' ? value.package_id : null;
  const action = typeof value.action === 'string' ? value.action : null;
  const kb = typeof value.kb === 'string' ? value.kb : null;
  const title = typeof value.title === 'string' ? value.title : null;

  if (packageId) {
    return `Pacote: ${packageId}`;
  }

  if (kb && title) {
    return `${kb} · ${title}`;
  }

  if (kb) {
    return kb;
  }

  if (action) {
    const actionLabels: Record<string, string> = {
      scan: 'Verificar updates',
      'install-approved': 'Instalar aprovados',
      'approve-update': 'Aprovar update',
      'ignore-update': 'Ignorar update',
      'reset-update': 'Limpar ação',
    };

    return actionLabels[action] ?? `Ação: ${action}`;
  }

  return JSON.stringify(value);
}

function formatResult(value: Record<string, unknown> | null): string {
  if (!value || Object.keys(value).length === 0) {
    return '—';
  }

  const message = typeof value.message === 'string' ? value.message : null;
  const reboot =
    typeof value.reboot_pending === 'boolean' ? value.reboot_pending : null;
  const retcode = typeof value.retcode === 'number' ? value.retcode : null;
  const executionTime =
    typeof value.execution_time === 'number' ? value.execution_time : null;
  const stdout = typeof value.stdout === 'string' ? value.stdout : null;
  const stderr = typeof value.stderr === 'string' ? value.stderr : null;

  if (message && reboot !== null) {
    return `${message}\nReboot pendente: ${reboot ? 'Sim' : 'Não'}.`;
  }

  if (message) {
    return message;
  }

  if (retcode !== null) {
    const lines = [
      `Retcode: ${retcode}`,
      executionTime !== null ? `Tempo: ${executionTime}s` : null,
      stdout ? `Saída: ${stdout.slice(0, 500)}${stdout.length > 500 ? '...' : ''}` : null,
      stderr ? `Erro: ${stderr.slice(0, 300)}${stderr.length > 300 ? '...' : ''}` : null,
    ].filter(Boolean);

    return lines.join('\n');
  }

  return JSON.stringify(value, null, 2);
}


export default async function RemoteJobsPage({
  searchParams,
}: RemoteJobsPageProps) {
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
          description="Seu usuário ainda não possui clientes vinculados para exibição de jobs remotos."
        />
      </section>
    );
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from('remote_jobs')
    .select(
      [
        'id',
        'customer_id',
        'device_id',
        'job_type',
        'status',
        'requested_by_email',
        'requested_by_role',
        'command_key',
        'command_label',
        'parameters',
        'result',
        'error_message',
        'created_at',
        'started_at',
        'finished_at',
        'devices:devices(hostname)',
        'customers:customers(name)',
      ].join(', '),
    )
    .eq('customer_id', activeCustomer.customerId)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    throw new Error(`Erro ao carregar jobs remotos: ${error.message}`);
  }

  const jobs = (data ?? []) as unknown as RemoteJobRow[];

  return (
    <section className="space-y-6">
      <div className="rounded-2xl border border-surface-border bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="section-title">Jobs remotos</h2>
            <p className="mt-2 text-sm text-slate-600">
              Histórico de ações remotas do cliente{' '}
              <span className="font-semibold text-slate-800">
                {activeCustomer.customerName}
              </span>
              , incluindo sessões remotas, instalações, scripts, updates e ações
              operacionais.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="rounded-xl border border-brand-100 bg-brand-50 px-4 py-3 text-sm text-brand-900">
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">
                Últimos registros
              </p>
              <p className="mt-1 text-2xl font-bold">{jobs.length}</p>
            </div>

            <RemoteJobsRefreshButton customerId={activeCustomer.customerId} />
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-surface-border bg-white p-5 shadow-sm">
        {jobs.length === 0 ? (
          <EmptyState
            title="Nenhum job remoto registrado"
            description="As ações remotas solicitadas pelo SafeOps Manager para este cliente aparecerão aqui."
          />
        ) : (
          <DataTable
            columns={[
              'Criado em',
              'Cliente',
              'Dispositivo',
              'Tipo',
              'Status',
              'Comando',
              'Parâmetros',
              'Resultado',
              'Solicitante',
              'Finalizado em',
              'Erro',
            ]}
          >
            {jobs.map((job) => (
              <tr key={job.id} className="align-top text-slate-700">
                <td className="whitespace-nowrap px-4 py-3 text-sm">
                  {formatDateTime(job.created_at)}
                </td>

                <td className="px-4 py-3 text-sm">
                  {normalizeRelatedName(job.customers)}
                </td>

                <td className="px-4 py-3 text-sm font-medium text-slate-800">
                  {normalizeDeviceHostname(job.devices)}
                </td>

                <td className="px-4 py-3 text-sm">
                  {translateJobType(job.job_type)}
                </td>

                <td className="px-4 py-3">
                  <StatusBadge status={job.status} />
                </td>

                <td className="px-4 py-3 text-sm">
                  {job.command_label ?? job.command_key ?? '—'}
                </td>

                <td className="max-w-xs break-words px-4 py-3 text-sm">
                  <div className="max-w-xs whitespace-pre-wrap break-words">
                    {formatParameters(job.parameters)}
                  </div>
                </td>

                <td className="max-w-md px-4 py-3 text-sm">
                  <div className="max-h-48 max-w-md overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-2 text-xs leading-relaxed text-slate-700">
                    {formatResult(job.result)}
                  </div>
                </td>

                <td className="px-4 py-3 text-sm">
                  <p>{job.requested_by_email ?? '—'}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {job.requested_by_role ?? '—'}
                  </p>
                </td>

                <td className="whitespace-nowrap px-4 py-3 text-sm">
                  {formatDateTime(job.finished_at)}
                </td>

                <td className="max-w-sm px-4 py-3 text-sm text-rose-700">
                  <div className="max-w-sm whitespace-pre-wrap break-words">
                    {job.error_message ?? '—'}
                  </div>
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </div>
    </section>
  );
}
