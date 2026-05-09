'use client';

import type { FormEvent } from 'react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

type CustomersApiResponse = {
  ok: boolean;
  error?: string;
  message?: string;
  customerId?: string;
};

type StatusMessage = {
  type: 'success' | 'error';
  message: string;
} | null;

const inputClassName =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20';

const primaryButtonClassName =
  'inline-flex items-center justify-center rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-60';

function FieldLabel({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="space-y-1">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </span>
      {children}
    </label>
  );
}

function StatusAlert({ status }: { status: StatusMessage }) {
  if (!status) {
    return null;
  }

  const className =
    status.type === 'success'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
      : 'border-rose-200 bg-rose-50 text-rose-800';

  return (
    <div className={`rounded-lg border px-4 py-3 text-sm ${className}`}>
      {status.message}
    </div>
  );
}

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

async function parseApiResponse(
  response: Response,
): Promise<CustomersApiResponse> {
  const data = (await response.json().catch(() => null)) as
    | CustomersApiResponse
    | null;

  if (!data) {
    return {
      ok: false,
      error: 'Resposta inválida da API.',
    };
  }

  if (!response.ok || !data.ok) {
    return {
      ok: false,
      error: data.error ?? 'Erro ao executar operação.',
    };
  }

  return data;
}

export function AdminCustomersPanel() {
  const router = useRouter();

  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);
  const [status, setStatus] = useState<StatusMessage>(null);

  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerSlug, setNewCustomerSlug] = useState('');
  const [newCustomerNotes, setNewCustomerNotes] = useState('');
  const [newDefaultSiteName, setNewDefaultSiteName] = useState('Matriz');

  async function handleCreateCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const customerName = newCustomerName.trim();
    const siteName = newDefaultSiteName.trim();

    if (!customerName || !siteName) {
      setStatus({
        type: 'error',
        message:
          'Todo cliente precisa ter pelo menos um grupo inicial para organizar seus dispositivos.',
      });
      return;
    }

    try {
      setIsCreatingCustomer(true);
      setStatus(null);

      const response = await fetch('/api/admin/customers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
        body: JSON.stringify({
          name: customerName,
          slug: newCustomerSlug || slugify(customerName),
          notes: newCustomerNotes,
          defaultSiteName: siteName,
        }),
      });

      const data = await parseApiResponse(response);

      if (!data.ok) {
        throw new Error(data.error ?? 'Erro ao criar cliente.');
      }

      setStatus({
        type: 'success',
        message: data.message ?? 'Cliente e grupo inicial criados com sucesso.',
      });

      setNewCustomerName('');
      setNewCustomerSlug('');
      setNewCustomerNotes('');
      setNewDefaultSiteName('Matriz');

      router.refresh();
    } catch (error) {
      setStatus({
        type: 'error',
        message:
          error instanceof Error ? error.message : 'Erro ao criar cliente.',
      });
    } finally {
      setIsCreatingCustomer(false);
    }
  }

  return (
    <div className="space-y-6">
      <StatusAlert status={status} />

      <div className="rounded-2xl border border-surface-border bg-white p-5 shadow-sm">
        <h2 className="section-title">Clientes</h2>
        <p className="mt-2 text-sm text-slate-600">
          Cadastre novos clientes no SafeOps Manager. Todo cliente precisa de um
          primeiro grupo, que será usado para organizar seus dispositivos.
        </p>
      </div>

      <form
        onSubmit={handleCreateCustomer}
        className="max-w-3xl rounded-2xl border border-surface-border bg-white p-5 shadow-sm"
      >
        <h3 className="section-title">Criar cliente</h3>

        <div className="mt-5 space-y-4">
          <FieldLabel label="Nome do cliente">
            <input
              className={inputClassName}
              value={newCustomerName}
              onChange={(event) => {
                setNewCustomerName(event.target.value);
                setNewCustomerSlug(slugify(event.target.value));
              }}
              placeholder="Empresa Exemplo"
              required
            />
          </FieldLabel>

          <FieldLabel label="Primeiro grupo">
            <input
              className={inputClassName}
              value={newDefaultSiteName}
              onChange={(event) => setNewDefaultSiteName(event.target.value)}
              placeholder="Matriz"
              required
            />
          </FieldLabel>

          <FieldLabel label="Slug do cliente">
            <input
              className={inputClassName}
              value={newCustomerSlug}
              onChange={(event) => setNewCustomerSlug(event.target.value)}
              placeholder="empresa-exemplo"
              required
            />
          </FieldLabel>

          <FieldLabel label="Observações">
            <textarea
              className={inputClassName}
              value={newCustomerNotes}
              onChange={(event) => setNewCustomerNotes(event.target.value)}
              rows={3}
              placeholder="Informações internas sobre o cliente"
            />
          </FieldLabel>

          <button
            type="submit"
            className={primaryButtonClassName}
            disabled={isCreatingCustomer}
          >
            {isCreatingCustomer ? 'Criando...' : 'Criar cliente'}
          </button>
        </div>
      </form>
    </div>
  );
}
