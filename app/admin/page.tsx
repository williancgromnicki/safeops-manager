import { redirect } from 'next/navigation';

import { DataTable } from '@/components/DataTable';
import { EmptyState } from '@/components/EmptyState';
import { listAllowedCustomersForAdminService } from '@/lib/services/admin';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type AdminCustomer = {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  siteCount: number;
  createdAt: string;
};

type CustomerRow = {
  id: string;
  name: string;
  slug: string | null;
  is_active: boolean | null;
  created_at: string;
};

type SiteRow = {
  id: string;
  customer_id: string;
};

async function listAdminCustomers(): Promise<AdminCustomer[]> {
  const supabaseAdmin = getSupabaseAdmin();

  const { data: customersData, error: customersError } = await supabaseAdmin
    .from('customers')
    .select(['id', 'name', 'slug', 'is_active', 'created_at'].join(', '))
    .order('name', { ascending: true });

  if (customersError) {
    throw new Error(`Erro ao listar clientes: ${customersError.message}`);
  }

  const customers = (customersData ?? []) as unknown as CustomerRow[];
  const customerIds = customers.map((customer) => customer.id);

  let sites: SiteRow[] = [];

  if (customerIds.length > 0) {
    const { data: sitesData, error: sitesError } = await supabaseAdmin
      .from('sites')
      .select('id, customer_id')
      .in('customer_id', customerIds);

    if (sitesError) {
      throw new Error(`Erro ao listar sites: ${sitesError.message}`);
    }

    sites = (sitesData ?? []) as unknown as SiteRow[];
  }

  const siteCountByCustomerId = new Map<string, number>();

  for (const site of sites) {
    const currentCount = siteCountByCustomerId.get(site.customer_id) ?? 0;
    siteCountByCustomerId.set(site.customer_id, currentCount + 1);
  }

  return customers.map((customer) => ({
    id: customer.id,
    name: customer.name,
    slug: customer.slug ?? '',
    isActive: customer.is_active !== false,
    siteCount: siteCountByCustomerId.get(customer.id) ?? 0,
    createdAt: customer.created_at,
  }));
}

function formatDate(value?: string | null): string {
  if (!value) {
    return '—';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString('pt-BR');
}

export default async function AdminPage() {
  let isAdmin = false;
  let customers: AdminCustomer[] = [];
  let errorMessage = '';

  try {
    const result = await listAllowedCustomersForAdminService();

    isAdmin = result.isAdmin;

    if (isAdmin) {
      customers = await listAdminCustomers();
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('Unauthorized')) {
      redirect('/login');
    }

    console.error('Erro ao carregar painel administrativo:', error);

    isAdmin = false;
    customers = [];
    errorMessage =
      'Não foi possível carregar o painel administrativo neste momento.';
  }

  if (!isAdmin) {
    return (
      <section className="space-y-6">
        <div>
          <h2 className="section-title">Painel administrativo</h2>
          <p className="mt-2 text-sm text-slate-600">
            Área interna da Safesys para gestão operacional do SafeOps Manager.
          </p>
        </div>

        <EmptyState
          title="Acesso não permitido"
          description="Seu usuário não possui permissão para acessar esta área."
        />
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div>
        <h2 className="section-title">Painel administrativo</h2>
        <p className="mt-2 text-sm text-slate-600">
          Visão geral dos clientes cadastrados no SafeOps Manager.
        </p>
      </div>

      {errorMessage ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {errorMessage}
        </div>
      ) : null}

      <div className="rounded-2xl border border-surface-border bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="section-title">Clientes cadastrados</h3>
            <p className="mt-2 text-sm text-slate-600">
              Resumo dos clientes disponíveis para administração.
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            <span className="font-semibold text-slate-900">
              {customers.length}
            </span>{' '}
            cliente{customers.length === 1 ? '' : 's'}
          </div>
        </div>

        <div className="mt-5">
          {customers.length === 0 ? (
            <EmptyState
              title="Nenhum cliente cadastrado"
              description="Os clientes sincronizados ou cadastrados aparecerão aqui."
            />
          ) : (
            <DataTable
              columns={['Cliente', 'Slug', 'Sites', 'Status', 'Criado em']}
            >
              {customers.map((customer) => (
                <tr key={customer.id} className="text-slate-700">
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {customer.name}
                  </td>
                  <td className="px-4 py-3">{customer.slug || '—'}</td>
                  <td className="px-4 py-3">{customer.siteCount}</td>
                  <td className="px-4 py-3">
                    {customer.isActive ? (
                      <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-600/20">
                        Ativo
                      </span>
                    ) : (
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-500/20">
                        Inativo
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">{formatDate(customer.createdAt)}</td>
                </tr>
              ))}
            </DataTable>
          )}
        </div>
      </div>
    </section>
  );
}
