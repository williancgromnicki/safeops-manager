'use client';

import type { FormEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

type SiteRow = {
  id: string;
  customer_id: string;
  name: string;
  slug: string;
  tactical_site_id: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type CustomerRow = {
  id: string;
  name: string;
  slug: string;
  tactical_client_id: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  sites: SiteRow[] | null;
};

type CustomersApiResponse = {
  ok: boolean;
  error?: string;
  message?: string;
  customerId?: string;
  customers?: CustomerRow[];
};

type StatusMessage = {
  type: 'success' | 'error';
  message: string;
} | null;

const inputClassName =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20';

const primaryButtonClassName =
  'inline-flex items-center justify-center rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-60';

const secondaryButtonClassName =
  'inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60';

const dangerButtonClassName =
  'inline-flex items-center justify-center rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 shadow-sm transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60';

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

function formatDate(value?: string | null): string {
  if (!value) return '—';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString('pt-BR');
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

  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(true);
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<CustomerRow | null>(
    null,
  );
  const [removingCustomer, setRemovingCustomer] = useState<CustomerRow | null>(
    null,
  );
  const [isSavingCustomer, setIsSavingCustomer] = useState(false);
  const [isRemovingCustomer, setIsRemovingCustomer] = useState(false);
  const [status, setStatus] = useState<StatusMessage>(null);
  const [removeModalError, setRemoveModalError] = useState<string | null>(null);

  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerSlug, setNewCustomerSlug] = useState('');
  const [newCustomerNotes, setNewCustomerNotes] = useState('');
  const [newDefaultSiteName, setNewDefaultSiteName] = useState('Matriz');

  const [editCustomerName, setEditCustomerName] = useState('');
  const [editCustomerSlug, setEditCustomerSlug] = useState('');
  const [editCustomerNotes, setEditCustomerNotes] = useState('');
  const [deleteConfirmation, setDeleteConfirmation] = useState('');

  const sortedCustomers = useMemo(() => {
    return [...customers].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [customers]);

  async function loadCustomers() {
    try {
      setIsLoadingCustomers(true);

      const response = await fetch('/api/admin/customers', {
        method: 'GET',
        cache: 'no-store',
      });

      const data = await parseApiResponse(response);

      if (!data.ok) {
        throw new Error(data.error ?? 'Erro ao carregar clientes.');
      }

      setCustomers(data.customers ?? []);
    } catch (error) {
      setStatus({
        type: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Erro ao carregar clientes.',
      });
    } finally {
      setIsLoadingCustomers(false);
    }
  }

  useEffect(() => {
    loadCustomers();
  }, []);

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

      await loadCustomers();
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

  function openEditModal(customer: CustomerRow) {
    setEditingCustomer(customer);
    setEditCustomerName(customer.name);
    setEditCustomerSlug(customer.slug);
    setEditCustomerNotes(customer.notes ?? '');
  }

  function closeEditModal() {
    setEditingCustomer(null);
    setEditCustomerName('');
    setEditCustomerSlug('');
    setEditCustomerNotes('');
  }

  async function handleSaveCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!editingCustomer) {
      return;
    }

    try {
      setIsSavingCustomer(true);
      setStatus(null);

      const response = await fetch(
        `/api/admin/customers/${encodeURIComponent(editingCustomer.id)}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          cache: 'no-store',
          body: JSON.stringify({
            name: editCustomerName,
            slug: editCustomerSlug || slugify(editCustomerName),
            notes: editCustomerNotes,
          }),
        },
      );

      const data = await parseApiResponse(response);

      if (!data.ok) {
        throw new Error(data.error ?? 'Erro ao editar cliente.');
      }

      setStatus({
        type: 'success',
        message: data.message ?? 'Cliente atualizado com sucesso.',
      });

      closeEditModal();
      await loadCustomers();
      router.refresh();
    } catch (error) {
      setStatus({
        type: 'error',
        message:
          error instanceof Error ? error.message : 'Erro ao editar cliente.',
      });
    } finally {
      setIsSavingCustomer(false);
    }
  }

  function openRemoveModal(customer: CustomerRow) {
    setRemovingCustomer(customer);
    setDeleteConfirmation('');
    setRemoveModalError(null);
  }

  function closeRemoveModal() {
    setRemovingCustomer(null);
    setDeleteConfirmation('');
    setRemoveModalError(null);
  }

  async function handleRemoveCustomer() {
    if (!removingCustomer) {
      return;
    }

    if (deleteConfirmation !== removingCustomer.name) {
      setRemoveModalError(
        'Para remover o cliente, digite exatamente o nome dele no campo de confirmação.',
      );
      return;
    }

    try {
      setIsRemovingCustomer(true);
      setRemoveModalError(null);
      setStatus(null);

      const response = await fetch(
        `/api/admin/customers/${encodeURIComponent(removingCustomer.id)}`,
        {
          method: 'DELETE',
          cache: 'no-store',
        },
      );

      const data = await parseApiResponse(response);

      if (!data.ok) {
        throw new Error(data.error ?? 'Erro ao remover cliente.');
      }

      setStatus({
        type: 'success',
        message: data.message ?? 'Cliente removido com sucesso.',
      });

      closeRemoveModal();
      await loadCustomers();
      router.refresh();
    } catch (error) {
      setRemoveModalError(
        error instanceof Error ? error.message : 'Erro ao remover cliente.',
      );
    } finally {
      setIsRemovingCustomer(false);
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

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)]">
        <form
          onSubmit={handleCreateCustomer}
          className="rounded-2xl border border-surface-border bg-white p-5 shadow-sm"
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

        <div className="rounded-2xl border border-surface-border bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="section-title">Clientes cadastrados</h3>
              <p className="mt-1 text-sm text-slate-600">
                Edite o nome ou remova clientes e seus grupos vinculados.
              </p>
            </div>

            <button
              type="button"
              onClick={loadCustomers}
              className={secondaryButtonClassName}
              disabled={isLoadingCustomers}
            >
              {isLoadingCustomers ? 'Atualizando...' : 'Atualizar lista'}
            </button>
          </div>

          <div className="mt-5 overflow-hidden rounded-xl border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Cliente
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    ID TRMM
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Grupos
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Criado em
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Ações
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100 bg-white">
                {isLoadingCustomers ? (
                  <tr>
                    <td className="px-4 py-6 text-slate-500" colSpan={5}>
                      Carregando clientes...
                    </td>
                  </tr>
                ) : sortedCustomers.length === 0 ? (
                  <tr>
                    <td className="px-4 py-6 text-slate-500" colSpan={5}>
                      Nenhum cliente cadastrado.
                    </td>
                  </tr>
                ) : (
                  sortedCustomers.map((customer) => (
                    <tr key={customer.id}>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-brand-900">
                          {customer.name}
                        </p>
                        <p className="text-xs text-slate-500">
                          {customer.slug}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {customer.tactical_client_id ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {customer.sites?.length ?? 0}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {formatDate(customer.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => openEditModal(customer)}
                            className={secondaryButtonClassName}
                          >
                            Editar
                          </button>

                          <button
                            type="button"
                            onClick={() => openRemoveModal(customer)}
                            className={dangerButtonClassName}
                          >
                            Remover
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {editingCustomer ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <form
            onSubmit={handleSaveCustomer}
            className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl"
          >
            <h3 className="text-lg font-semibold text-brand-900">
              Editar cliente
            </h3>

            <div className="mt-5 space-y-4">
              <FieldLabel label="Nome do cliente">
                <input
                  className={inputClassName}
                  value={editCustomerName}
                  onChange={(event) => {
                    setEditCustomerName(event.target.value);
                    setEditCustomerSlug(slugify(event.target.value));
                  }}
                  required
                />
              </FieldLabel>

              <FieldLabel label="Slug do cliente">
                <input
                  className={inputClassName}
                  value={editCustomerSlug}
                  onChange={(event) => setEditCustomerSlug(event.target.value)}
                  required
                />
              </FieldLabel>

              <FieldLabel label="Observações">
                <textarea
                  className={inputClassName}
                  value={editCustomerNotes}
                  onChange={(event) => setEditCustomerNotes(event.target.value)}
                  rows={3}
                />
              </FieldLabel>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeEditModal}
                className={secondaryButtonClassName}
              >
                Cancelar
              </button>

              <button
                type="submit"
                disabled={isSavingCustomer}
                className={primaryButtonClassName}
              >
                {isSavingCustomer ? 'Salvando...' : 'Salvar alterações'}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {removingCustomer ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-rose-700">
              Remover cliente
            </h3>

            <p className="mt-2 text-sm text-slate-600">
              Esta ação removerá o cliente no TRMM e também removerá no SafeOps
              os grupos/sites vinculados a ele. Use somente para clientes de
              teste ou quando tiver certeza.
            </p>

            {removeModalError ? (
              <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm leading-relaxed text-rose-800">
                <p className="font-semibold">Não foi possível remover agora.</p>
                <p className="mt-1">{removeModalError}</p>
              </div>
            ) : null}

            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
              Para confirmar, digite exatamente:
              <strong className="ml-1">{removingCustomer.name}</strong>
            </div>

            <label className="mt-5 block space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Confirmação
              </span>
              <input
                className={inputClassName}
                value={deleteConfirmation}
                onChange={(event) => {
                  setDeleteConfirmation(event.target.value);
                  setRemoveModalError(null);
                }}
                placeholder={removingCustomer.name}
              />
            </label>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeRemoveModal}
                className={secondaryButtonClassName}
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={handleRemoveCustomer}
                disabled={
                  isRemovingCustomer ||
                  deleteConfirmation !== removingCustomer.name
                }
                className={dangerButtonClassName}
              >
                {isRemovingCustomer ? 'Removendo...' : 'Remover cliente'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
