import { redirect } from 'next/navigation';

import { DataTable } from '@/components/DataTable';
import { EmptyState } from '@/components/EmptyState';
import { LoadingState } from '@/components/LoadingState';
import { AlertContactsPanel } from '@/components/AlertContactsPanel';
import { DEMO_CUSTOMERS } from '@/lib/demo-data';
import { listAlertContactsService } from '@/lib/services/alert-contacts';
import { listAllowedCustomersForAdminService } from '@/lib/services/admin';

export default async function AdminPage() {
  let customers = [] as Awaited<ReturnType<typeof listAllowedCustomersForAdminService>>;

  try {
    customers = await listAllowedCustomersForAdminService();
  } catch (error) {
    if (error instanceof Error && error.message.includes('Unauthorized')) {
      redirect('/login');
    }

    throw error;
  }

  const rows = customers.length > 0
    ? customers.map((customer) => ({ id: customer.id, name: customer.name, source: 'Banco de dados' }))
    : DEMO_CUSTOMERS.map((customer) => ({ id: customer.id, name: customer.name, source: 'Demo fallback' }));

  const alertContacts = await listAlertContactsService();

  return (
    <section className="space-y-6">
      <h2 className="section-title">Admin</h2>
      <LoadingState label="Carregando configurações administrativas..." />
      {rows.length === 0 ? (
        <EmptyState
          title="Nenhum cliente disponível"
          description="Adicione clientes para habilitar controles administrativos avançados."
        />
      ) : (
        <DataTable columns={['Cliente', 'Origem', 'Referência']}>
          {rows.map((row) => (
            <tr key={row.id} className="text-slate-700">
              <td className="px-4 py-3 font-medium">{row.name}</td>
              <td className="px-4 py-3">{row.source}</td>
              <td className="px-4 py-3">{row.id}</td>
            </tr>
          ))}
        </DataTable>
      )}
      <AlertContactsPanel contacts={alertContacts} />
    </section>
  );
}
