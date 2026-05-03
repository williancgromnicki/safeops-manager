import { redirect } from 'next/navigation';

import { DataTable } from '@/components/DataTable';
import { EmptyState } from '@/components/EmptyState';
import { SeverityBadge } from '@/components/SeverityBadge';
import { getAlerts, type AlertItem } from '@/lib/data/get-alerts';
import { resolveCurrentCustomer } from '@/lib/data/get-current-customer';
import { DEMO_ALERTS } from '@/lib/demo-data';

export const dynamic = 'force-dynamic';

type AlertsPageProps = {
  searchParams?: Promise<{
    customerId?: string;
  }>;
};

function translateStatus(status?: string | null): string {
  return status?.toLowerCase() === 'closed' ? 'Fechado' : 'Aberto';
}

export default async function AlertsPage({ searchParams }: AlertsPageProps) {
  const params = searchParams ? await searchParams : {};
  const customerContext = await resolveCurrentCustomer(params.customerId);

  if (!customerContext) {
    redirect('/login');
  }

  const activeCustomer = customerContext.activeCustomer;

  if (!activeCustomer) {
    return (
      <section className="space-y-6">
        <h2 className="section-title">Alertas</h2>

        <EmptyState
          title="Nenhum cliente vinculado"
          description="Seu usuário ainda não possui clientes vinculados para exibição de alertas."
        />
      </section>
    );
  }

  const isDemoCustomer = activeCustomer.customerSlug === 'safesys-demo';

  const realAlerts = await getAlerts(activeCustomer.customerId);

  const list: AlertItem[] =
    isDemoCustomer && realAlerts.length === 0
      ? DEMO_ALERTS.map((alert) => ({
          ...alert,
          status: 'open',
          occurrenceCount: 1,
          lastSeenAt: null,
        }))
      : realAlerts;

  return (
    <section className="space-y-6">
      <div>
        <h2 className="section-title">
          Alertas - {activeCustomer.customerName}
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          Eventos operacionais do cliente selecionado.
        </p>
      </div>

      {list.length === 0 ? (
        <EmptyState
          title="Nenhum alerta registrado"
          description="Quando eventos forem detectados para este cliente, eles aparecerão nesta listagem."
        />
      ) : (
        <DataTable columns={['Alerta', 'Origem', 'Severidade', 'Status']}>
          {list.map((alert) => (
            <tr key={alert.id} className="text-slate-700">
              <td className="px-4 py-3 font-medium">
                {alert.title}
                {alert.occurrenceCount && alert.occurrenceCount > 1 ? (
                  <span className="ml-2 text-sm font-semibold text-slate-500">
                    x{alert.occurrenceCount}
                  </span>
                ) : null}
              </td>
              <td className="px-4 py-3">{alert.source}</td>
              <td className="px-4 py-3">
                <SeverityBadge severity={alert.severity} />
              </td>
              <td className="px-4 py-3">{translateStatus(alert.status)}</td>
            </tr>
          ))}
        </DataTable>
      )}
    </section>
  );
}
