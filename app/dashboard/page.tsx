import { redirect } from 'next/navigation';
export const dynamic = 'force-dynamic';
import { EmptyState } from '@/components/EmptyState';
import { StatCard } from '@/components/StatCard';
import { StatusBadge } from '@/components/StatusBadge';
import { getAlerts, type AlertItem } from '@/lib/data/get-alerts';
import { getCurrentCustomer } from '@/lib/data/get-current-customer';
import { getDevices } from '@/lib/data/get-devices';
import { DEMO_ALERTS, DEMO_CUSTOMERS, DEMO_DASHBOARD_METRICS, DEMO_DEVICES } from '@/lib/demo-data';

function isAlertOpen(alert: AlertItem) {
  const status =
    'status' in alert && typeof alert.status === 'string'
      ? alert.status.toLowerCase()
      : null;

  if (!status) return true;

  return status !== 'closed';
}

function getOverallStatus(devices: Awaited<ReturnType<typeof getDevices>>, alerts: AlertItem[]) {
  const openAlerts = alerts.filter(isAlertOpen);

  const hasCritical = openAlerts.some((a) => a.severity === 'CRIT') || devices.some((d) => d.status === 'offline');
  if (hasCritical) return 'Crítico';

  const hasWarning = openAlerts.some((a) => a.severity === 'WARN') || devices.some((d) => d.status === 'attention');
  if (hasWarning) return 'Atenção';

  return 'Saudável';
}

export default async function DashboardPage() {
  const customer = await getCurrentCustomer();

  if (!customer) {
    redirect('/login');
  }

  const [realDevices, realAlerts] = customer
    ? await Promise.all([getDevices(customer.customerId), getAlerts(customer.customerId)])
    : [[], []];

  const devices = realDevices.length > 0 ? realDevices : DEMO_DEVICES;
  const alerts = realAlerts.length > 0 ? realAlerts : DEMO_ALERTS;

  const hasRealData = realDevices.length > 0 || realAlerts.length > 0;

  const offline = devices.filter((device) => device.status === 'offline').length;
  const online = devices.filter((device) => device.status === 'online').length;
  const attention = devices.filter((device) => device.status === 'attention').length;
  const activeAlerts = alerts.filter(isAlertOpen).length;
  const criticalAlerts = alerts.filter((alert) => isAlertOpen(alert) && alert.severity === 'CRIT').length;

  const metrics = hasRealData
    ? {
        monitoredSites: devices.length,
        activeDevices: online,
        risksInAttention: attention + activeAlerts,
        criticalEvents: criticalAlerts + offline,
      }
    : DEMO_DASHBOARD_METRICS;

  const customerName = customer?.customerName ?? DEMO_CUSTOMERS[0].name;

  return (
    <section className="space-y-6">
      <h2 className="section-title">Dashboard - {customerName}</h2>
      {!hasRealData && metrics.activeDevices === 0 ? (
        <EmptyState
          title="Sem dados para o dashboard"
          description="Os indicadores serão exibidos aqui quando houver dispositivos e alertas cadastrados."
        />
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total de dispositivos" value={String(devices.length)} helper={<StatusBadge status={getOverallStatus(devices, alerts)} />} />
        <StatCard label="Dispositivos online" value={String(online)} helper={<StatusBadge status="Saudável" />} />
        <StatCard label="Dispositivos offline" value={String(offline)} helper={<StatusBadge status={offline > 0 ? 'Crítico' : 'Saudável'} />} />
        <StatCard label="Alertas ativos (críticos)" value={`${activeAlerts} (${criticalAlerts})`} helper={<StatusBadge status={criticalAlerts > 0 ? 'Crítico' : 'Atenção'} />} />
      </div>
    </section>
  );
}
