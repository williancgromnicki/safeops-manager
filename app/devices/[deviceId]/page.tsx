import Link from 'next/link';
import { redirect } from 'next/navigation';

import { DataTable } from '@/components/DataTable';
import { DevicePlatformIcon } from '@/components/DevicePlatformIcon';
import { EmptyState } from '@/components/EmptyState';
import { SeverityBadge } from '@/components/SeverityBadge';
import { StatCard } from '@/components/StatCard';
import { StatusBadge } from '@/components/StatusBadge';
import { getDeviceAlerts } from '@/lib/data/get-device-alerts';
import { getDeviceDetail } from '@/lib/data/get-device-detail';
import { resolveCurrentCustomer } from '@/lib/data/get-current-customer';

export const dynamic = 'force-dynamic';

type DeviceDetailPageProps = {
  params: Promise<{
    deviceId: string;
  }>;
  searchParams?: Promise<{
    customerId?: string;
  }>;
};

function translateAlertStatus(status?: string | null): string {
  return status?.toLowerCase() === 'closed' ? 'Fechado' : 'Aberto';
}

function translateDeviceStatus(status: string): string {
  if (status === 'online') return 'Online';
  if (status === 'offline') return 'Offline';
  if (status === 'attention') return 'Atenção';

  return 'Desconhecido';
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

  return (
    <section className="space-y-6">
      <div>
        <Link
          href={`/devices?customerId=${encodeURIComponent(
            activeCustomer.customerId,
          )}`}
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

          <StatusBadge status={device.status} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Status"
          value={translateDeviceStatus(device.status)}
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
        <h3 className="section-title">Inventário do equipamento</h3>

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
