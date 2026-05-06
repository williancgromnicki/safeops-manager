import { redirect } from 'next/navigation';

import { AdminUsersPanel } from '@/components/AdminUsersPanel';
import { EmptyState } from '@/components/EmptyState';
import { resolveCurrentCustomer } from '@/lib/data/get-current-customer';

export const dynamic = 'force-dynamic';

type AdminUsersPageProps = {
  searchParams?: Promise<{
    customerId?: string;
  }>;
};

export default async function AdminUsersPage({
  searchParams,
}: AdminUsersPageProps) {
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
          description="Seu usuário ainda não possui clientes vinculados para gestão de usuários."
        />
      </section>
    );
  }

  const allowedRoles = new Set(['admin', 'client']);

  if (!allowedRoles.has(activeCustomer.role)) {
    return (
      <section className="space-y-6">
        <EmptyState
          title="Acesso não permitido"
          description="Seu usuário não possui permissão para gerenciar usuários deste cliente."
        />
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <AdminUsersPanel
        customerId={activeCustomer.customerId}
        customerName={activeCustomer.customerName}
        currentUserRole={activeCustomer.role}
      />
    </section>
  );
}
