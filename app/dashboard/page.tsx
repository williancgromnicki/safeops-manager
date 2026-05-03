import { redirect } from 'next/navigation';

import { EmptyState } from '@/components/EmptyState';
import { StatCard } from '@/components/StatCard';
import { StatusBadge } from '@/components/StatusBadge';
import { getAlerts, type AlertItem } from '@/lib/data/get-alerts';
import { resolveCurrentCustomer } from '@/lib/data/get-current-customer';
import { getDevices } from '@/lib/data/get-devices';
import {
  DEMO_ALERTS,
  DEMO_CUSTOMERS,
  DEMO_DASHBOARD_METRICS,
  DEMO_DEVICES,
} from '@/lib/demo-data';

export const dynamic = 'force-dynamic';

type DashboardPageProps = {
  searchParams?: Promise<{
    customerId?: string;
  }>;
};

function isAlertOpen(alert: AlertItem) {
  const status =
    'status' in alert && typeof alert.status === 'string'
      ? alert.status.toLowerCase()
      : null;

  if (!status) return true;

  return status !== 'closed';
}

function getOverallStatus(
  devices: Awaited<ReturnType<typeof getDevices>>,
  alerts: AlertItem[],
) {
  const openAlerts = alerts.filter(isAlertOpen);

  const hasCritical =
    openAlerts.some((alert) => alert.severity === 'CRIT') ||
    devices.some((device) => device.status === 'offline');

  if (hasCritical) return 'Crítico';

  const hasWarning =
    openAlerts.some((alert) => alert.severity === 'WARN') ||
    devices.some((device) => device.status === 'attention');

  if (hasWarning) return 'Atenção';

  return 'Saudável';
}

export default async function DashboardPage({
  searchParams,
}: DashboardPageProps) {
  const params = searchParams ? await searchParams : {};
  const customerContext = await resolveCurrentCustomer(params.customerId);

  if (!customerContext) {
    redirect('/login');
  }

  const activeCustomer = customerContext.activeCustomer;

  if (!activeCustomer) {
    return (
      <section className="space-y-6">
        <h2 className="section-title">Dashboard</h2>

        <EmptyState
          title="Nenhum cliente vinculado"
          description="Seu usuário ainda não possui clientes vinculados para exibição no SafeOps Manager."
        />
      </section>
    );
  }

  const isDemoCustomer = activeCustomer.customerSlug === 'safesys-demo';

  const [realDevices, realAlerts] = await Promise.all([
    getDevices(activeCustomer.customerId),
    getAlerts(activeCustomer.customerId),
  ]);

  const devices = isDemoCustomer && realDevices.length === 0 ? DEMO_DEVICES : realDevices;
  const alerts = isDemoCustomer && realAlerts.length === 0 ? DEMO_ALERTS : realAlerts;

  const hasRealData = realDevices.length > 0 || realAlerts.length > 0;
  const hasDisplayData = devices.length > 0 || alerts.length > 0;

  const offline = devices.filter((device) => device.status === 'offline').length;
  const online = devices.filter((device) => device.status === 'online').length;
  const attention = devices.filter(
    (device) => device.status === 'attention',
  ).length;

  const activeAlerts = alerts.filter(isAlertOpen).length;
  const criticalAlerts = alerts.filter(
    (alert) => isAlertOpen(alert) && alert.severity === 'CRIT',
  ).length;

  const metrics =
    isDemoCustomer && !hasRealData
      ? DEMO_DASHBOARD_METRICS
      : {
          monitoredSites: devices.length,
          activeDevices: online,
          risksInAttention: attention + activeAlerts,
          criticalEvents: criticalAlerts + offline,
        };

  const customerName =
    activeCustomer.customerName ?? DEMO_CUSTOMERS[0]?.name ?? 'Cliente';

  return (
    <section className="space-y-6">
      <div>
        <h2 className="section-title">Dashboard - {customerName}</h2>
        <p className="mt-2 text-sm text-slate-600">
          Visão operacional consolidada do cliente selecionado.
        </p>
      </div>

      {!hasDisplayData ? (
        <EmptyState
          title="Sem dados para o dashboard"
          description="Os indicadores serão exibidos aqui quando houver dispositivos e alertas cadastrados para este cliente."
        />
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total de dispositivos"
          value={String(metrics.monitoredSites)}
          helper={<StatusBadge status={getOverallStatus(devices, alerts)} />}
        />

        <StatCard
          label="Dispositivos online"
          value={String(metrics.activeDevices)}
          helper={<StatusBadge status="Saudável" />}
        />

        <StatCard
          label="Dispositivos offline"
          value={String(offline)}
          helper={<StatusBadge status={offline > 0 ? 'Crítico' : 'Saudável'} />}
        />

        <StatCard
          label="Alertas ativos (críticos)"
          value={`${activeAlerts} (${criticalAlerts})`}
          helper={
            <StatusBadge status={criticalAlerts > 0 ? 'Crítico' : 'Atenção'} />
          }
        />
      </div>
    </section>
  );
}
