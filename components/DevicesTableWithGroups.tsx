'use client';

import Link from 'next/link';
import { useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

import { DataTable } from '@/components/DataTable';
import { DevicePlatformIcon } from '@/components/DevicePlatformIcon';
import { RefreshDevicesButton } from '@/components/RefreshDevicesButton';
import type { CustomerSiteListItem } from '@/lib/data/get-sites';
import type { DeviceListItem } from '@/lib/data/get-devices';
import type { OperationalStatus } from '@/lib/demo-data';

type DevicesTableWithGroupsProps = {
  customerId: string;
  devices: DeviceListItem[];
  sites: CustomerSiteListItem[];
};

type ApiResponse = {
  ok: boolean;
  error?: string;
  message?: string;
};

const statusLabel: Record<OperationalStatus, string> = {
  online: 'Online',
  offline: 'Offline',
  attention: 'Atenção',
  unknown: 'Desconhecido',
};

const statusClassName: Record<OperationalStatus, string> = {
  online: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  offline: 'bg-rose-50 text-rose-700 ring-rose-600/20',
  attention: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  unknown: 'bg-slate-50 text-slate-700 ring-slate-600/20',
};

function StatusBadge({ status }: { status: OperationalStatus }) {
  return (
    <span
      className={[
        'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset',
        statusClassName[status],
      ].join(' ')}
    >
      {statusLabel[status]}
    </span>
  );
}

function formatHardwareSummary(
  ramGb?: number | null,
  diskTotalGb?: number | null,
): string {
  const parts: string[] = [];

  if (ramGb) {
    parts.push(`${ramGb} GB RAM`);
  }

  if (diskTotalGb) {
    parts.push(`${diskTotalGb} GB disco`);
  }

  return parts.length > 0 ? parts.join(' • ') : 'Hardware não informado';
}

async function parseApiResponse(response: Response): Promise<ApiResponse> {
  const data = (await response.json().catch(() => null)) as ApiResponse | null;

  if (!data) {
    return {
      ok: false,
      error: 'Resposta inválida da API.',
    };
  }

  if (!response.ok || !data.ok) {
    return {
      ok: false,
      error: data.error ?? 'Erro ao executar operação.',
    };
  }

  return data;
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

export function DevicesTableWithGroups({
  customerId,
  devices,
  sites,
}: DevicesTableWithGroupsProps) {
  const router = useRouter();

  const [selectedGroup, setSelectedGroup] = useState('__all__');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const groupOptions = useMemo(() => {
    const names = new Set<string>();

    for (const site of sites) {
      if (site.isActive && site.name.trim()) {
        names.add(site.name.trim());
      }
    }

    for (const device of devices) {
      if (device.site.trim() && device.site !== 'Não informado') {
        names.add(device.site.trim());
      }
    }

    return Array.from(names).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [devices, sites]);

  const filteredDevices = useMemo(() => {
    if (selectedGroup === '__all__') {
      return devices;
    }

    return devices.filter(
      (device) => normalize(device.site) === normalize(selectedGroup),
    );
  }, [devices, selectedGroup]);

  async function handleCreateGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const groupName = newGroupName.trim();

    if (!groupName) {
      setStatusMessage({
        type: 'error',
        message: 'Informe o nome do grupo.',
      });
      return;
    }

    try {
      setIsCreatingGroup(true);
      setStatusMessage(null);

      const response = await fetch(
        `/api/admin/customers/${encodeURIComponent(customerId)}/sites`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          cache: 'no-store',
          body: JSON.stringify({
            name: groupName,
          }),
        },
      );

      const data = await parseApiResponse(response);

      if (!data.ok) {
        throw new Error(data.error ?? 'Erro ao criar grupo.');
      }

      setStatusMessage({
        type: 'success',
        message: data.message ?? 'Grupo criado com sucesso.',
      });
      setNewGroupName('');
      setIsModalOpen(false);
      router.refresh();
    } catch (error) {
      setStatusMessage({
        type: 'error',
        message:
          error instanceof Error ? error.message : 'Erro ao criar grupo.',
      });
    } finally {
      setIsCreatingGroup(false);
    }
  }

  return (
    <div className="space-y-4">
      {statusMessage ? (
        <div
          className={[
            'rounded-xl border px-4 py-3 text-sm',
            statusMessage.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-rose-200 bg-rose-50 text-rose-800',
          ].join(' ')}
        >
          {statusMessage.message}
        </div>
      ) : null}

      <div className="flex flex-col gap-3 rounded-2xl border border-surface-border bg-white p-4 shadow-sm md:flex-row md:items-end md:justify-between">
        <label className="w-full max-w-sm space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Grupo
          </span>
          <select
            value={selectedGroup}
            onChange={(event) => setSelectedGroup(event.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-brand-900 outline-none transition focus:border-brand-700 focus:ring-2 focus:ring-brand-100"
          >
            <option value="__all__">Todos os grupos</option>
            {groupOptions.map((group) => (
              <option key={group} value={group}>
                {group}
              </option>
            ))}
          </select>
        </label>

        <div className="flex items-center gap-2">
          <RefreshDevicesButton iconOnly />

          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="inline-flex h-10 items-center justify-center rounded-lg border border-brand-200 bg-white px-4 text-sm font-semibold text-brand-900 shadow-sm transition hover:bg-brand-50"
          >
            Criar grupo
          </button>
        </div>
      </div>

      <DataTable
        columns={[
          'Dispositivo',
          'Grupo',
          'Status',
          'Sistema operacional',
          'Hardware',
          'Último check-in',
          'Alertas ativos',
        ]}
      >
        {filteredDevices.map((device) => {
          const href = `/devices/${encodeURIComponent(
            device.id,
          )}?customerId=${encodeURIComponent(customerId)}`;

          const deviceSubtitle =
            device.manufacturer || device.model
              ? [device.manufacturer, device.model].filter(Boolean).join(' • ')
              : device.operatingSystem || 'Sistema não identificado';

          return (
            <tr key={device.id} className="text-slate-700">
              <td className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <DevicePlatformIcon
                    operatingSystem={device.operatingSystem}
                    deviceName={device.name}
                  />

                  <div>
                    <Link
                      href={href}
                      className="font-semibold text-brand-900 transition hover:text-brand-700 hover:underline"
                    >
                      {device.name}
                    </Link>

                    <p className="text-xs text-slate-500">{deviceSubtitle}</p>
                  </div>
                </div>
              </td>

              <td className="px-4 py-3">{device.site}</td>

              <td className="px-4 py-3">
                <StatusBadge status={device.status} />
              </td>

              <td className="px-4 py-3">{device.operatingSystem}</td>

              <td className="px-4 py-3 text-sm">
                {formatHardwareSummary(device.ramGb, device.diskTotalGb)}
              </td>

              <td className="px-4 py-3">{device.lastSeen}</td>

              <td className="px-4 py-3">{device.activeAlerts}</td>
            </tr>
          );
        })}
      </DataTable>

      {isModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <form
            onSubmit={handleCreateGroup}
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
          >
            <h3 className="text-lg font-semibold text-brand-900">
              Criar grupo
            </h3>

            <p className="mt-2 text-sm text-slate-600">
              O grupo será criado como uma unidade/site do cliente e poderá ser
              usado para organizar os dispositivos.
            </p>

            <label className="mt-5 block space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Nome do grupo
              </span>
              <input
                value={newGroupName}
                onChange={(event) => setNewGroupName(event.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                placeholder="Matriz, Filial 01, Financeiro..."
                required
              />
            </label>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setIsModalOpen(false);
                  setNewGroupName('');
                }}
                className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                Cancelar
              </button>

              <button
                type="submit"
                disabled={isCreatingGroup}
                className="inline-flex items-center justify-center rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isCreatingGroup ? 'Criando...' : 'Criar grupo'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
