import { redirect } from 'next/navigation';

import { getCurrentUser } from '@/lib/auth/getCurrentUser';

export default async function DevicesPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <section className="space-y-4">
      <h1 className="section-title">Devices</h1>
      <div className="card">
        <p className="text-slate-700">Esta é a visão inicial de devices do SafeOps Manager.</p>
      </div>
    </section>
  );
}
