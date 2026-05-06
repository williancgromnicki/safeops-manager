import Link from 'next/link';
import { redirect } from 'next/navigation';

import { DataTable } from '@/components/DataTable';
import { DevicePlatformIcon } from '@/components/DevicePlatformIcon';
import { EmptyState } from '@/components/EmptyState';
import { DeviceActionsMenu } from '@/components/DeviceActionsMenu';
import { SeverityBadge } from '@/components/SeverityBadge';
import { StatCard } from '@/components/StatCard';
import { getDeviceAlerts } from '@/lib/data/get-device-alerts';
import { getDeviceDetail } from '@/lib/data/get-device-detail';
import { resolveCurrentCustomer } from '@/lib/data/get-current-customer';
import { type OperationalStatus } from '@/lib/demo-data';

export const dynamic = 'force-dynamic';

type DeviceDetailPageProps = {
  params: Promise<{
    deviceId: string;
  }>;
  searchParams?: Promise<{
    customerId?: string;
  }>;
};

const deviceStatusLabel: Record<OperationalStatus, string> = {
  online: 'Online',
  offline: 'Offline',
  attention: 'Atenção',
  unknown: 'Desconhecido',
};

const deviceStatusClassName: Record<OperationalStatus, string> = {
  online: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  offline: 'bg-rose-50 text-rose-700 ring-rose-600/20',
  attention: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  unknown: 'bg-slate-50 text-slate-700 ring-slate-600/20',
};

function DeviceStatusBadge({ status }: { status: OperationalStatus }) {
  return (
    <span
      className={[
        'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset',
        deviceStatusClassName[status],
      ].join(' ')}
    >
      {deviceStatusLabel[status]}
    </span>
  );
}

function translateAlertStatus(status?: string | null): string {
  return status?.toLowerCase() === 'closed' ? 'Fechado' : 'Aberto';
}

function formatNumber(value: number | null, suffix: string): string {
  if (value === null || value === undefined) {
    return 'Não informado';
  }

  return `${value} ${suffix}`;
}

