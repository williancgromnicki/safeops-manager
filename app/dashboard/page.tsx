import { redirect } from 'next/navigation';

import { StatCard } from '@/components/StatCard';
import { StatusBadge } from '@/components/StatusBadge';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

export default async function DashboardPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <section className="space-y-6">
      <h2 className="section-title">Dashboard</h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Sites monitorados" value="12" helper={<StatusBadge status="Saudável" />} />
        <StatCard label="Dispositivos ativos" value="148" helper={<StatusBadge status="Saudável" />} />
        <StatCard label="Riscos em atenção" value="9" helper={<StatusBadge status="Atenção" />} />
        <StatCard label="Eventos críticos" value="2" helper={<StatusBadge status="Crítico" />} />
      </div>
    </section>
  );
}
