import { redirect } from 'next/navigation';

import { AdminCustomersPanel } from '@/components/AdminCustomersPanel';
import { EmptyState } from '@/components/EmptyState';
import { resolveCurrentCustomer } from '@/lib/data/get-current-customer';

export const dynamic = 'force-dynamic';

type AdminCustomersPageProps = {
  searchParams?: Promise<{
    customerId?: string;
  }>;
};

export default async function AdminCustomersPage({
  searchParams,
}: AdminCustomersPageProps) {
  const query = searchParams ? await searchParams : {};
  const customerContext = await resolveCurrentCustomer(query.customerId);

  if (!customerContext) {
    redirect('/login');
  }

  const activeCustomer = customerContext.activeCustomer;

  if (!activeCustomer) {
    return (
      <section className="space-y-6">
        <EmptyState
          title="Nenhum cliente vinculado"
          description="Seu usuário ainda não possui clientes vinculados para gestão administrativa."
        />
      </section>
    );
  }

  if (activeCustomer.role !== 'admin') {
    return (
      <section className="space-y-6">
        <EmptyState
          title="Acesso não permitido"
          description="Somente administradores Safesys podem gerenciar clientes e sites."
        />
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <AdminCustomersPanel />
    </section>
  );
}