export default async function DeviceDetailPage({
  params,
  searchParams,
}: DeviceDetailPageProps) {
  const { deviceId } = await params;
  const query = searchParams ? await searchParams : {};

  const customerContext = await resolveCurrentCustomer(query.customerId);

  if (!customerContext) {
    redirect('/login');
  }

  const activeCustomer = customerContext.activeCustomer;

  if (!activeCustomer) {
    return (
      <section className="space-y-6">
        <h2 className="section-title">Dispositivo</h2>

        <EmptyState
          title="Nenhum cliente vinculado"
          description="Seu usuário ainda não possui clientes vinculados para exibição de dispositivos."
        />
      </section>
    );
  }

  const [device, alerts] = await Promise.all([
    getDeviceDetail(activeCustomer.customerId, deviceId),
    getDeviceAlerts(activeCustomer.customerId, deviceId),
  ]);

  if (!device) {
    return (
      <section className="space-y-6">
        <Link
          href={`/devices?customerId=${encodeURIComponent(
            activeCustomer.customerId,
          )}`}
          className="text-sm font-medium text-brand-700 hover:underline"
        >
          ← Voltar para dispositivos
        </Link>

        <EmptyState
          title="Dispositivo não encontrado"
          description="O dispositivo não existe, não pertence ao cliente selecionado ou não está visível para o portal."
        />
      </section>
    );
  }

  const devicesHref = `/devices?customerId=${encodeURIComponent(
    activeCustomer.customerId,
  )}`;

  const hardwareInventoryHref = `/devices/${encodeURIComponent(
    deviceId,
  )}/hardware?customerId=${encodeURIComponent(activeCustomer.customerId)}`;

  const softwareInventoryHref = `/devices/${encodeURIComponent(
    deviceId,
  )}/software?customerId=${encodeURIComponent(activeCustomer.customerId)}`;

  return (
    <section className="space-y-6">
      <div>
        <Link
          href={devicesHref}
          className="text-sm font-medium text-brand-700 hover:underline"
        >
          ← Voltar para dispositivos
        </Link>

        <div className="mt-4 flex flex-col gap-4 rounded-2xl border border-surface-border bg-white p-5 shadow-sm lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <DevicePlatformIcon
              operatingSystem={device.operatingSystem}
              deviceName={device.name}
            />

            <div>
              <h2 className="section-title">{device.name}</h2>
              <p className="mt-1 text-sm text-slate-600">
                {device.operatingSystem} • {activeCustomer.customerName} •{' '}
                {device.site}
              </p>
            </div>
          </div>

         <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
  <DeviceActionsMenu
    deviceId={deviceId}
    customerId={activeCustomer.customerId}
    hardwareInventoryHref={hardwareInventoryHref}
    softwareInventoryHref={softwareInventoryHref}
  />

  <DeviceStatusBadge status={device.status} />
</div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Status"
          value={deviceStatusLabel[device.status]}
          helper={<span className="text-xs text-slate-500">Estado atual</span>}
        />

        <StatCard
          label="Alertas ativos"
          value={String(device.activeAlerts)}
          helper={<span className="text-xs text-slate-500">No momento</span>}
        />

        <StatCard
          label="Último check-in"
          value={device.lastSeen}
          helper={<span className="text-xs text-slate-500">TRMM</span>}
        />

        <StatCard
          label="Último inventário"
          value={device.lastInventoryAt}
          helper={<span className="text-xs text-slate-500">SafeOps Sync</span>}
        />
      </div>

      <div className="rounded-2xl border border-surface-border bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="section-title">Inventário do equipamento</h3>

            <p className="mt-2 text-sm text-slate-600">
              Resumo principal do equipamento. Para informações completas de
              hardware, rede, armazenamento, adaptadores e softwares instalados,
              acesse os inventários técnicos.
            </p>
          </div>
         

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Fabricante
            </p>
            <p className="mt-1 font-medium text-slate-800">
              {device.manufacturer}
            </p>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Modelo
            </p>
            <p className="mt-1 font-medium text-slate-800">{device.model}</p>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Serial
            </p>
            <p className="mt-1 font-medium text-slate-800">
              {device.serialNumber}
            </p>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              CPU
            </p>
            <p className="mt-1 font-medium text-slate-800">{device.cpu}</p>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Memória RAM
            </p>
            <p className="mt-1 font-medium text-slate-800">
              {formatNumber(device.ramGb, 'GB')}
            </p>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Disco total
            </p>
            <p className="mt-1 font-medium text-slate-800">
              {formatNumber(device.diskTotalGb, 'GB')}
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-surface-border bg-white p-5 shadow-sm">
        <div>
          <h3 className="section-title">Histórico de alertas</h3>
          <p className="mt-2 text-sm text-slate-600">
            Eventos registrados para este equipamento, incluindo detalhes,
            recorrência e status.
          </p>
        </div>

        <div className="mt-5">
          {alerts.length === 0 ? (
            <EmptyState
              title="Nenhum alerta registrado"
              description="Este dispositivo ainda não possui histórico de alertas no SafeOps Manager."
            />
          ) : (
            <DataTable
              columns={[
                'Horário',
                'Severidade',
                'Status',
                'Item monitorado',
                'Detalhes',
                'Ocorrências',
                'Resolvido em',
              ]}
            >
              {alerts.map((alert) => (
                <tr key={alert.id} className="align-top text-slate-700">
                  <td className="whitespace-nowrap px-4 py-3 text-sm">
                    {alert.lastSeenAt !== '—'
                      ? alert.lastSeenAt
                      : alert.occurredAt}
                  </td>

                  <td className="px-4 py-3">
                    <SeverityBadge severity={alert.severity} />
                  </td>

                  <td className="px-4 py-3 text-sm">
                    {translateAlertStatus(alert.status)}
                  </td>

                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-800">
                      {alert.title}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {alert.alertType} • {alert.source}
                    </p>
                  </td>

                  <td className="max-w-xl px-4 py-3 text-sm leading-relaxed">
                    {alert.details}
                  </td>

                  <td className="px-4 py-3 text-sm">
                    {alert.occurrenceCount}
                  </td>

                  <td className="whitespace-nowrap px-4 py-3 text-sm">
                    {alert.resolvedAt}
                  </td>
                </tr>
              ))}
            </DataTable>
          )}
        </div>
      </div>
    </section>
  );
}
