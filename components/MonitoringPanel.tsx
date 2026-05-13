'use client';

import { useEffect, useMemo, useState } from 'react';

type CheckHistoryItem = {
  id: string;
  checkedAt: string | null;
  value: number | null;
  status: string | null;
  output: string | null;
};

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
  parameters?: string[];
  history?: CheckHistoryItem[];
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

type CheckHistoryResponse = {
  ok: boolean;
  error?: string;
  message?: string;
  sourcePath?: string;
  history?: CheckHistoryItem[];
  attempted?: string[];
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

function getHistoryValueLabel(item: CheckHistoryItem) {
  if (typeof item.value === 'number') {
    return `${item.value.toFixed(1)}%`;
  }

  return item.status ?? '—';
}

function getBarWidth(value: number | null) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, value));
}

function getThresholdNumber(value?: string | null) {
  if (!value) {
    return null;
  }

  const match = value.match(/\d+(?:\.\d+)?/);

  if (!match) {
    return null;
  }

  const parsed = Number(match[0]);

  return Number.isFinite(parsed) ? parsed : null;
}

function getChartPoints(history: CheckHistoryItem[], width: number, height: number) {
  const numericItems = history.filter((item) => typeof item.value === 'number');

  if (numericItems.length === 0) {
    return {
      numericItems,
      points: '',
      lastPoint: null as { x: number; y: number; value: number } | null,
    };
  }

  const maxIndex = Math.max(1, numericItems.length - 1);
  const pointsArray = numericItems.map((item, index) => {
    const value = item.value ?? 0;
    const x = (index / maxIndex) * width;
    const y = height - (Math.max(0, Math.min(100, value)) / 100) * height;

    return {
      x,
      y,
      value,
      item,
    };
  });

  return {
    numericItems,
    points: pointsArray.map((point) => `${point.x},${point.y}`).join(' '),
    lastPoint: pointsArray[pointsArray.length - 1] ?? null,
  };
}

