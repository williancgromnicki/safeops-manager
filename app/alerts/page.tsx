import { redirect } from 'next/navigation';

import { DataTable } from '@/components/DataTable';
import { EmptyState } from '@/components/EmptyState';
import { SeverityBadge } from '@/components/SeverityBadge';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { DEMO_ALERTS, type DemoAlert } from '@/lib/demo-data';
import { createClient } from '@/lib/supabase/server';

export default async function AlertsPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login');
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from('alerts')
    .select('id, title, severity')
    .order('occurred_at', { ascending: false });

  const alerts: DemoAlert[] = data && data.length > 0
    ? data.map((alert): DemoAlert => ({
        id: alert.id,
        customerId: user.id,
        source: alert.title,
        severity:
          alert.severity === 'high'
            ? 'CRIT'
            : alert.severity === 'medium'
              ? 'WARN'
              : 'INFO',
        title: alert.title,
      }))
    : DEMO_ALERTS;

  return (
    <section className="space-y-6">
      <h2 className="section-title">Alerts</h2>
      {alerts.length === 0 ? (
        <EmptyState
          title="Nenhum alerta registrado"
          description="Quando eventos forem detectados, eles aparecerão nesta listagem."
        />
      ) : (
        <DataTable columns={['Alerta', 'Origem', 'Severidade']}>
          {alerts.map((alert) => (
            <tr key={alert.id} className="text-slate-700">
              <td className="px-4 py-3 font-medium">{alert.id}</td>
              <td className="px-4 py-3">{alert.source}</td>
              <td className="px-4 py-3"><SeverityBadge severity={alert.severity} /></td>
            </tr>
          ))}
        </DataTable>
      )}
    </section>
  );
}
