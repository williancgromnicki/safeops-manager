import Link from 'next/link';
import { redirect } from 'next/navigation';

import { DataTable } from '@/components/DataTable';
import { DevicePlatformIcon } from '@/components/DevicePlatformIcon';
import { EmptyState } from '@/components/EmptyState';
import { RefreshDevicesButton } from '@/components/RefreshDevicesButton';
import { resolveCurrentCustomer } from '@/lib/data/get-current-customer';
import { getDevices, type DeviceListItem } from '@/lib/data/get-devices';
import { DEMO_DEVICES, type OperationalStatus } from '@/lib/demo-data';

export const dynamic = 'force-dynamic';

type DevicesPageProps = {
  searchParams?: Promise<{
    customerId?: string;
  }>;
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

function mapDemoDeviceToListItem(
  device: (typeof DEMO_DEVICES)[number],
): DeviceListItem {
  return {
    id: device.id,
    customerId: device.customerId,
    name: device.name,
    site: device.site,
    status: device.status,
    operatingSystem: device.operatingSystem,
    lastSeen: device.lastSeen,
    activeAlerts: device.activeAlerts,
    manufacturer: null,
    model: null,
    serialNumber: null,
    cpu: null,
    ramGb: null,
    diskTotalGb: null,
    lastInventoryAt: null,
  };
}

export default async function DevicesPage({ searchParams }: DevicesPageProps) {
  const params = searchParams ? await searchParams : {};
  const customerContext = await resolveCurrentCustomer(params.customerId);

  if (!customerContext) {
    redirect('/login');
  }

  const activeCustomer = customerContext.activeCustomer;

  if (!activeCustomer) {
    return (
      <section className="space-y-6">
        <div>
          <h2 className="section-title">Dispositivos</h2>

          <p className="mt-2 text-sm text-slate-600">
            Inventário operacional dos clientes vinculados ao seu usuário.
          </p>
        </div>

        <EmptyState
          title="Nenhum cliente vinculado"
          description="Seu usuário ainda não possui clientes vinculados para exibição de dispositivos."
        />
      </section>
    );
  }

  const isDemoCustomer = activeCustomer.customerSlug === 'safesys-demo';

  const realDevices = await getDevices(activeCustomer.customerId);
  const list: DeviceListItem[] =
    isDemoCustomer && realDevices.length === 0
      ? DEMO_DEVICES.map(mapDemoDeviceToListItem)
      : realDevices;

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="section-title">
            Dispositivos - {activeCustomer.customerName}
          </h2>

          <p className="mt-2 text-sm text-slate-600">
            Inventário operacional sincronizado com o Tactical RMM. O status
            online/offline considera o último check-in registrado pelo agente.
          </p>

          <p className="mt-1 text-xs text-slate-500">
            A sincronização automática ocorre a cada 5 minutos. O botão ao lado
            permite forçar uma atualização manual do inventário.
          </p>
        </div>

        <div className="shrink-0">
          <RefreshDevicesButton />
        </div>
      </div>

      {list.length === 0 ? (
        <EmptyState
          title="Nenhum dispositivo registrado"
          description="Quando dispositivos forem cadastrados ou sincronizados para este cliente, eles aparecerão nesta listagem."
        />
      ) : (
        <DataTable
          columns={[
            'Dispositivo',
            'Local',
            'Status',
            'Sistema operacional',
            'Hardware',
            'Último check-in',
            'Alertas ativos',
          ]}
        >
          {list.map((device) => {
            const href = `/devices/${device.id}?customerId=${encodeURIComponent(
              activeCustomer.customerId,
            )}`;

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

                      <p className="text-xs text-slate-500">
                        {deviceSubtitle}
                      </p>
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
      )}
    </section>
  );
}
