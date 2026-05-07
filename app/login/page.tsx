import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';

async function login(formData: FormData) {
  'use server';

  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect('/login?error=invalid_credentials');
  }

  redirect('/dashboard');
}

export default function LoginPage() {
  return (
    <section className="mx-auto max-w-md card">
      <h1 className="section-title">Acessar SafeOps Manager</h1>
      <p className="mt-2 text-sm text-slate-600">Entre com suas credenciais corporativas.</p>
      <form className="mt-6 space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="email">
            E-mail corporativo
          </label>
          <input
            className="w-full rounded-lg border border-surface-border px-3 py-2"
            id="email"
            name="email"
            type="email"
            placeholder="voce@empresa.com"
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="password">
            Senha
          </label>
          <input
            className="w-full rounded-lg border border-surface-border px-3 py-2"
            id="password"
            name="password"
            type="password"
            placeholder="••••••••"
            required
          />
        </div>
        </div>

<div className="mt-4">
  <button
    formAction={login}
    className="w-full rounded-lg bg-brand-700 px-4 py-2 font-semibold text-white hover:bg-brand-900"
  >
    Entrar
  </button>
</div>
      </form>
    </section>
  );
}
