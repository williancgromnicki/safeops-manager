import { redirect } from 'next/navigation';

import { getCurrentUser } from '@/lib/auth/getCurrentUser';

export default async function AdminPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <section className="space-y-4">
      <h1 className="section-title">Admin</h1>
      <div className="card">
        <p className="text-slate-700">Esta é a visão inicial de admin do SafeOps Manager.</p>
      </div>
    </section>
  );
}
