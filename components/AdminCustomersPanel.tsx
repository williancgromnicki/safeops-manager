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
  trmm_windows_agent_url: string | null;
  trmm_linux_agent_url: string | null;
  trmm_macos_agent_url: string | null;
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
  siteId?: string;
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
  'inline-flex items-center justify-center rounded-lg border border-brand-200 bg-white px-4 py-2 text-sm font-semibold text-brand-900 shadow-sm transition hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-60';

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

function formatDate(value?: string | null): string {
  if (!value) return '—';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString('pt-BR');
}

export function AdminCustomersPanel() {
  const router = useRouter();

  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);
  const [isCreatingSite, setIsCreatingSite] = useState(false);
  const [status, setStatus] = useState<StatusMessage>(null);

  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerSlug, setNewCustomerSlug] = useState('');
  const [newCustomerNotes, setNewCustomerNotes] = useState('');
  const [newDefaultSiteName, setNewDefaultSiteName] = useState('Matriz');

  const [newSiteName, setNewSiteName] = useState('');
  const [newSiteSlug, setNewSiteSlug] = useState('');
  const [newSiteNotes, setNewSiteNotes] = useState('');

  const selectedCustomer = useMemo(() => {
    return customers.find((customer) => customer.id === selectedCustomerId) ?? null;
  }, [customers, selectedCustomerId]);

  async function loadCustomers() {
    try {
      setIsLoading(true);
      setStatus(null);

      const response = await fetch('/api/admin/customers', {
        method: 'GET',
        cache: 'no-store',
      });

      const data = await parseApiResponse(response);

      if (!data.ok) {
        throw new Error(data.error ?? 'Erro ao carregar clientes.');
      }

      const nextCustomers = data.customers ?? [];
      setCustomers(nextCustomers);

      const nextSelectedCustomer =
        nextCustomers.find((customer) => customer.id === selectedCustomerId) ??
        nextCustomers[0] ??
        null;

      setSelectedCustomerId(nextSelectedCustomer?.id ?? '');
    } catch (error) {
      setStatus({
        type: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Erro ao carregar clientes.',
      });
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadCustomers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  async function handleCreateSite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedCustomer) {
      setStatus({
        type: 'error',
        message: 'Selecione um cliente antes de criar o grupo.',
      });
      return;
    }

    const siteName = newSiteName.trim();

    if (!siteName) {
      setStatus({
        type: 'error',
        message: 'Informe o nome do grupo.',
      });
      return;
    }

    try {
      setIsCreatingSite(true);
      setStatus(null);

      const response = await fetch(
        `/api/admin/customers/${encodeURIComponent(selectedCustomer.id)}/sites`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          cache: 'no-store',
          body: JSON.stringify({
            name: siteName,
            slug: newSiteSlug || slugify(siteName),
            notes: newSiteNotes,
          }),
        },
      );

      const data = await parseApiResponse(response);

      if (!data.ok) {
        throw new Error(data.error ?? 'Erro ao criar grupo.');
      }

      setStatus({
        type: 'success',
        message: data.message ?? 'Grupo criado com sucesso.',
      });

      setNewSiteName('');
      setNewSiteSlug('');
      setNewSiteNotes('');

      await loadCustomers();
      router.refresh();
    } catch (error) {
      setStatus({
        type: 'error',
        message: error instanceof Error ? error.message : 'Erro ao criar grupo.',
      });
    } finally {
      setIsCreatingSite(false);
    }
  }

  return (
    <div className="space-y-6">
      <StatusAlert status={status} />

      <div className="rounded-2xl border border-surface-border bg-white p-5 shadow-sm">
        <h2 className="section-title">Clientes e grupos</h2>
        <p className="mt-2 text-sm text-slate-600">
          Cadastre clientes e organize suas unidades/filiais em grupos. No TRMM,
          cada grupo é criado como um site vinculado ao cliente.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
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
          <h3 className="section-title">Clientes cadastrados</h3>

          <div className="mt-5 space-y-4">
            {isLoading ? (
              <p className="text-sm text-slate-500">Carregando clientes...</p>
            ) : customers.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">
                Nenhum cliente cadastrado.
              </p>
            ) : (
              <FieldLabel label="Cliente selecionado">
                <select
                  className={inputClassName}
                  value={selectedCustomerId}
                  onChange={(event) => setSelectedCustomerId(event.target.value)}
                >
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}
                    </option>
                  ))}
                </select>
              </FieldLabel>
            )}

            {selectedCustomer ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                <p>
                  <span className="font-semibold text-slate-900">Slug:</span>{' '}
                  {selectedCustomer.slug}
                </p>
                <p className="mt-1">
                  <span className="font-semibold text-slate-900">
                    ID TRMM:
                  </span>{' '}
                  {selectedCustomer.tactical_client_id ?? 'Não vinculado'}
                </p>
                <p className="mt-1">
                  <span className="font-semibold text-slate-900">
                    Grupos:
                  </span>{' '}
                  {selectedCustomer.sites?.length ?? 0}
                </p>
                <p className="mt-1">
                  <span className="font-semibold text-slate-900">
                    Criado em:
                  </span>{' '}
                  {formatDate(selectedCustomer.created_at)}
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {selectedCustomer ? (
        <div className="grid gap-6 xl:grid-cols-2">
          <form
            onSubmit={handleCreateSite}
            className="rounded-2xl border border-surface-border bg-white p-5 shadow-sm"
          >
            <h3 className="section-title">Criar grupo adicional</h3>

            <div className="mt-5 space-y-4">
              <FieldLabel label="Nome do grupo">
                <input
                  className={inputClassName}
                  value={newSiteName}
                  onChange={(event) => {
                    setNewSiteName(event.target.value);
                    setNewSiteSlug(slugify(event.target.value));
                  }}
                  placeholder="Matriz, Filial 01, Datacenter..."
                  required
                />
              </FieldLabel>

              <FieldLabel label="Slug do grupo">
                <input
                  className={inputClassName}
                  value={newSiteSlug}
                  onChange={(event) => setNewSiteSlug(event.target.value)}
                  required
                />
              </FieldLabel>

              <FieldLabel label="Observações">
                <textarea
                  className={inputClassName}
                  value={newSiteNotes}
                  onChange={(event) => setNewSiteNotes(event.target.value)}
                  rows={3}
                />
              </FieldLabel>

              <button
                type="submit"
                className={secondaryButtonClassName}
                disabled={isCreatingSite}
              >
                {isCreatingSite ? 'Criando...' : 'Criar grupo'}
              </button>
            </div>
          </form>

          <div className="rounded-2xl border border-surface-border bg-white p-5 shadow-sm">
            <h3 className="section-title">Grupos do cliente</h3>

            <div className="mt-5 space-y-3">
              {(selectedCustomer.sites?.length ?? 0) === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">
                  Nenhum grupo cadastrado para este cliente.
                </p>
              ) : (
                selectedCustomer.sites?.map((site) => (
                  <div
                    key={site.id}
                    className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600"
                  >
                    <p className="font-semibold text-brand-900">{site.name}</p>
                    <p className="mt-1">
                      <span className="font-semibold text-slate-900">
                        Slug:
                      </span>{' '}
                      {site.slug}
                    </p>
                    <p className="mt-1">
                      <span className="font-semibold text-slate-900">
                        ID TRMM:
                      </span>{' '}
                      {site.tactical_site_id ?? 'Não vinculado'}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
