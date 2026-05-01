import { redirect } from 'next/navigation';

import { AlertContactsPanel } from '@/components/AlertContactsPanel';
import { DataTable } from '@/components/DataTable';
import { EmptyState } from '@/components/EmptyState';
import { DEMO_CUSTOMERS } from '@/lib/demo-data';
import { listAllowedCustomersForAdminService } from '@/lib/services/admin';
import { listAlertContactsService } from '@/lib/services/alert-contacts';

export default async function AdminPage() {
  let customers = [] as Awaited<
    ReturnType<typeof listAllowedCustomersForAdminService>
  >['customers'];

  let isAdmin = false;
  let alertContacts = [] as Awaited<ReturnType<typeof listAlertContactsService>>;
  let errorMessage = '';

  try {
    const result = await listAllowedCustomersForAdminService();

    customers = result.customers;
    isAdmin = result.isAdmin;

    if (isAdmin) {
      alertContacts = await listAlertContactsService();
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('Unauthorized')) {
      redirect('/login');
    }

    console.error('Erro ao carregar dados administrativos:', error);

    customers = [];
    isAdmin = false;
    alertContacts = [];
    errorMessage =
      'Não foi possível carregar os dados administrativos neste momento.';
  }

  const rows =
    customers.length > 0
      ? customers.map((customer) => ({
          id: customer.id,
          name: customer.name,
          source: 'Banco de dados',
        }))
      : DEMO_CUSTOMERS.map((customer) => ({
          id: customer.id,
          name: customer.name,
          source: 'Demo fallback',
        }));

  return (
    <section className="space-y-6">
      <div>
        <h2 className="section-title">Admin</h2>
        <p className="mt-2 text-sm text-slate-600">
          Área interna da Safesys para gestão operacional do SafeOps Manager.
        </p>
      </div>

      {errorMessage ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {errorMessage}
        </div>
      ) : null}

      {!isAdmin ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Você não tem permissão para alterar contatos de alerta.
        </p>
      ) : null}

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

      {isAdmin ? <AlertContactsPanel contacts={alertContacts} /> : null}
    </section>
  );
}
