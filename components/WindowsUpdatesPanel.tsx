'use client';

import { useEffect, useMemo, useState } from 'react';

type WindowsUpdate = {
  id: number;
  kb?: string | null;
  title?: string | null;
  severity?: string | null;
  categories?: string[];
  action?: string | null;
  result?: string | null;
  installed?: boolean;
  downloaded?: boolean;
  description?: string | null;
  more_info_urls?: string[];
};

type WindowsUpdateDevice = {
  agent_id: string;
  hostname: string;
  client_name: string | null;
  site_name: string | null;
  monitoring_type: string | null;
  status: string | null;
  last_seen: string | null;
  logged_username: string | null;
  needs_reboot: boolean;
  has_patches_pending: boolean;
  operating_system: string | null;
  updates_total: number;
  updates_pending: number;
  updates_approved: number;
  updates_critical: number;
  updates_security: number;
  updates_definition: number;
  updates_downloaded: number;
  updates: WindowsUpdate[];
};

type WindowsUpdatesResponse = {
  ok: boolean;
  error?: string;
  customer?: {
    id: string;
    name: string;
    tactical_client_id: number;
  };
  totals?: {
    devices: number;
    pending: number;
    approved: number;
    critical: number;
    security: number;
    reboot: number;
  };
  devices?: WindowsUpdateDevice[];
};

type StatusMessage = {
  type: 'success' | 'error' | 'info';
  message: string;
} | null;

type WindowsUpdatesPanelProps = {
  customerId: string;
};

const cardClassName =
  'rounded-2xl border border-surface-border bg-white p-5 shadow-sm';


type InstallChecklistStatus = 'pending' | 'running' | 'success' | 'error' | 'skipped';

type InstallChecklistItem = {
  key: string;
  label: string;
  status: InstallChecklistStatus;
  detail?: string;
};

const INSTALL_CHECKLIST_TEMPLATE: InstallChecklistItem[] = [
  {
    key: 'prepare',
    label: 'Preparando validação da instalação',
    status: 'pending',
  },
  {
    key: 'precheck-service',
    label: 'Verificando serviço Windows Update',
    status: 'pending',
  },
  {
    key: 'precheck-support',
    label: 'Verificando serviços auxiliares e políticas',
    status: 'pending',
  },
  {
    key: 'precheck-reboot',
    label: 'Verificando reboot pendente',
    status: 'pending',
  },
  {
    key: 'install-request',
    label: 'Solicitando instalação dos updates aprovados',
    status: 'pending',
  },
  {
    key: 'result',
    label: 'Aguardando resultado da operação',
    status: 'pending',
  },
];

function updateChecklistStep(
  items: InstallChecklistItem[],
  key: string,
  patch: Partial<InstallChecklistItem>,
) {
  return items.map((item) =>
    item.key === key
      ? {
          ...item,
          ...patch,
        }
      : item,
  );
}

function getChecklistStatusClasses(status: InstallChecklistStatus) {
  if (status === 'success') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  }

  if (status === 'error') {
    return 'border-rose-200 bg-rose-50 text-rose-700';
  }

  if (status === 'running') {
    return 'border-brand-200 bg-brand-50 text-brand-700';
  }

  if (status === 'skipped') {
    return 'border-slate-200 bg-slate-50 text-slate-500';
  }

  return 'border-slate-200 bg-white text-slate-500';
}

function getChecklistIcon(status: InstallChecklistStatus) {
  if (status === 'success') {
    return '✓';
  }

  if (status === 'error') {
    return '✕';
  }

  if (status === 'running') {
    return '…';
  }

  if (status === 'skipped') {
    return '—';
  }

  return '•';
}

function getPrecheckFailureStep(message: string) {
  const normalized = message.toLowerCase();

  if (
    normalized.includes('windows update') ||
    normalized.includes('parada pendente') ||
    normalized.includes('stoppending') ||
    normalized.includes('stop pending')
  ) {
    return 'precheck-service';
  }

  if (
    normalized.includes('reboot') ||
    normalized.includes('reinicial')
  ) {
    return 'precheck-reboot';
  }

  if (
    normalized.includes('politica') ||
    normalized.includes('política') ||
    normalized.includes('criptografia') ||
    normalized.includes('trustedinstaller') ||
    normalized.includes('bits')
  ) {
    return 'precheck-support';
  }

  return 'prepare';
}


const buttonClassName =
  'inline-flex items-center justify-center rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-60';

const secondaryButtonClassName =
  'inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60';

const dangerButtonClassName =
  'inline-flex items-center justify-center rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 shadow-sm transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60';

