'use client';

import { useEffect, useMemo, useState } from 'react';

type MonitoringCheck = {
  id: string;
  name: string;
  type: string;
  status: 'ok' | 'warning' | 'error' | 'unknown';
  severity: 'info' | 'warning' | 'critical';
  value: string | null;
  threshold: string | null;
  lastRun: string | null;
  enabled: boolean;
};

type MonitoringDevice = {
  agentId: string;
  hostname: string;
  siteName: string | null;
  status: string;
  deviceType: 'server' | 'workstation';
  operatingSystem: string | null;
  lastSeen: string | null;
  needsReboot: boolean;
  checks: MonitoringCheck[];
  checksTotal: number;
  checksOk: number;
  checksWarning: number;
  checksCritical: number;
  hasNativeCheckDetails: boolean;
};

type MonitoringTotals = {
  devices: number;
  online: number;
  offline: number;
  servers: number;
  workstations: number;
  checks: number;
  warning: number;
  critical: number;
  reboot: number;
};

type MonitoringResponse = {
  ok: boolean;
  error?: string;
  totals?: MonitoringTotals;
  devices?: MonitoringDevice[];
};

type MonitoringPanelProps = {
  customerId: string;
};

const cardClassName =
  'rounded-2xl border border-surface-border bg-white p-5 shadow-sm';

const secondaryButtonClassName =
  'inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60';

const inputClassName =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100';

function normalize(value?: string | null) {
  return (value ?? '').trim().toLowerCase();
}

function formatDate(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('pt-BR');
}

function deviceTypeLabel(device: MonitoringDevice) {
  return device.deviceType === 'server' ? 'Servidor' : 'Estação';
}

function deviceTypeClass(device: MonitoringDevice) {
  return device.deviceType === 'server'
    ? 'bg-indigo-50 text-indigo-700'
    : 'bg-slate-100 text-slate-700';
}

function statusClass(status: string) {
  return normalize(status) === 'online'
    ? 'bg-emerald-50 text-emerald-700'
    : 'bg-slate-100 text-slate-600';
}

function checkClass(status: MonitoringCheck['status']) {
  if (status === 'error') return 'bg-red-50 text-red-700';
  if (status === 'warning') return 'bg-amber-50 text-amber-700';
  if (status === 'ok') return 'bg-emerald-50 text-emerald-700';
  return 'bg-slate-100 text-slate-600';
}

function checkLabel(status: MonitoringCheck['status']) {
  if (status === 'error') return 'Crítico';
  if (status === 'warning') return 'Atenção';
  if (status === 'ok') return 'OK';
  return 'Sem status';
}

