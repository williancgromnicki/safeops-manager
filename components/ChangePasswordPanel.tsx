'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type ApiResponse = {
  ok: boolean;
  error?: string;
  message?: string;
};

const inputClassName =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20';

export function ChangePasswordPanel() {
  const router = useRouter();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      setIsSaving(true);
      setErrorMessage('');

      const response = await fetch('/api/me/change-password', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
        body: JSON.stringify({
          newPassword,
          confirmPassword,
        }),
      });

      const data = (await response.json()) as ApiResponse;

      if (!response.ok || !data.ok) {
        throw new Error(data.error ?? 'Não foi possível alterar a senha.');
      }

      router.replace('/dashboard');
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Não foi possível alterar a senha.',
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-light p-6">
      <div className="w-full max-w-lg rounded-2xl border border-surface-border bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-brand-900">
          Alterar senha
        </h1>

        <p className="mt-2 text-sm text-slate-600">
          Por segurança, você precisa definir uma nova senha antes de continuar
          usando o SafeOps Manager.
        </p>

        {errorMessage ? (
          <div className="mt-5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {errorMessage}
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <label className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Nova senha
            </span>
            <input
              className={inputClassName}
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              placeholder="Digite a nova senha"
              minLength={8}
              required
              autoComplete="new-password"
            />
          </label>

          <label className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Confirmar nova senha
            </span>
            <input
              className={inputClassName}
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Confirme a nova senha"
              minLength={8}
              required
              autoComplete="new-password"
            />
          </label>

          <button
            type="submit"
            disabled={isSaving}
            className="w-full rounded-lg bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? 'Salvando...' : 'Alterar senha e continuar'}
          </button>
        </form>
      </div>
    </div>
  );
}
