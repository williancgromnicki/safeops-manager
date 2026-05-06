import { redirect } from 'next/navigation';

import { AdminManagementPanel } from '@/components/AdminManagementPanel';
import { AlertContactsPanel } from '@/components/AlertContactsPanel';
import { DataTable } from '@/components/DataTable';
import { EmptyState } from '@/components/EmptyState';
import { DEMO_CUSTOMERS } from '@/lib/demo-data';
import { listAllowedCustomersForAdminService } from '@/lib/services/admin';
import { listAlertContactsService } from '@/lib/services/alert-contacts';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type AdminCustomer = {
  id: string;
  name: string;
  slug: string;
  trmmWindowsAgentUrl: string;
  trmmLinuxAgentUrl: string;
  trmmMacosAgentUrl: string;
  notes: string;
};

type CustomerRow = {
  id: string;
  name: string;
  slug: string | null;
  trmm_windows_agent_url: string | null;
  trmm_linux_agent_url: string | null;
  trmm_macos_agent_url: string | null;
  notes: string | null;
};

async function listAdminCustomers(): Promise<AdminCustomer[]> {
  const supabaseAdmin = getSupabaseAdmin();

  const { data, error } = await supabaseAdmin
    .from('customers')
    .select(
      [
        'id',
        'name',
        'slug',
        'trmm_windows_agent_url',
        'trmm_linux_agent_url',
        'trmm_macos_agent_url',
        'notes',
      ].join(', '),
    )
    .order('name', { ascending: true });

  if (error) {
    throw new Error(`Erro ao listar clientes administrativos: ${error.message}`);
  }

  const rows = (data ?? []) as unknown as CustomerRow[];

  return rows.map((customer) => ({
    id: customer.id,
    name: customer.name,
    slug: customer.slug ?? '',
    trmmWindowsAgentUrl: customer.trmm_windows_agent_url ?? '',
    trmmLinuxAgentUrl: customer.trmm_linux_agent_url ?? '',
    trmmMacosAgentUrl: customer.trmm_macos_agent_url ?? '',
    notes: customer.notes ?? '',
  }));
}

export default async function AdminPage() {
  let customers = [] as Awaited<
    ReturnType<typeof listAllowedCustomersForAdminService>
  >['customers'];

  let adminCustomers: AdminCustomer[] = [];
  let isAdmin = false;
  let alertContacts = [] as Awaited<ReturnType<typeof listAlertContactsService>>;
  let errorMessage = '';

  try {
    const result = await listAllowedCustomersForAdminService();

    customers = result.customers;
    isAdmin = result.isAdmin;

    if (isAdmin) {
      const [contacts, allCustomers] = await Promise.all([
        listAlertContactsService(),
        listAdminCustomers(),
      ]);

      alertContacts = contacts;
      adminCustomers = allCustomers;
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('Unauthorized')) {
      redirect('/login');
    }

    console.error('Erro ao carregar dados administrativos:', error);

    customers = [];
    adminCustomers = [];
    isAdmin = false;
    alertContacts = [];
    errorMessage =
      'Não foi possível carregar os dados administrativos neste momento.';
  }

  const rows =
    adminCustomers.length > 0
      ? adminCustomers.map((customer) => ({
          id: customer.id,
          name: customer.name,
          source: 'Banco de dados',
          windowsUrl: customer.trmmWindowsAgentUrl,
          linuxUrl: customer.trmmLinuxAgentUrl,
          macosUrl: customer.trmmMacosAgentUrl,
        }))
      : customers.length > 0
        ? customers.map((customer) => ({
            id: customer.id,
            name: customer.name,
            source: 'Banco de dados',
            windowsUrl: '',
            linuxUrl: '',
            macosUrl: '',
          }))
        : DEMO_CUSTOMERS.map((customer) => ({
            id: customer.id,
            name: customer.name,
            source: 'Demo fallback',
            windowsUrl: '',
            linuxUrl: '',
            macosUrl: '',
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
          Você não tem permissão para acessar os recursos administrativos.
        </p>
      ) : null}

      {isAdmin ? <AdminManagementPanel customers={adminCustomers} /> : null}

      <div className="rounded-2xl border border-surface-border bg-white p-5 shadow-sm">
        <h3 className="section-title">Clientes cadastrados</h3>
        <p className="mt-2 text-sm text-slate-600">
          Lista de clientes conhecidos no SafeOps Manager e links de instalação disponíveis para implantação de agentes.
        </p>

        <div className="mt-5">
          {rows.length === 0 ? (
            <EmptyState
              title="Nenhum cliente disponível"
              description="Adicione clientes para habilitar controles administrativos avançados."
            />
          ) : (
            <DataTable
              columns={[
                'Cliente',
                'Origem',
                'Windows',
                'Linux',
                'macOS',
                'Referência',
              ]}
            >
              {rows.map((row) => (
                <tr key={row.id} className="text-slate-700">
                  <td className="px-4 py-3 font-medium">{row.name}</td>
                  <td className="px-4 py-3">{row.source}</td>
                  <td className="px-4 py-3">
                    {row.windowsUrl ? (
                      <a
                        href={row.windowsUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium text-brand-700 hover:underline"
                      >
                        Baixar
                      </a>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {row.linuxUrl ? (
                      <a
                        href={row.linuxUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium text-brand-700 hover:underline"
                      >
                        Baixar
                      </a>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {row.macosUrl ? (
                      <a
                        href={row.macosUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium text-brand-700 hover:underline"
                      >
                        Baixar
                      </a>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-3">{row.id}</td>
                </tr>
              ))}
            </DataTable>
          )}
        </div>
      </div>

      {isAdmin ? (
        <AlertContactsPanel
          contacts={alertContacts}
          customers={customers}
          canManage={isAdmin}
        />
      ) : null}
    </section>
  );
}
