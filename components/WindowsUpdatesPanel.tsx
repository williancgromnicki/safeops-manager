'use client';

import { useEffect, useMemo, useState } from 'react';

type Customer = {
  id: string;
  name: string;
};

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

type CustomersResponse = {
  ok?: boolean;
  customers?: Customer[];
  data?: Customer[];
  error?: string;
};

type StatusMessage = {
  type: 'success' | 'error' | 'info';
  message: string;
} | null;

const cardClassName =
  'rounded-2xl border border-surface-border bg-white p-5 shadow-sm';

const buttonClassName =
  'inline-flex items-center justify-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60';

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
function getUpdateBadgeClass(update: WindowsUpdate): string {
  if (normalize(update.severity) === 'critical') {
    return 'border-red-200 bg-red-50 text-red-700';
  }

  if (normalize(update.action) === 'approve') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  }

  return 'border-slate-200 bg-slate-50 text-slate-600';
}

function useSelectedCustomerId(): string {
  const [customerId, setCustomerId] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromUrl =
      params.get('customerId') ??
      params.get('customer') ??
      params.get('cliente') ??
      '';

    setCustomerId(fromUrl);
  }, []);

  return customerId;
}

export function WindowsUpdatesPanel() {
  const customerIdFromUrl = useSelectedCustomerId();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [devices, setDevices] = useState<WindowsUpdateDevice[]>([]);
  const [totals, setTotals] = useState<WindowsUpdatesResponse['totals']>();
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(false);
  const [isLoadingUpdates, setIsLoadingUpdates] = useState(false);
  const [runningAction, setRunningAction] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusMessage>(null);

  const selectedDevice = useMemo(
    () => devices.find((device) => device.agent_id === selectedAgentId) ?? null,
    [devices, selectedAgentId],
  );

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

  async function loadCustomers() {
    try {
      setIsLoadingCustomers(true);

      const response = await fetch('/api/admin/customers', {
        cache: 'no-store',
      });

      const data = (await response.json()) as CustomersResponse;

      if (!response.ok) {
        throw new Error(data.error ?? 'Erro ao carregar clientes.');
      }

      const loadedCustomers = data.customers ?? data.data ?? [];

      setCustomers(loadedCustomers);

      const preferredCustomerId =
        customerIdFromUrl ||
        selectedCustomerId ||
        loadedCustomers[0]?.id ||
        '';

      setSelectedCustomerId(preferredCustomerId);
    } catch (error) {
      setStatus({
        type: 'error',
        message:
          error instanceof Error ? error.message : 'Erro ao carregar clientes.',
      });
    } finally {
      setIsLoadingCustomers(false);
    }
  }

  async function loadWindowsUpdates(customerId = selectedCustomerId) {
    if (!customerId) {
      return;
    }

    try {
      setIsLoadingUpdates(true);
      setStatus(null);

      const response = await fetch(
        `/api/admin/windows-updates?customerId=${encodeURIComponent(customerId)}`,
        {
          cache: 'no-store',
        },
      );

      const data = (await response.json()) as WindowsUpdatesResponse;

      if (!response.ok || !data.ok) {
        throw new Error(data.error ?? 'Erro ao carregar Windows Updates.');
      }

      setDevices(data.devices ?? []);
      setTotals(data.totals);
      setSelectedAgentId(data.devices?.[0]?.agent_id ?? null);
    } catch (error) {
      setDevices([]);
      setTotals(undefined);
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
    action: 'scan' | 'install-approved' | 'approve-update' | 'ignore-update' | 'reset-update';
    agentId: string;
    updateId?: number;
    confirmMessage?: string;
  }) {
    if (!selectedCustomerId) {
      setStatus({
        type: 'error',
        message: 'Selecione um cliente.',
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
          customerId: selectedCustomerId,
          agentId: input.agentId,
          updateId: input.updateId,
          action: input.action,
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

      await loadWindowsUpdates(selectedCustomerId);
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
    void loadCustomers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerIdFromUrl]);

  useEffect(() => {
    if (selectedCustomerId) {
      void loadWindowsUpdates(selectedCustomerId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCustomerId]);

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
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            Visualize e acione a base nativa de updates do TRMM. Nesta etapa, o
            SafeOps não executa uma busca paralela: ele usa os updates já
            detectados pelo agente.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <select
            className={inputClassName}
            value={selectedCustomerId}
            onChange={(event) => setSelectedCustomerId(event.target.value)}
            disabled={isLoadingCustomers}
          >
            <option value="">Selecione um cliente</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
              </option>
            ))}
          </select>

          <button
            type="button"
            className={secondaryButtonClassName}
            disabled={!selectedCustomerId || isLoadingUpdates}
            onClick={() => loadWindowsUpdates()}
          >
            {isLoadingUpdates ? 'Atualizando...' : 'Atualizar'}
          </button>
        </div>
      </div>

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
                Clique em um dispositivo para ver os updates detectados.
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
                Carregando updates...
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

                    <span
                      className={`rounded-full px-2 py-1 text-xs font-semibold ${
                        normalize(device.status) === 'online'
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {device.status ?? 'sem status'}
                    </span>
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
                    {device.operating_system ?? 'Sistema operacional não informado'}
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
                          'Instalar updates aprovados neste dispositivo? Em servidores, valide a janela de manutenção antes de prosseguir.',
                      })
                    }
                  >
                    Instalar aprovados
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

              <div className="space-y-3">
                {selectedDevice.updates.length === 0 ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                    Nenhum update pendente retornado pelo TRMM para este
                    dispositivo.
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
                                  confirmMessage:
                                    'Ignorar este update no TRMM?',
                                })
                              }
                            >
                              Ignorar
                            </button>

                            {normalize(update.action) !== 'nothing' ? (
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
                            ) : null}
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
