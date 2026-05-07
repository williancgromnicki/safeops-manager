'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

type RemoteBackgroundWorkspaceProps = {
  deviceId: string;
  customerId: string;
  deviceName: string;
};

type RemoteBackgroundResponse = {
  ok: boolean;
  url?: string;
  error?: string;
  mesh?: {
    hostname?: string | null;
    status?: string | null;
    client?: string | null;
    site?: string | null;
    mode?: string | null;
    viewmode?: number | null;
  };
};

type ServicesResponse = {
  ok: boolean;
  error?: string;
  services?: ServiceItem[];
};

type ServiceActionResponse = {
  ok: boolean;
  status?: 'success' | 'warning' | 'failed';
  message?: string;
  output?: string;
  error?: string;
};

type ServiceAction = 'start' | 'stop' | 'restart';

type ServiceItem = {
  name: string;
  displayName: string;
  status: string;
  startType: string;
  username: string;
  pid: number;
  description: string;
  binPath: string;
  autoDelay: boolean;
};

type RemoteTab =
  | 'terminal'
  | 'files'
  | 'services'
  | 'processes'
  | 'eventlog'
  | 'registry';

const tabs: Array<{
  key: RemoteTab;
  label: string;
  description: string;
}> = [
  {
    key: 'terminal',
    label: 'Terminal',
    description: 'Sessão de terminal remoto para suporte e administração.',
  },
  {
    key: 'files',
    label: 'File Browser',
    description: 'Navegação de arquivos do dispositivo.',
  },
  {
    key: 'services',
    label: 'Services',
    description: 'Serviços do Windows e respectivos estados.',
  },
  {
    key: 'processes',
    label: 'Processes',
    description: 'Processos em execução no endpoint.',
  },
  {
    key: 'eventlog',
    label: 'Event Log',
    description: 'Eventos do Windows com filtros operacionais.',
  },
  {
    key: 'registry',
    label: 'Registry',
    description: 'Consulta controlada ao Registro do Windows.',
  },
];

function getStatusLabel(status?: string | null) {
  if (!status) return 'Status desconhecido';

  if (status.toLowerCase() === 'online') {
    return 'Online';
  }

  if (status.toLowerCase() === 'offline') {
    return 'Offline';
  }

  return status;
}

function getStatusClassName(status?: string | null) {
  if (status?.toLowerCase() === 'online') {
    return 'bg-emerald-50 text-emerald-700 ring-emerald-600/20';
  }

  if (status?.toLowerCase() === 'offline') {
    return 'bg-rose-50 text-rose-700 ring-rose-600/20';
  }

  return 'bg-slate-50 text-slate-700 ring-slate-600/20';
}

function getServiceStatusLabel(status: string) {
  const normalized = status.toLowerCase();

  if (normalized === 'running') return 'Em execução';
  if (normalized === 'stopped') return 'Parado';
  if (normalized === 'paused') return 'Pausado';

  return status || 'Desconhecido';
}

function getServiceStatusClassName(status: string) {
  const normalized = status.toLowerCase();

  if (normalized === 'running') {
    return 'bg-emerald-50 text-emerald-700 ring-emerald-600/20';
  }

  if (normalized === 'stopped') {
    return 'bg-slate-50 text-slate-700 ring-slate-600/20';
  }

  if (normalized === 'paused') {
    return 'bg-amber-50 text-amber-700 ring-amber-600/20';
  }

  return 'bg-slate-50 text-slate-700 ring-slate-600/20';
}

function getActionLabel(action: ServiceAction) {
  if (action === 'start') return 'Iniciar';
  if (action === 'stop') return 'Parar';

  return 'Reiniciar';
}

function formatPid(pid: number) {
  return pid > 0 ? String(pid) : '—';
}

function PlaceholderPanel({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex min-h-[420px] items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
      <div className="max-w-md">
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-700">
          Em desenvolvimento
        </p>

        <h3 className="mt-2 text-lg font-semibold text-slate-900">{title}</h3>

        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          {description}
        </p>

        <p className="mt-4 text-xs leading-relaxed text-slate-500">
          Esta funcionalidade será disponibilizada em uma próxima atualização do
          SafeOps Manager, com controle de permissão, rastreabilidade e operação
          segura para equipes de TI.
        </p>
      </div>
    </div>
  );
}