const inputClassName =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100';

function normalize(value?: string | null): string {
  return (value ?? '').trim().toLowerCase();
}

function formatDate(value?: string | null): string {
  if (!value) {
    return '—';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString('pt-BR');
}

function severityLabel(severity?: string | null): string {
  const value = normalize(severity);

  if (!value) {
    return 'Sem severidade';
  }

  if (value === 'critical') {
    return 'Crítica';
  }

  if (value === 'important') {
    return 'Importante';
  }

  return severity ?? 'Sem severidade';
}

function actionLabel(action?: string | null): string {
  const value = normalize(action);

  if (value === 'approve') {
    return 'Aprovado';
  }

  if (value === 'ignore') {
    return 'Ignorado';
  }

  if (value === 'decline') {
    return 'Recusado';
  }

  return 'Sem ação';
}

function getDeviceType(device: WindowsUpdateDevice): 'server' | 'workstation' {
  const monitoringType = normalize(device.monitoring_type);
  const operatingSystem = normalize(device.operating_system);
  const hostname = normalize(device.hostname);

  if (
    monitoringType.includes('server') ||
    operatingSystem.includes('server') ||
    hostname.startsWith('srv-') ||
    hostname.includes('-srv-')
  ) {
    return 'server';
  }

  return 'workstation';
}

function getDeviceTypeLabel(device: WindowsUpdateDevice): string {
  return getDeviceType(device) === 'server' ? 'Servidor' : 'Estação';
}

function getDeviceTypeBadgeClass(device: WindowsUpdateDevice): string {
  return getDeviceType(device) === 'server'
    ? 'bg-indigo-50 text-indigo-700'
    : 'bg-slate-100 text-slate-700';
}

function getInstallButtonLabel(device: WindowsUpdateDevice): string {
  return getDeviceType(device) === 'server'
    ? 'Instalar em servidor'
    : 'Instalar aprovados';
}

function getInstallConfirmationMessage(device: WindowsUpdateDevice): string {
  if (getDeviceType(device) === 'server') {
    return [
      `Você está prestes a instalar updates aprovados no servidor ${device.hostname}.`,
      'Confirme que há janela de manutenção autorizada e que o impacto de reinicialização foi considerado.',
      'Deseja continuar?',
    ].join('\n\n');
  }

  return `Instalar os updates aprovados em ${device.hostname}?`;
}

function getUpdateBadgeClass(update: WindowsUpdate): string {
  if (normalize(update.severity) === 'critical') {
    return 'border-red-200 bg-red-50 text-red-700';
  }

  if (normalize(update.action) === 'approve') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  }

  return 'border-slate-200 bg-slate-50 text-slate-600';
}