export function MonitoringPanel({ customerId }: MonitoringPanelProps) {
  const [devices, setDevices] = useState<MonitoringDevice[]>([]);
  const [totals, setTotals] = useState<MonitoringTotals>();
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const selectedDevice = useMemo(
    () => devices.find((device) => device.agentId === selectedAgentId) ?? null,
    [devices, selectedAgentId],
  );

  const checkTypes = useMemo(() => {
    const types = new Set<string>();
    devices.forEach((device) => device.checks.forEach((check) => types.add(check.type)));
    return Array.from(types).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [devices]);

  const filteredDevices = useMemo(() => {
    const query = normalize(search);

    return devices.filter((device) => {
      const matchesSearch =
        !query ||
        [device.hostname, device.siteName, device.operatingSystem, device.status, deviceTypeLabel(device)]
          .filter(Boolean)
          .some((item) => normalize(item).includes(query));

      const matchesType = typeFilter === 'all' || device.checks.some((check) => check.type === typeFilter);

      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'critical' && device.checksCritical > 0) ||
        (statusFilter === 'warning' && device.checksWarning > 0) ||
        (statusFilter === 'online' && normalize(device.status) === 'online') ||
        (statusFilter === 'offline' && normalize(device.status) !== 'online');

      return matchesSearch && matchesType && matchesStatus;
    });
  }, [devices, search, typeFilter, statusFilter]);

  async function loadMonitoring() {
    if (!customerId) {
      setDevices([]);
      setTotals(undefined);
      setSelectedAgentId(null);
      return;
    }

    try {
      setIsLoading(true);
      setStatusMessage(null);

      const response = await fetch(`/api/admin/monitoring?customerId=${encodeURIComponent(customerId)}`, {
        method: 'GET',
        cache: 'no-store',
      });

      const data = (await response.json()) as MonitoringResponse;

      if (!response.ok || !data.ok) {
        throw new Error(data.error ?? 'Erro ao carregar monitoramento.');
      }

      const nextDevices = data.devices ?? [];
      setDevices(nextDevices);
      setTotals(data.totals);
      setSelectedAgentId((current) => {
        if (current && nextDevices.some((device) => device.agentId === current)) return current;
        return nextDevices[0]?.agentId ?? null;
      });
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Erro ao carregar monitoramento.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadMonitoring();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="text-sm font-medium text-brand-600">Operações · Monitoramento</p>
          <h1 className="mt-1 text-2xl font-bold text-brand-950">Monitoramento SafeOps</h1>
        </div>

        <button type="button" className={secondaryButtonClassName} disabled={!customerId || isLoading} onClick={loadMonitoring}>
          {isLoading ? 'Atualizando...' : 'Atualizar'}
        </button>
      </div>

      {statusMessage ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {statusMessage}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        {[
          ['Dispositivos', totals?.devices ?? 0, 'text-brand-950'],
          ['Online', totals?.online ?? 0, 'text-emerald-600'],
          ['Offline', totals?.offline ?? 0, 'text-slate-700'],
          ['Checks', totals?.checks ?? 0, 'text-brand-950'],
          ['Atenção', totals?.warning ?? 0, 'text-amber-600'],
          ['Críticos', totals?.critical ?? 0, 'text-red-600'],
        ].map(([label, value, color]) => (
          <div key={String(label)} className={cardClassName}>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
            <p className={`mt-2 text-3xl font-bold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.25fr)]">
        <div className={cardClassName}>
          <div className="space-y-3">
            <div>
              <h2 className="section-title">Dispositivos monitorados</h2>
              <p className="mt-1 text-sm text-slate-500">Selecione um dispositivo para visualizar os checks associados.</p>
            </div>

            <div className="grid gap-3 lg:grid-cols-3">
              <input className={inputClassName} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar host, site ou sistema..." />

              <select className={inputClassName} value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
                <option value="all">Todos os tipos</option>
                {checkTypes.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>

              <select className={inputClassName} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="all">Todos os status</option>
                <option value="critical">Com críticos</option>
                <option value="warning">Com atenção</option>
                <option value="online">Online</option>
                <option value="offline">Offline</option>
              </select>
            </div>
          </div>

          <div className="mt-5 max-h-[680px] space-y-3 overflow-y-auto pr-1">
            {isLoading ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">Carregando monitoramento...</div>
            ) : filteredDevices.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">Nenhum dispositivo encontrado para os filtros selecionados.</div>
            ) : (
              filteredDevices.map((device) => (
                <button
                  key={device.agentId}
                  type="button"
                  onClick={() => setSelectedAgentId(device.agentId)}
                  className={`w-full rounded-xl border p-4 text-left transition ${selectedAgentId === device.agentId ? 'border-brand-300 bg-brand-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-brand-950">{device.hostname}</p>
                      <p className="mt-1 text-xs text-slate-500">{device.siteName ?? 'Sem site'} · {device.operatingSystem ?? 'Sistema não informado'}</p>
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusClass(device.status)}`}>{device.status ?? 'sem status'}</span>
                      <span className={`rounded-full px-2 py-1 text-xs font-semibold ${deviceTypeClass(device)}`}>{deviceTypeLabel(device)}</span>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">{device.checksTotal} checks</span>
                    {device.checksCritical > 0 ? <span className="rounded-full bg-red-50 px-2 py-1 text-red-700">{device.checksCritical} críticos</span> : null}
                    {device.checksWarning > 0 ? <span className="rounded-full bg-amber-50 px-2 py-1 text-amber-700">{device.checksWarning} atenção</span> : null}
                    {device.needsReboot ? <span className="rounded-full bg-orange-50 px-2 py-1 text-orange-700">Reboot</span> : null}
                  </div>
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
                  <p className="mt-1 text-sm text-slate-500">{selectedDevice.operatingSystem ?? 'Sistema não informado'}</p>
                  <p className="mt-1 text-xs text-slate-400">Última comunicação: {formatDate(selectedDevice.lastSeen)}</p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(selectedDevice.status)}`}>{selectedDevice.status}</span>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${deviceTypeClass(selectedDevice)}`}>{deviceTypeLabel(selectedDevice)}</span>
                </div>
              </div>

              {selectedDevice.needsReboot ? (
                <div className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800">Este dispositivo possui reinicialização pendente.</div>
              ) : null}

              {!selectedDevice.hasNativeCheckDetails ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  Os detalhes dos checks ainda não foram retornados para este dispositivo. A tela já está pronta para exibir CPU, memória, disco, serviço, script, evento e ping assim que a fonte retornar os dados.
                </div>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-4">
                <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Checks</p><p className="mt-1 text-xl font-bold text-brand-950">{selectedDevice.checksTotal}</p></div>
                <div className="rounded-xl bg-emerald-50 p-3"><p className="text-xs text-emerald-600">OK</p><p className="mt-1 text-xl font-bold text-emerald-700">{selectedDevice.checksOk}</p></div>
                <div className="rounded-xl bg-amber-50 p-3"><p className="text-xs text-amber-600">Atenção</p><p className="mt-1 text-xl font-bold text-amber-700">{selectedDevice.checksWarning}</p></div>
                <div className="rounded-xl bg-red-50 p-3"><p className="text-xs text-red-600">Críticos</p><p className="mt-1 text-xl font-bold text-red-700">{selectedDevice.checksCritical}</p></div>
              </div>

              <div className="space-y-3">
                {selectedDevice.checks.length === 0 ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">Nenhum detalhe de check foi encontrado para este dispositivo.</div>
                ) : (
                  selectedDevice.checks.map((check) => (
                    <div key={check.id} className="rounded-xl border border-slate-200 p-4">
                      <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">{check.type}</span>
                            <span className={`rounded-full px-2 py-1 text-xs font-semibold ${checkClass(check.status)}`}>{checkLabel(check.status)}</span>
                            {!check.enabled ? <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-500">Desabilitado</span> : null}
                          </div>

                          <h3 className="mt-3 font-semibold text-brand-950">{check.name}</h3>
                          {check.value ? <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{check.value}</p> : null}
                          {check.threshold ? <p className="mt-2 text-xs text-slate-400">Parâmetro: {check.threshold}</p> : null}
                        </div>

                        <div className="shrink-0 text-right text-xs text-slate-400">
                          Última execução<br />{formatDate(check.lastRun)}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">Selecione um dispositivo para visualizar o monitoramento.</div>
          )}
        </div>
      </div>
    </div>
  );
}