function ServiceDetailsModal({
  service,
  onClose,
}: {
  service: ServiceItem;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 py-6">
      <div className="w-full max-w-3xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="border-b border-slate-100 px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">
                Propriedades do serviço
              </p>

              <h3 className="mt-1 text-lg font-semibold text-slate-950">
                {service.displayName}
              </h3>

              <p className="mt-1 text-sm text-slate-500">{service.name}</p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-2 py-1 text-sm font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
              aria-label="Fechar propriedades"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="max-h-[70vh] space-y-5 overflow-auto px-5 py-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Status
              </p>
              <p className="mt-1 font-medium text-slate-900">
                {getServiceStatusLabel(service.status)}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Tipo de inicialização
              </p>
              <p className="mt-1 font-medium text-slate-900">
                {service.startType}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Usuário
              </p>
              <p className="mt-1 break-all font-medium text-slate-900">
                {service.username}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                PID
              </p>
              <p className="mt-1 font-medium text-slate-900">
                {formatPid(service.pid)}
              </p>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Descrição
            </p>
            <p className="mt-2 rounded-xl border border-slate-200 bg-white p-4 text-sm leading-relaxed text-slate-700">
              {service.description || 'Sem descrição disponível.'}
            </p>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Caminho do executável
            </p>
            <pre className="mt-2 overflow-auto rounded-xl border border-slate-200 bg-slate-950 p-4 text-xs leading-relaxed text-slate-100">
              {service.binPath || 'Não informado'}
            </pre>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            Início automático atrasado:{' '}
            <span className="font-semibold text-slate-900">
              {service.autoDelay ? 'Sim' : 'Não'}
            </span>
          </div>
        </div>

        <div className="border-t border-slate-100 bg-slate-50 px-5 py-4 text-right">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

function ServiceActionConfirmModal({
  service,
  action,
  isRunning,
  onConfirm,
  onClose,
}: {
  service: ServiceItem;
  action: ServiceAction;
  isRunning: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 py-6">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="border-b border-slate-100 px-5 py-4">
          <h3 className="text-lg font-semibold text-slate-950">
            Confirmar ação
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            Você está prestes a executar uma ação operacional em um serviço do
            dispositivo.
          </p>
        </div>

        <div className="space-y-4 px-5 py-5">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Serviço
            </p>
            <p className="mt-1 font-semibold text-slate-900">
              {service.displayName}
            </p>
            <p className="mt-1 text-xs text-slate-500">{service.name}</p>
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-relaxed text-amber-800">
            Ação solicitada:{' '}
            <span className="font-semibold">{getActionLabel(action)}</span>.
            Confirme apenas se você entende o impacto operacional dessa ação.
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 bg-slate-50 px-5 py-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={isRunning}
            className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={onConfirm}
            disabled={isRunning}
            className="inline-flex items-center justify-center rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isRunning ? 'Executando...' : `Confirmar ${getActionLabel(action)}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function ServicesPanel({
  services,
  isLoading,
  message,
  actionMessage,
  actionMessageType,
  activeServiceAction,
  onRefresh,
  onRunAction,
}: {
  services: ServiceItem[];
  isLoading: boolean;
  message: string | null;
  actionMessage: string | null;
  actionMessageType: 'success' | 'warning' | 'error' | null;
  activeServiceAction: string | null;
  onRefresh: () => void;
  onRunAction: (service: ServiceItem, action: ServiceAction) => Promise<void>;
}) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'running' | 'stopped'
  >('all');
  const [selectedService, setSelectedService] = useState<ServiceItem | null>(
    null,
  );
  const [pendingAction, setPendingAction] = useState<{
    service: ServiceItem;
    action: ServiceAction;
  } | null>(null);

  const filteredServices = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return services.filter((service) => {
      const matchesSearch =
        !normalizedSearch ||
        service.name.toLowerCase().includes(normalizedSearch) ||
        service.displayName.toLowerCase().includes(normalizedSearch) ||
        service.description.toLowerCase().includes(normalizedSearch);

      const normalizedStatus = service.status.toLowerCase();

      const matchesStatus =
        statusFilter === 'all' || normalizedStatus === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [search, services, statusFilter]);

  const runningCount = services.filter(
    (service) => service.status.toLowerCase() === 'running',
  ).length;

  const stoppedCount = services.filter(
    (service) => service.status.toLowerCase() === 'stopped',
  ).length;

  async function confirmPendingAction() {
    if (!pendingAction) return;

    await onRunAction(pendingAction.service, pendingAction.action);
    setPendingAction(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">
            Serviços do dispositivo
          </h3>

          <p className="mt-1 text-xs text-slate-600">
            {services.length} serviços encontrados • {runningCount} em execução
            • {stoppedCount} parados
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar serviço..."
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 sm:w-64"
          />

          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(
                event.target.value as 'all' | 'running' | 'stopped',
              )
            }
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
          >
            <option value="all">Todos</option>
            <option value="running">Em execução</option>
            <option value="stopped">Parados</option>
          </select>

          <button
            type="button"
            onClick={onRefresh}
            disabled={isLoading}
            className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? 'Atualizando...' : 'Atualizar'}
          </button>
        </div>
      </div>

      {message ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {message}
        </div>
      ) : null}

      {actionMessage ? (
        <div
          className={[
            'rounded-xl border px-4 py-3 text-sm',
            actionMessageType === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : null,
            actionMessageType === 'warning'
              ? 'border-amber-200 bg-amber-50 text-amber-800'
              : null,
            actionMessageType === 'error'
              ? 'border-rose-200 bg-rose-50 text-rose-800'
              : null,
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {actionMessage}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="max-h-[620px] overflow-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">
                  Serviço
                </th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">
                  Status
                </th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">
                  Inicialização
                </th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">
                  Usuário
                </th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">
                  PID
                </th>
                <th className="px-4 py-3 text-right font-semibold text-slate-700">
                  Ações
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 bg-white">
              {isLoading && services.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center text-slate-500"
                  >
                    Carregando serviços...
                  </td>
                </tr>
              ) : null}

              {!isLoading && filteredServices.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center text-slate-500"
                  >
                    Nenhum serviço encontrado com os filtros atuais.
                  </td>
                </tr>
              ) : null}

              {filteredServices.map((service) => {
                const normalizedStatus = service.status.toLowerCase();
                const actionKey = service.name;

                return (
                  <tr
                    key={`${service.name}-${service.pid}`}
                    className="align-top"
                  >
                    <td className="max-w-xl px-4 py-3">
                      <p className="font-semibold text-slate-900">
                        {service.displayName}
                      </p>

                      <p className="mt-1 text-xs text-slate-500">
                        {service.name}
                      </p>

                      {service.description ? (
                        <p className="mt-2 max-w-xl text-xs leading-relaxed text-slate-500">
                          {service.description.length > 160
                            ? `${service.description.slice(0, 160)}...`
                            : service.description}
                        </p>
                      ) : null}
                    </td>

                    <td className="px-4 py-3">
                      <span
                        className={[
                          'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset',
                          getServiceStatusClassName(service.status),
                        ].join(' ')}
                      >
                        {getServiceStatusLabel(service.status)}
                      </span>
                    </td>

                    <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                      {service.startType}
                    </td>

                    <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                      {service.username}
                    </td>

                    <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                      {formatPid(service.pid)}
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex flex-wrap justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedService(service)}
                          className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                        >
                          Detalhes
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            setPendingAction({
                              service,
                              action: 'start',
                            })
                          }
                          disabled={
                            activeServiceAction === actionKey ||
                            normalizedStatus === 'running'
                          }
                          className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 shadow-sm transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Iniciar
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            setPendingAction({
                              service,
                              action: 'stop',
                            })
                          }
                          disabled={
                            activeServiceAction === actionKey ||
                            normalizedStatus === 'stopped'
                          }
                          className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-700 shadow-sm transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Parar
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            setPendingAction({
                              service,
                              action: 'restart',
                            })
                          }
                          disabled={
                            activeServiceAction === actionKey ||
                            normalizedStatus !== 'running'
                          }
                          className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-700 shadow-sm transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Reiniciar
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {selectedService ? (
        <ServiceDetailsModal
          service={selectedService}
          onClose={() => setSelectedService(null)}
        />
      ) : null}

      {pendingAction ? (
        <ServiceActionConfirmModal
          service={pendingAction.service}
          action={pendingAction.action}
          isRunning={activeServiceAction === pendingAction.service.name}
          onClose={() => setPendingAction(null)}
          onConfirm={confirmPendingAction}
        />
      ) : null}
    </div>
  );
}

export function RemoteBackgroundWorkspace({
  deviceId,
  customerId,
  deviceName,
}: RemoteBackgroundWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<RemoteTab>('terminal');
  const [terminalUrl, setTerminalUrl] = useState<string | null>(null);
  const [meshStatus, setMeshStatus] = useState<string | null>(null);
  const [isLoadingTerminal, setIsLoadingTerminal] = useState(false);
  const [terminalMessage, setTerminalMessage] = useState<string | null>(null);

  const [services, setServices] = useState<ServiceItem[]>([]);
  const [isLoadingServices, setIsLoadingServices] = useState(false);
  const [servicesMessage, setServicesMessage] = useState<string | null>(null);
  const [hasLoadedServices, setHasLoadedServices] = useState(false);
  const [activeServiceAction, setActiveServiceAction] = useState<string | null>(
    null,
  );
  const [serviceActionMessage, setServiceActionMessage] = useState<
    string | null
  >(null);
  const [serviceActionMessageType, setServiceActionMessageType] = useState<
    'success' | 'warning' | 'error' | null
  >(null);

  const activeTabDescription = useMemo(
    () => tabs.find((tab) => tab.key === activeTab)?.description ?? '',
    [activeTab],
  );

  const loadTerminalSession = useCallback(async () => {
    try {
      setIsLoadingTerminal(true);
      setTerminalMessage(null);

      const response = await fetch(
        `/api/devices/${encodeURIComponent(
          deviceId,
        )}/remote-background?customerId=${encodeURIComponent(customerId)}`,
        {
          method: 'POST',
          cache: 'no-store',
        },
      );

      const data = (await response.json()) as RemoteBackgroundResponse;

      if (!response.ok || !data.ok || !data.url) {
        throw new Error(
          data.error ?? 'Não foi possível abrir a sessão remota.',
        );
      }

      setTerminalUrl(data.url);
      setMeshStatus(data.mesh?.status ?? null);
    } catch (error) {
      setTerminalMessage(
        error instanceof Error
          ? error.message
          : 'Erro ao abrir sessão remota.',
      );
    } finally {
      setIsLoadingTerminal(false);
    }
  }, [customerId, deviceId]);

  const loadServices = useCallback(async () => {
    try {
      setIsLoadingServices(true);
      setServicesMessage(null);

      const response = await fetch(
        `/api/devices/${encodeURIComponent(
          deviceId,
        )}/remote-background/services?customerId=${encodeURIComponent(
          customerId,
        )}`,
        {
          method: 'GET',
          cache: 'no-store',
        },
      );

      const data = (await response.json()) as ServicesResponse;

      if (!response.ok || !data.ok) {
        throw new Error(
          data.error ?? 'Não foi possível carregar os serviços.',
        );
      }

      setServices(Array.isArray(data.services) ? data.services : []);
      setHasLoadedServices(true);
    } catch (error) {
      setServicesMessage(
        error instanceof Error
          ? error.message
          : 'Erro ao carregar serviços.',
      );
    } finally {
      setIsLoadingServices(false);
    }
  }, [customerId, deviceId]);

  const runServiceAction = useCallback(
    async (service: ServiceItem, action: ServiceAction) => {
      try {
        setActiveServiceAction(service.name);
        setServiceActionMessage(null);
        setServiceActionMessageType(null);

        const response = await fetch(
          `/api/devices/${encodeURIComponent(
            deviceId,
          )}/remote-background/services/action?customerId=${encodeURIComponent(
            customerId,
          )}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            cache: 'no-store',
            body: JSON.stringify({
              serviceName: service.name,
              action,
            }),
          },
        );

        const data = (await response.json()) as ServiceActionResponse;

        if (!response.ok || !data.ok) {
          throw new Error(
            data.error ?? data.message ?? 'Não foi possível executar a ação.',
          );
        }

        setServiceActionMessage(data.message ?? 'Operação executada.');
        setServiceActionMessageType(
          data.status === 'warning' ? 'warning' : 'success',
        );

        await loadServices();
      } catch (error) {
        setServiceActionMessage(
          error instanceof Error
            ? error.message
            : 'Erro ao executar ação de serviço.',
        );
        setServiceActionMessageType('error');
      } finally {
        setActiveServiceAction(null);
      }
    },
    [customerId, deviceId, loadServices],
  );

  useEffect(() => {
    void loadTerminalSession();
  }, [loadTerminalSession]);

  useEffect(() => {
    if (activeTab === 'services' && !hasLoadedServices) {
      void loadServices();
    }
  }, [activeTab, hasLoadedServices, loadServices]);

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-surface-border bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">
              Operação remota
            </p>

            <h2 className="mt-1 text-xl font-semibold text-slate-950">
              {deviceName}
            </h2>

            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
              Console operacional remoto para suporte, diagnóstico e
              administração segura do dispositivo.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span
              className={[
                'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset',
                getStatusClassName(meshStatus),
              ].join(' ')}
            >
              {getStatusLabel(meshStatus)}
            </span>

            <button
              type="button"
              onClick={loadTerminalSession}
              disabled={isLoadingTerminal}
              className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoadingTerminal ? 'Renovando...' : 'Renovar sessão'}
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-surface-border bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 pt-4">
          <div className="flex gap-2 overflow-x-auto">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.key;

              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={[
                    'whitespace-nowrap rounded-t-xl px-4 py-3 text-sm font-semibold transition',
                    isActive
                      ? 'bg-brand-50 text-brand-800'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
                  ].join(' ')}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="border-b border-slate-100 px-5 py-3">
          <p className="text-sm text-slate-600">{activeTabDescription}</p>
        </div>

        <div className="p-5">
          {activeTab === 'terminal' ? (
            <>
              {terminalMessage ? (
                <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                  {terminalMessage}
                </div>
              ) : null}

              <div className="overflow-hidden rounded-2xl border border-slate-300 bg-slate-950">
                {isLoadingTerminal ? (
                  <div className="flex min-h-[620px] items-center justify-center p-8 text-center">
                    <div>
                      <p className="text-sm font-semibold text-white">
                        Abrindo sessão de terminal...
                      </p>
                      <p className="mt-2 text-xs text-slate-300">
                        Aguarde enquanto a sessão segura é preparada.
                      </p>
                    </div>
                  </div>
                ) : terminalUrl ? (
                  <iframe
                    title={`Remote Background Terminal - ${deviceName}`}
                    src={terminalUrl}
                    className="h-[720px] w-full bg-white"
                    allow="clipboard-read; clipboard-write; fullscreen"
                  />
                ) : (
                  <div className="flex min-h-[620px] items-center justify-center p-8 text-center">
                    <div>
                      <p className="text-sm font-semibold text-white">
                        Sessão não iniciada
                      </p>
                      <p className="mt-2 text-xs text-slate-300">
                        Clique em “Renovar sessão” para tentar novamente.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : null}

          {activeTab === 'files' ? (
            <PlaceholderPanel
              title="File Browser"
              description="Próxima fase: listar diretórios e arquivos com controle de permissão, trilha de auditoria e ações seguras."
            />
          ) : null}

          {activeTab === 'services' ? (
            <ServicesPanel
              services={services}
              isLoading={isLoadingServices}
              message={servicesMessage}
              actionMessage={serviceActionMessage}
              actionMessageType={serviceActionMessageType}
              activeServiceAction={activeServiceAction}
              onRefresh={loadServices}
              onRunAction={runServiceAction}
            />
          ) : null}

          {activeTab === 'processes' ? (
            <PlaceholderPanel
              title="Processes"
              description="Próxima fase: listar processos em execução e permitir ações administrativas controladas."
            />
          ) : null}

          {activeTab === 'eventlog' ? (
            <PlaceholderPanel
              title="Event Log"
              description="Próxima fase: consultar eventos do Windows com filtros por log, severidade, origem e período."
            />
          ) : null}

          {activeTab === 'registry' ? (
            <PlaceholderPanel
              title="Registry"
              description="Próxima fase: navegação controlada do Registro do Windows, com foco em consulta e auditoria."
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