export function WindowsUpdatesPanel({ customerId }: WindowsUpdatesPanelProps) {
  const [devices, setDevices] = useState<WindowsUpdateDevice[]>([]);
  const [totals, setTotals] = useState<WindowsUpdatesResponse['totals']>();
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [isLoadingUpdates, setIsLoadingUpdates] = useState(false);
  const [runningAction, setRunningAction] = useState<string | null>(null);
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [installChecklist, setInstallChecklist] = useState<InstallChecklistItem[]>(INSTALL_CHECKLIST_TEMPLATE);
  const [installModalTitle, setInstallModalTitle] = useState('');
  const [installModalMessage, setInstallModalMessage] = useState('');
  const [installModalFinished, setInstallModalFinished] = useState(false);
  const [status, setStatus] = useState<StatusMessage>(null);

  const selectedDevice = useMemo(
    () => devices.find((device) => device.agent_id === selectedAgentId) ?? null,
    [devices, selectedAgentId],
  );


  useEffect(() => {
    if (!showInstallModal || !runningAction || runningAction !== 'install-approved') {
      return;
    }

    setInstallChecklist((current) =>
      updateChecklistStep(current, 'prepare', {
        status: 'running',
        detail: 'Iniciando validação prévia da instalação.',
      }),
    );

    const timer1 = window.setTimeout(() => {
      setInstallChecklist((current) => {
        let next = updateChecklistStep(current, 'prepare', {
          status: 'success',
          detail: 'Validação inicial iniciada com sucesso.',
        });
        next = updateChecklistStep(next, 'precheck-service', {
          status: 'running',
          detail: 'Conferindo o serviço Windows Update.',
        });
        return next;
      });
    }, 600);

    const timer2 = window.setTimeout(() => {
      setInstallChecklist((current) => {
        let next = updateChecklistStep(current, 'precheck-service', {
          status: 'success',
          detail: 'Serviço principal validado.',
        });
        next = updateChecklistStep(next, 'precheck-support', {
          status: 'running',
          detail: 'Conferindo serviços auxiliares e políticas.',
        });
        return next;
      });
    }, 1400);

    const timer3 = window.setTimeout(() => {
      setInstallChecklist((current) => {
        let next = updateChecklistStep(current, 'precheck-support', {
          status: 'success',
          detail: 'Serviços auxiliares verificados.',
        });
        next = updateChecklistStep(next, 'precheck-reboot', {
          status: 'running',
          detail: 'Validando se há reinicialização pendente.',
        });
        return next;
      });
    }, 2200);

    return () => {
      window.clearTimeout(timer1);
      window.clearTimeout(timer2);
      window.clearTimeout(timer3);
    };
  }, [showInstallModal, runningAction]);

  const filteredDevices = useMemo(() => {
    const query = normalize(search);

    if (!query) {
      return devices;
    }

    return devices.filter((device) =>
      [
        device.hostname,
        device.client_name,
        device.site_name,
        device.operating_system,
        device.status,
      ]
        .filter(Boolean)
        .some((item) => normalize(item).includes(query)),
    );
  }, [devices, search]);

  async function loadWindowsUpdates(activeCustomerId = customerId) {
    if (!activeCustomerId) {
      setDevices([]);
      setTotals(undefined);
      setSelectedAgentId(null);
      return;
    }

    try {
      setIsLoadingUpdates(true);
      setStatus(null);

      const response = await fetch(
        `/api/admin/windows-updates?customerId=${encodeURIComponent(activeCustomerId)}`,
        {
          cache: 'no-store',
        },
      );

      const data = (await response.json()) as WindowsUpdatesResponse;

      if (!response.ok || !data.ok) {
        throw new Error(data.error ?? 'Erro ao carregar Windows Updates.');
      }

      const loadedDevices = data.devices ?? [];

      setDevices(loadedDevices);
      setTotals(data.totals);
      setSelectedAgentId((current) => {
        if (current && loadedDevices.some((device) => device.agent_id === current)) {
          return current;
        }

        return loadedDevices[0]?.agent_id ?? null;
      });
    } catch (error) {
      setDevices([]);
      setTotals(undefined);
      setSelectedAgentId(null);
      setStatus({
        type: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Erro ao carregar Windows Updates.',
      });
    } finally {
      setIsLoadingUpdates(false);
    }
  }

  async function runAction(input: {
    action:
      | 'scan'
      | 'install-approved'
      | 'approve-update'
      | 'ignore-update'
      | 'reset-update';
    agentId: string;
    updateId?: number;
    confirmMessage?: string;
  }) {
    if (!customerId) {
      setStatus({
        type: 'error',
        message: 'Selecione um cliente no menu lateral.',
      });
      return;
    }

    if (input.confirmMessage && !window.confirm(input.confirmMessage)) {
      return;
    }

    try {
      setRunningAction(
        `${input.action}:${input.agentId}:${input.updateId ?? 'agent'}`,
      );
      setStatus(null);

      const response = await fetch('/api/admin/windows-updates/actions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
        body: JSON.stringify({
          customerId,
          agentId: input.agentId,
          updateId: input.updateId,
          action: input.action,
          deviceType: selectedDevice ? getDeviceType(selectedDevice) : undefined,
          confirmationUsed: Boolean(input.confirmMessage),
          hostnameConfirmed: selectedDevice?.hostname ?? undefined,
        }),
      });

      const data = (await response.json()) as {
        ok: boolean;
        error?: string;
        message?: string;
      };

      if (!response.ok || !data.ok) {
        throw new Error(data.error ?? 'Erro ao executar ação.');
      }

      setStatus({
        type: 'success',
        message: data.message ?? 'Ação enviada com sucesso.',
      });

      await loadWindowsUpdates(customerId);
    } catch (error) {
      setStatus({
        type: 'error',
        message:
          error instanceof Error ? error.message : 'Erro ao executar ação.',
      });
    } finally {
      setRunningAction(null);
    }
  }

  useEffect(() => {
    void loadWindowsUpdates(customerId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="text-sm font-medium text-brand-600">
            Operações · Windows Updates
          </p>
          <h1 className="mt-1 text-2xl font-bold text-brand-950">
            Gestão de Windows Updates
          </h1>
        </div>

        <button
          type="button"
          className={secondaryButtonClassName}
          disabled={!customerId || isLoadingUpdates}
          onClick={() => loadWindowsUpdates(customerId)}
        >
          {isLoadingUpdates ? 'Atualizando...' : 'Atualizar'}
        </button>
      </div>

      {!customerId ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Selecione um cliente no menu lateral para visualizar as atualizações.
        </div>
      ) : null}

      {status ? (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            status.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : status.type === 'error'
                ? 'border-red-200 bg-red-50 text-red-700'
                : 'border-slate-200 bg-slate-50 text-slate-700'
          }`}
        >
          {status.message}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <div className={cardClassName}>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Dispositivos Windows
          </p>
          <p className="mt-2 text-3xl font-bold text-brand-950">
            {totals?.devices ?? 0}
          </p>
        </div>

        <div className={cardClassName}>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Updates pendentes
          </p>
          <p className="mt-2 text-3xl font-bold text-brand-950">
            {totals?.pending ?? 0}
          </p>
        </div>

        <div className={cardClassName}>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Críticos
          </p>
          <p className="mt-2 text-3xl font-bold text-red-600">
            {totals?.critical ?? 0}
          </p>
        </div>

        <div className={cardClassName}>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Aprovados
          </p>
          <p className="mt-2 text-3xl font-bold text-emerald-600">
            {totals?.approved ?? 0}
          </p>
        </div>

        <div className={cardClassName}>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Reboot pendente
          </p>
          <p className="mt-2 text-3xl font-bold text-amber-600">
            {totals?.reboot ?? 0}
          </p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.25fr)]">
        <div className={cardClassName}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="section-title">Dispositivos</h2>
              <p className="mt-1 text-sm text-slate-500">
                Clique em um dispositivo para ver as atualizações detectadas.
              </p>
            </div>

            <input
              className={`${inputClassName} sm:max-w-xs`}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar host, site ou sistema..."
            />
          </div>

          <div className="mt-5 max-h-[640px] space-y-3 overflow-y-auto pr-1">
            {isLoadingUpdates ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                Carregando atualizações...
              </div>
            ) : filteredDevices.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                Nenhum dispositivo Windows encontrado para este cliente.
              </div>
            ) : (
              filteredDevices.map((device) => (
                <button
                  key={device.agent_id}
                  type="button"
                  onClick={() => setSelectedAgentId(device.agent_id)}
                  className={`w-full rounded-xl border p-4 text-left transition ${
                    selectedAgentId === device.agent_id
                      ? 'border-brand-300 bg-brand-50'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-brand-950">
                        {device.hostname}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {device.site_name ?? 'Sem site'} ·{' '}
                        {device.monitoring_type ?? 'sem tipo'}
                      </p>
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-semibold ${
                          normalize(device.status) === 'online'
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {device.status ?? 'sem status'}
                      </span>

                      <span
                        className={`rounded-full px-2 py-1 text-xs font-semibold ${getDeviceTypeBadgeClass(
                          device,
                        )}`}
                      >
                        {getDeviceTypeLabel(device)}
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">
                      {device.updates_total} pendentes
                    </span>
                    <span className="rounded-full bg-red-50 px-2 py-1 text-red-700">
                      {device.updates_critical} críticos
                    </span>
                    <span className="rounded-full bg-emerald-50 px-2 py-1 text-emerald-700">
                      {device.updates_approved} aprovados
                    </span>
                    {device.needs_reboot ? (
                      <span className="rounded-full bg-amber-50 px-2 py-1 text-amber-700">
                        Reboot
                      </span>
                    ) : null}
                  </div>

                  <p className="mt-3 line-clamp-2 text-xs text-slate-500">
                    {device.operating_system ??
                      'Sistema operacional não informado'}
                  </p>
                </button>
              ))
            )}
          </div>
        </div>

        <div className={cardClassName}>
          {selectedDevice ? (
            <div className="space-y-5">
              <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
                <div>
                  <h2 className="section-title">{selectedDevice.hostname}</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {selectedDevice.operating_system ??
                      'Sistema operacional não informado'}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    Última comunicação: {formatDate(selectedDevice.last_seen)}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={secondaryButtonClassName}
                    disabled={Boolean(runningAction)}
                    onClick={() =>
                      runAction({
                        action: 'scan',
                        agentId: selectedDevice.agent_id,
                      })
                    }
                  >
                    Verificar updates
                  </button>

                  <button
                    type="button"
                    className={buttonClassName}
                    disabled={Boolean(runningAction)}
                    onClick={() =>
                      runAction({
                        action: 'install-approved',
                        agentId: selectedDevice.agent_id,
                        confirmMessage:
                          getInstallConfirmationMessage(selectedDevice),
                      })
                    }
                  >
                    {getInstallButtonLabel(selectedDevice)}
                  </button>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-4">
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Pendentes</p>
                  <p className="mt-1 text-xl font-bold text-brand-950">
                    {selectedDevice.updates_total}
                  </p>
                </div>
                <div className="rounded-xl bg-red-50 p-3">
                  <p className="text-xs text-red-600">Críticos</p>
                  <p className="mt-1 text-xl font-bold text-red-700">
                    {selectedDevice.updates_critical}
                  </p>
                </div>
                <div className="rounded-xl bg-emerald-50 p-3">
                  <p className="text-xs text-emerald-600">Aprovados</p>
                  <p className="mt-1 text-xl font-bold text-emerald-700">
                    {selectedDevice.updates_approved}
                  </p>
                </div>
                <div className="rounded-xl bg-amber-50 p-3">
                  <p className="text-xs text-amber-600">Reboot</p>
                  <p className="mt-1 text-xl font-bold text-amber-700">
                    {selectedDevice.needs_reboot ? 'Sim' : 'Não'}
                  </p>
                </div>
              </div>

              {selectedDevice.updates_approved > 0 ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  Existem updates aprovados aguardando instalação neste dispositivo.
                </div>
              ) : null}

              {selectedDevice.needs_reboot ? (
                <div className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800">
                  Este dispositivo possui reinicialização pendente.
                </div>
              ) : null}

              <div className="space-y-3">
                {selectedDevice.updates.length === 0 ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                    Nenhum update pendente encontrado para este dispositivo.
                  </div>
                ) : (
                  selectedDevice.updates.map((update) => {
                    const actionKey = `${selectedDevice.agent_id}:${update.id}`;

                    return (
                      <div
                        key={update.id}
                        className="rounded-xl border border-slate-200 p-4"
                      >
                        <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                                {update.kb ?? `ID ${update.id}`}
                              </span>
                              <span
                                className={`rounded-full border px-2 py-1 text-xs font-semibold ${getUpdateBadgeClass(
                                  update,
                                )}`}
                              >
                                {severityLabel(update.severity)}
                              </span>
                              <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                                {actionLabel(update.action)}
                              </span>
                            </div>

                            <h3 className="mt-3 font-semibold text-brand-950">
                              {update.title ?? 'Update sem título'}
                            </h3>

                            <p className="mt-2 line-clamp-3 text-sm text-slate-600">
                              {update.description ?? 'Sem descrição.'}
                            </p>

                            {update.categories?.length ? (
                              <p className="mt-2 text-xs text-slate-400">
                                {update.categories.join(' · ')}
                              </p>
                            ) : null}
                          </div>

                          <div className="flex shrink-0 flex-wrap gap-2">
                            {normalize(update.action) === 'approve' ? (
                              <>
                                <button
                                  type="button"
                                  className={buttonClassName}
                                  disabled={Boolean(runningAction)}
                                  onClick={() =>
                                    runAction({
                                      action: 'install-approved',
                                      agentId: selectedDevice.agent_id,
                                      confirmMessage:
                                        getInstallConfirmationMessage(selectedDevice),
                                    })
                                  }
                                >
                                  {runningAction ===
                                  `install-approved:${selectedDevice.agent_id}:agent`
                                    ? 'Instalando...'
                                    : getInstallButtonLabel(selectedDevice)}
                                </button>

                                <button
                                  type="button"
                                  className={secondaryButtonClassName}
                                  disabled={Boolean(runningAction)}
                                  onClick={() =>
                                    runAction({
                                      action: 'reset-update',
                                      agentId: selectedDevice.agent_id,
                                      updateId: update.id,
                                    })
                                  }
                                >
                                  Limpar ação
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  className={secondaryButtonClassName}
                                  disabled={Boolean(runningAction)}
                                  onClick={() =>
                                    runAction({
                                      action: 'approve-update',
                                      agentId: selectedDevice.agent_id,
                                      updateId: update.id,
                                    })
                                  }
                                >
                                  {runningAction ===
                                  `approve-update:${actionKey}`
                                    ? 'Aprovando...'
                                    : 'Aprovar'}
                                </button>

                                <button
                                  type="button"
                                  className={dangerButtonClassName}
                                  disabled={Boolean(runningAction)}
                                  onClick={() =>
                                    runAction({
                                      action: 'ignore-update',
                                      agentId: selectedDevice.agent_id,
                                      updateId: update.id,
                                      confirmMessage: 'Ignorar este update?',
                                    })
                                  }
                                >
                                  Ignorar
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              Selecione um dispositivo para visualizar os updates.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
