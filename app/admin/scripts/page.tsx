import { redirect } from 'next/navigation';

import { EmptyState } from '@/components/EmptyState';
import { RemoteScriptsPanel } from '@/components/RemoteScriptsPanel';
import { resolveCurrentCustomer } from '@/lib/data/get-current-customer';

export const dynamic = 'force-dynamic';

type ScriptsPageProps = {
  searchParams?: Promise<{
    customerId?: string;
  }>;
};

export default async function ScriptsPage({ searchParams }: ScriptsPageProps) {
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
          description="Seu usuário ainda não possui clientes vinculados para uso da biblioteca de scripts."
        />
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <RemoteScriptsPanel
        customerId={activeCustomer.customerId}
        customerName={activeCustomer.customerName}
        role={activeCustomer.role}
      />
    </section>
  );
}
