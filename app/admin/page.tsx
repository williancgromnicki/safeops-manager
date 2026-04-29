import { redirect } from 'next/navigation';

import { EmptyState } from '@/components/EmptyState';
import { LoadingState } from '@/components/LoadingState';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

export default async function AdminPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <section className="space-y-6">
      <h2 className="section-title">Admin</h2>
      <LoadingState label="Sincronizando permissões de acesso..." />
      <EmptyState
        title="Nenhuma ação pendente"
        description="Os fluxos administrativos estão estáveis. Novas solicitações aparecerão aqui."
      />
    </section>
  );
}
