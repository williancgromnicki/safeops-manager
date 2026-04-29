import { redirect } from 'next/navigation';

import { DataTable } from '@/components/DataTable';
import { SeverityBadge } from '@/components/SeverityBadge';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

const ALERTS = [
  { id: 'AL-001', source: 'Sensor Pressão 01', severity: 'WARN' as const },
  { id: 'AL-002', source: 'Gateway OPC', severity: 'CRIT' as const },
  { id: 'AL-003', source: 'Servidor Historiador', severity: 'INFO' as const },
];

export default async function AlertsPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <section className="space-y-6">
      <h2 className="section-title">Alerts</h2>
      <DataTable columns={['Alerta', 'Origem', 'Severidade']}>
        {ALERTS.map((alert) => (
          <tr key={alert.id} className="text-slate-700">
            <td className="px-4 py-3 font-medium">{alert.id}</td>
            <td className="px-4 py-3">{alert.source}</td>
            <td className="px-4 py-3"><SeverityBadge severity={alert.severity} /></td>
          </tr>
        ))}
      </DataTable>
    </section>
  );
}