function CheckDetailsModal({
  check,
  customerId,
  agentId,
  onClose,
}: {
  check: MonitoringCheck;
  customerId: string;
  agentId: string;
  onClose: () => void;
}) {
  const [range, setRange] = useState('24h');
  const [remoteHistory, setRemoteHistory] = useState<CheckHistoryItem[]>(check.history ?? []);
  const [historyMessage, setHistoryMessage] = useState<string | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const parameters = check.parameters ?? [];

  async function loadHistory(nextRange = range) {
    try {
      setIsLoadingHistory(true);
      setHistoryMessage(null);

      const response = await fetch(
        `/api/admin/monitoring/check-history?customerId=${encodeURIComponent(
          customerId,
        )}&agentId=${encodeURIComponent(agentId)}&checkId=${encodeURIComponent(
          check.id,
        )}&range=${encodeURIComponent(nextRange)}`,
        {
          method: 'GET',
          cache: 'no-store',
        },
      );

      const data = (await response.json()) as CheckHistoryResponse;

      if (!response.ok || !data.ok) {
        throw new Error(data.error ?? 'Erro ao carregar histórico do check.');
      }

      setRemoteHistory(data.history ?? []);
      setHistoryMessage(data.message ?? null);
    } catch (error) {
      setRemoteHistory([]);
      setHistoryMessage(
        error instanceof Error
          ? error.message
          : 'Erro ao carregar histórico do check.',
      );
    } finally {
      setIsLoadingHistory(false);
    }
  }

  useEffect(() => {
    void loadHistory('24h');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [check.id, agentId, customerId]);

  const history = remoteHistory;
  const hasNumericHistory = history.some((item) => typeof item.value === 'number');
  const warningThreshold = getThresholdNumber(
    parameters.find((parameter) => parameter.toLowerCase().includes('warning')) ??
      check.threshold,
  );
  const criticalThreshold = getThresholdNumber(
    parameters.find((parameter) =>
      parameter.toLowerCase().includes('critical') ||
      parameter.toLowerCase().includes('error'),
    ),
  );
  const chartWidth = 900;
  const chartHeight = 260;
  const chart = getChartPoints(history, chartWidth, chartHeight);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
      <div className="max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                {check.type}
              </span>
              <span className={`rounded-full px-2 py-1 text-xs font-semibold ${checkClass(check.status)}`}>
                {checkLabel(check.status)}
              </span>
              {!check.enabled ? (
                <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-500">
                  Desabilitado
                </span>
              ) : null}
            </div>

            <h2 className="mt-3 text-xl font-bold text-brand-950">{check.name}</h2>
            <p className="mt-1 text-sm text-slate-500">
              Última execução: {formatDate(check.lastRun)}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <select
              value={range}
              onChange={(event) => {
                const nextRange = event.target.value;
                setRange(nextRange);
                void loadHistory(nextRange);
              }}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            >
              <option value="24h">Últimas 24 horas</option>
              <option value="7d">Últimos 7 dias</option>
              <option value="30d">Últimos 30 dias</option>
              <option value="all">Tudo</option>
            </select>

            <button
              type="button"
              onClick={() => void loadHistory(range)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              Atualizar histórico
            </button>

            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              Fechar
            </button>
          </div>
        </div>

        <div className="max-h-[calc(90vh-96px)] overflow-y-auto px-6 py-5">
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-xl bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Status</p>
              <p className="mt-2 text-lg font-bold text-brand-950">{checkLabel(check.status)}</p>
            </div>

            <div className="rounded-xl bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Tipo</p>
              <p className="mt-2 text-lg font-bold text-brand-950">{check.type}</p>
            </div>

            <div className="rounded-xl bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Parâmetro principal</p>
              <p className="mt-2 text-lg font-bold text-brand-950">{check.threshold ?? '—'}</p>
            </div>
          </div>

          <div className="mt-5 rounded-xl border border-slate-200 p-4">
            <h3 className="font-semibold text-brand-950">Resultado mais recente</h3>
            {check.value ? (
              <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700">
                {check.value}
              </p>
            ) : (
              <p className="mt-3 text-sm text-slate-500">Nenhum resultado detalhado retornado.</p>
            )}
          </div>

          <div className="mt-5 rounded-xl border border-slate-200 p-4">
            <h3 className="font-semibold text-brand-950">Parâmetros configurados</h3>
            {parameters.length > 0 ? (
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {parameters.map((parameter) => (
                  <div
                    key={parameter}
                    className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700"
                  >
                    {parameter}
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-500">
                A fonte ainda não retornou os parâmetros detalhados deste check.
              </p>
            )}
          </div>

          <div className="mt-5 rounded-xl border border-slate-200 p-4">
            <div className="flex flex-col justify-between gap-2 lg:flex-row lg:items-center">
              <div>
                <h3 className="font-semibold text-brand-950">Histórico de execução</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Visualização gráfica dos valores coletados ao longo do tempo.
                </p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                {history.length} registros
              </span>
            </div>

            {isLoadingHistory ? (
              <p className="mt-4 text-sm text-slate-500">
                Carregando histórico do check...
              </p>
            ) : history.length === 0 ? (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {historyMessage ??
                  'O histórico deste check ainda não foi retornado pela fonte.'}
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {hasNumericHistory ? (
                  <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="mb-3 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                      <span>{history.length} amostras no período selecionado</span>
                      {warningThreshold !== null ? (
                        <span className="rounded-full bg-amber-50 px-2 py-1 font-semibold text-amber-700">
                          Warning: {warningThreshold}%
                        </span>
                      ) : null}
                      {criticalThreshold !== null ? (
                        <span className="rounded-full bg-red-50 px-2 py-1 font-semibold text-red-700">
                          Crítico: {criticalThreshold}%
                        </span>
                      ) : null}
                      {chart.lastPoint ? (
                        <span className="rounded-full bg-brand-50 px-2 py-1 font-semibold text-brand-700">
                          Atual: {chart.lastPoint.value.toFixed(1)}%
                        </span>
                      ) : null}
                    </div>

                    <div className="overflow-x-auto">
                      <svg
                        viewBox={`0 0 ${chartWidth} ${chartHeight + 52}`}
                        className="h-80 min-w-[720px] w-full rounded-xl bg-slate-50"
                        role="img"
                        aria-label={`Histórico do check ${check.name}`}
                      >
                        {[0, 20, 40, 60, 80, 100].map((tick) => {
                          const y = chartHeight - (tick / 100) * chartHeight + 20;

                          return (
                            <g key={tick}>
                              <line
                                x1="54"
                                y1={y}
                                x2={chartWidth - 24}
                                y2={y}
                                stroke="#e2e8f0"
                                strokeWidth="1"
                              />
                              <text
                                x="16"
                                y={y + 4}
                                className="fill-slate-500 text-[11px] font-semibold"
                              >
                                {tick}%
                              </text>
                            </g>
                          );
                        })}

                        {warningThreshold !== null ? (
                          <g>
                            <line
                              x1="54"
                              y1={chartHeight - (warningThreshold / 100) * chartHeight + 20}
                              x2={chartWidth - 24}
                              y2={chartHeight - (warningThreshold / 100) * chartHeight + 20}
                              stroke="#f59e0b"
                              strokeWidth="2"
                              strokeDasharray="6 4"
                            />
                            <text
                              x="62"
                              y={chartHeight - (warningThreshold / 100) * chartHeight + 14}
                              className="fill-amber-600 text-[11px] font-bold"
                            >
                              Warning Threshold
                            </text>
                          </g>
                        ) : null}

                        {criticalThreshold !== null ? (
                          <g>
                            <line
                              x1="54"
                              y1={chartHeight - (criticalThreshold / 100) * chartHeight + 20}
                              x2={chartWidth - 24}
                              y2={chartHeight - (criticalThreshold / 100) * chartHeight + 20}
                              stroke="#dc2626"
                              strokeWidth="2"
                              strokeDasharray="6 4"
                            />
                            <text
                              x="62"
                              y={chartHeight - (criticalThreshold / 100) * chartHeight + 14}
                              className="fill-red-600 text-[11px] font-bold"
                            >
                              Error Threshold
                            </text>
                          </g>
                        ) : null}

                        <polyline
                          points={chart.points
                            .split(' ')
                            .map((pair) => {
                              const [rawX, rawY] = pair.split(',').map(Number);
                              return `${rawX + 54},${rawY + 20}`;
                            })
                            .join(' ')}
                          fill="none"
                          stroke="#0284c7"
                          strokeWidth="3"
                          strokeLinejoin="round"
                          strokeLinecap="round"
                        />

                        {chart.numericItems.slice(-18).map((item, index, arr) => {
                          if (!item.checkedAt) {
                            return null;
                          }

                          if (index !== 0 && index !== arr.length - 1 && index % 4 !== 0) {
                            return null;
                          }

                          const x = 54 + (index / Math.max(1, arr.length - 1)) * (chartWidth - 78);

                          return (
                            <text
                              key={`${item.id}-label`}
                              x={x}
                              y={chartHeight + 44}
                              textAnchor="middle"
                              className="fill-slate-500 text-[10px] font-semibold"
                            >
                              {formatDate(item.checkedAt).slice(0, 5)}
                            </text>
                          );
                        })}

                        {chart.lastPoint ? (
                          <g>
                            <circle
                              cx={chart.lastPoint.x + 54}
                              cy={chart.lastPoint.y + 20}
                              r="5"
                              fill="#0284c7"
                            />
                            <text
                              x={chart.lastPoint.x + 42}
                              y={chart.lastPoint.y + 8}
                              className="fill-brand-700 text-[12px] font-bold"
                            >
                              {chart.lastPoint.value.toFixed(1)}%
                            </text>
                          </g>
                        ) : null}
                      </svg>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                    Este check possui histórico, mas os valores retornados não são numéricos para gerar gráfico.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>    </div>
  );
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
  const [selectedCheck, setSelectedCheck] = useState<MonitoringCheck | null>(null);

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
                    <button
                      key={check.id}
                      type="button"
                      onClick={() => setSelectedCheck(check)}
                      className="w-full rounded-xl border border-slate-200 p-4 text-left transition hover:border-brand-200 hover:bg-brand-50/40"
                    >
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
                          <br />
                          <span className="mt-2 inline-flex rounded-full bg-white px-2 py-1 font-semibold text-brand-700 shadow-sm">
                            Ver detalhes
                          </span>
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">Selecione um dispositivo para visualizar o monitoramento.</div>
          )}
        </div>
      </div>

      {selectedCheck ? (
        <CheckDetailsModal
          check={selectedCheck}
          customerId={customerId}
          agentId={selectedDevice?.agentId ?? ''}
          onClose={() => setSelectedCheck(null)}
        />
      ) : null}
    </div>
  );
}
