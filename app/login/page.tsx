export default function LoginPage() {
  return (
    <section className="mx-auto max-w-md card">
      <h1 className="section-title">Acessar SafeOps Manager</h1>
      <p className="mt-2 text-sm text-slate-600">Entre com suas credenciais corporativas.</p>
      <form className="mt-6 space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">E-mail corporativo</label>
          <input className="w-full rounded-lg border border-surface-border px-3 py-2" type="email" placeholder="voce@empresa.com" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Senha</label>
          <input className="w-full rounded-lg border border-surface-border px-3 py-2" type="password" placeholder="••••••••" />
        </div>
        <button type="submit" className="w-full rounded-lg bg-brand-700 px-4 py-2 font-semibold text-white hover:bg-brand-900">
          Entrar
        </button>
      </form>
    </section>
  );
}
