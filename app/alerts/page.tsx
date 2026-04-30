import { redirect } from 'next/navigation';

import { DataTable } from '@/components/DataTable';
import { EmptyState } from '@/components/EmptyState';
import { SeverityBadge } from '@/components/SeverityBadge';
import { getAlerts } from '@/lib/data/get-alerts';
import { getCurrentCustomer } from '@/lib/data/get-current-customer';
import { DEMO_ALERTS } from '@/lib/demo-data';

export default async function AlertsPage() {
  const customer = await getCurrentCustomer();

  if (!customer) {
    redirect('/login');
  }

  const alerts = customer ? await getAlerts(customer.customerId) : [];
  const list = alerts.length > 0 ? alerts : DEMO_ALERTS;

  return (
    <section className="space-y-6">
      <h2 className="section-title">Alertas</h2>
      {list.length === 0 ? (
        <EmptyState
          title="Nenhum alerta registrado"
          description="Quando eventos forem detectados, eles aparecerão nesta listagem."
        />
      ) : (
        <DataTable columns={['Alerta', 'Origem', 'Severidade']}>
          {list.map((alert) => (
            <tr key={alert.id} className="text-slate-700">
              <td className="px-4 py-3 font-medium">{alert.title}</td>
              <td className="px-4 py-3">{alert.source}</td>
              <td className="px-4 py-3"><SeverityBadge severity={alert.severity} /></td>
            </tr>
          ))}
        </DataTable>
      )}
    </section>
  );
}
