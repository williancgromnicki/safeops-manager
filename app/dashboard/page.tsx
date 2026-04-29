import { redirect } from 'next/navigation';

import { EmptyState } from '@/components/EmptyState';
import { StatCard } from '@/components/StatCard';
import { StatusBadge } from '@/components/StatusBadge';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { DEMO_DASHBOARD_METRICS } from '@/lib/demo-data';
import { createClient } from '@/lib/supabase/server';

export default async function DashboardPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login');
  }

  const supabase = await createClient();
  const [{ count: deviceCount }, { count: criticalCount }, { count: warningCount }] = await Promise.all([
    supabase.from('devices').select('*', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('alerts').select('*', { count: 'exact', head: true }).eq('severity', 'high'),
    supabase.from('alerts').select('*', { count: 'exact', head: true }).eq('severity', 'medium'),
  ]);

  const hasRealData = (deviceCount ?? 0) > 0 || (criticalCount ?? 0) > 0 || (warningCount ?? 0) > 0;
  const metrics = hasRealData
    ? {
        monitoredSites: 0,
        activeDevices: deviceCount ?? 0,
        risksInAttention: warningCount ?? 0,
        criticalEvents: criticalCount ?? 0,
      }
    : DEMO_DASHBOARD_METRICS;

  return (
    <section className="space-y-6">
      <h2 className="section-title">Dashboard</h2>
      {!hasRealData && metrics.activeDevices === 0 ? (
        <EmptyState
          title="Sem dados para o dashboard"
          description="Os indicadores serão exibidos aqui quando houver dispositivos e alertas cadastrados."
        />
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Sites monitorados" value={String(metrics.monitoredSites)} helper={<StatusBadge status="Saudável" />} />
        <StatCard label="Dispositivos ativos" value={String(metrics.activeDevices)} helper={<StatusBadge status="Saudável" />} />
        <StatCard label="Riscos em atenção" value={String(metrics.risksInAttention)} helper={<StatusBadge status="Atenção" />} />
        <StatCard label="Eventos críticos" value={String(metrics.criticalEvents)} helper={<StatusBadge status="Crítico" />} />
      </div>
    </section>
  );
}
