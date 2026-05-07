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

const buttonClassName =
  'inline-flex items-center justify-center rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-60';

const secondaryButtonClassName =
  'inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60';

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

  if (!response.ok) {
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
  const [selectedSiteId, setSelectedSiteId] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);
  const [isSavingCustomer, setIsSavingCustomer] = useState(false);
  const [isCreatingSite, setIsCreatingSite] = useState(false);
  const [isSavingSite, setIsSavingSite] = useState(false);
  const [status, setStatus] = useState<StatusMessage>(null);

  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerSlug, setNewCustomerSlug] = useState('');
  const [newCustomerNotes, setNewCustomerNotes] = useState('');
  const [newDefaultSiteName, setNewDefaultSiteName] = useState('Matriz');
  const [createDefaultSite, setCreateDefaultSite] = useState(true);

  const [editCustomerName, setEditCustomerName] = useState('');
  const [editCustomerSlug, setEditCustomerSlug] = useState('');
  const [editCustomerNotes, setEditCustomerNotes] = useState('');
  const [editTacticalClientId, setEditTacticalClientId] = useState('');
  const [editWindowsAgentUrl, setEditWindowsAgentUrl] = useState('');
  const [editLinuxAgentUrl, setEditLinuxAgentUrl] = useState('');
  const [editMacosAgentUrl, setEditMacosAgentUrl] = useState('');
  const [editCustomerActive, setEditCustomerActive] = useState(true);

  const [newSiteName, setNewSiteName] = useState('');
  const [newSiteSlug, setNewSiteSlug] = useState('');
  const [newSiteNotes, setNewSiteNotes] = useState('');
  const [newTacticalSiteId, setNewTacticalSiteId] = useState('');

  const [editSiteName, setEditSiteName] = useState('');
  const [editSiteSlug, setEditSiteSlug] = useState('');
  const [editSiteNotes, setEditSiteNotes] = useState('');
  const [editTacticalSiteId, setEditTacticalSiteId] = useState('');
  const [editSiteActive, setEditSiteActive] = useState(true);

  const selectedCustomer = useMemo(() => {
    return customers.find((customer) => customer.id === selectedCustomerId) ?? null;
  }, [customers, selectedCustomerId]);

  const selectedSite = useMemo(() => {
    return (
      selectedCustomer?.sites?.find((site) => site.id === selectedSiteId) ?? null
    );
  }, [selectedCustomer, selectedSiteId]);

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

      const nextSelectedSite =
        nextSelectedCustomer?.sites?.find((site) => site.id === selectedSiteId) ??
        nextSelectedCustomer?.sites?.[0] ??
        null;

      setSelectedSiteId(nextSelectedSite?.id ?? '');
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

  useEffect(() => {
    if (!selectedCustomer) {
      setEditCustomerName('');
      setEditCustomerSlug('');
      setEditCustomerNotes('');
      setEditTacticalClientId('');
      setEditWindowsAgentUrl('');
      setEditLinuxAgentUrl('');
      setEditMacosAgentUrl('');
      setEditCustomerActive(true);
      return;
    }

    setEditCustomerName(selectedCustomer.name);
    setEditCustomerSlug(selectedCustomer.slug);
    setEditCustomerNotes(selectedCustomer.notes ?? '');
    setEditTacticalClientId(selectedCustomer.tactical_client_id ?? '');
    setEditWindowsAgentUrl(selectedCustomer.trmm_windows_agent_url ?? '');
    setEditLinuxAgentUrl(selectedCustomer.trmm_linux_agent_url ?? '');
    setEditMacosAgentUrl(selectedCustomer.trmm_macos_agent_url ?? '');
    setEditCustomerActive(selectedCustomer.is_active !== false);
  }, [selectedCustomer]);

  useEffect(() => {
    if (!selectedSite) {
      setEditSiteName('');
      setEditSiteSlug('');
      setEditSiteNotes('');
      setEditTacticalSiteId('');
      setEditSiteActive(true);
      return;
    }

    setEditSiteName(selectedSite.name);
    setEditSiteSlug(selectedSite.slug);
    setEditSiteNotes(selectedSite.notes ?? '');
    setEditTacticalSiteId(selectedSite.tactical_site_id ?? '');
    setEditSiteActive(selectedSite.is_active !== false);
  }, [selectedSite]);

  async function handleCreateCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

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
          name: newCustomerName,
          slug: newCustomerSlug || slugify(newCustomerName),
          notes: newCustomerNotes,
          createDefaultSite,
          defaultSiteName: newDefaultSiteName,
        }),
      });

      const data = await parseApiResponse(response);

      if (!data.ok) {
        throw new Error(data.error ?? 'Erro ao criar cliente.');
      }

      setStatus({
        type: 'success',
        message: data.message ?? 'Cliente criado com sucesso.',
      });

      setNewCustomerName('');
      setNewCustomerSlug('');
      setNewCustomerNotes('');
      setNewDefaultSiteName('Matriz');
      setCreateDefaultSite(true);

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

  async function handleSaveCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedCustomer) {
      return;
    }

    try {
      setIsSavingCustomer(true);
      setStatus(null);

      const response = await fetch(
        `/api/admin/customers/${encodeURIComponent(selectedCustomer.id)}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          cache: 'no-store',
          body: JSON.stringify({
            name: editCustomerName,
            slug: editCustomerSlug,
            notes: editCustomerNotes,
            tacticalClientId: editTacticalClientId,
            windowsAgentUrl: editWindowsAgentUrl,
            linuxAgentUrl: editLinuxAgentUrl,
            macosAgentUrl: editMacosAgentUrl,
            isActive: editCustomerActive,
          }),
        },
      );

      const data = await parseApiResponse(response);

      if (!data.ok) {
        throw new Error(data.error ?? 'Erro ao atualizar cliente.');
      }

      setStatus({
        type: 'success',
        message: data.message ?? 'Cliente atualizado com sucesso.',
      });

      await loadCustomers();
      router.refresh();
    } catch (error) {
      setStatus({
        type: 'error',
        message:
          error instanceof Error ? error.message : 'Erro ao atualizar cliente.',
      });
    } finally {
      setIsSavingCustomer(false);
    }
  }

  async function handleCreateSite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedCustomer) {
      setStatus({
        type: 'error',
        message: 'Selecione um cliente antes de criar o site.',
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
            name: newSiteName,
            slug: newSiteSlug || slugify(newSiteName),
            notes: newSiteNotes,
            tacticalSiteId: newTacticalSiteId,
          }),
        },
      );

      const data = await parseApiResponse(response);

      if (!data.ok) {
        throw new Error(data.error ?? 'Erro ao criar site.');
      }

      setStatus({
        type: 'success',
        message: data.message ?? 'Site criado com sucesso.',
      });

      setNewSiteName('');
      setNewSiteSlug('');
      setNewSiteNotes('');
      setNewTacticalSiteId('');

      await loadCustomers();
      router.refresh();
    } catch (error) {
      setStatus({
        type: 'error',
        message: error instanceof Error ? error.message : 'Erro ao criar site.',
      });
    } finally {
      setIsCreatingSite(false);
    }
  }

  async function handleSaveSite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedCustomer || !selectedSite) {
      return;
    }

    try {
      setIsSavingSite(true);
      setStatus(null);

      const response = await fetch(
        `/api/admin/sites/${encodeURIComponent(selectedSite.id)}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          cache: 'no-store',
          body: JSON.stringify({
            customerId: selectedCustomer.id,
            name: editSiteName,
            slug: editSiteSlug,
            notes: editSiteNotes,
            tacticalSiteId: editTacticalSiteId,
            isActive: editSiteActive,
          }),
        },
      );

      const data = await parseApiResponse(response);

      if (!data.ok) {
        throw new Error(data.error ?? 'Erro ao atualizar site.');
      }

      setStatus({
        type: 'success',
        message: data.message ?? 'Site atualizado com sucesso.',
      });

      await loadCustomers();
      router.refresh();
    } catch (error) {
      setStatus({
        type: 'error',
        message:
          error instanceof Error ? error.message : 'Erro ao atualizar site.',
      });
    } finally {
      setIsSavingSite(false);
    }
  }

  return (
    <div className="space-y-6">
      <StatusAlert status={status} />

      <div className="rounded-2xl border border-surface-border bg-white p-5 shadow-sm">
        <h2 className="section-title">Clientes e sites</h2>
        <p className="mt-2 text-sm text-slate-600">
          Cadastre clientes, unidades/sites e mantenha os identificadores
          operacionais usados na integração.
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

            <FieldLabel label="Slug">
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

            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={createDefaultSite}
                onChange={(event) => setCreateDefaultSite(event.target.checked)}
                className="mt-1"
              />
              <span>Criar site padrão junto com o cliente</span>
            </label>

            {createDefaultSite ? (
              <FieldLabel label="Nome do site padrão">
                <input
                  className={inputClassName}
                  value={newDefaultSiteName}
                  onChange={(event) => setNewDefaultSiteName(event.target.value)}
                  placeholder="Matriz"
                  required
                />
              </FieldLabel>
            ) : null}

            <button
              type="submit"
              className={buttonClassName}
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
                  onChange={(event) => {
                    setSelectedCustomerId(event.target.value);
                    const customer = customers.find(
                      (item) => item.id === event.target.value,
                    );
                    setSelectedSiteId(customer?.sites?.[0]?.id ?? '');
                  }}
                >
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}
                      {customer.is_active ? '' : ' — inativo'}
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
                    Sites:
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
            onSubmit={handleSaveCustomer}
            className="rounded-2xl border border-surface-border bg-white p-5 shadow-sm"
          >
            <h3 className="section-title">Editar cliente</h3>

            <div className="mt-5 space-y-4">
              <FieldLabel label="Nome">
                <input
                  className={inputClassName}
                  value={editCustomerName}
                  onChange={(event) => setEditCustomerName(event.target.value)}
                  required
                />
              </FieldLabel>

              <FieldLabel label="Slug">
                <input
                  className={inputClassName}
                  value={editCustomerSlug}
                  onChange={(event) => setEditCustomerSlug(event.target.value)}
                  required
                />
              </FieldLabel>

              <FieldLabel label="ID do cliente na integração operacional">
                <input
                  className={inputClassName}
                  value={editTacticalClientId}
                  onChange={(event) =>
                    setEditTacticalClientId(event.target.value)
                  }
                  placeholder="ID externo do cliente"
                />
              </FieldLabel>

              <FieldLabel label="Instalador Windows">
                <input
                  className={inputClassName}
                  value={editWindowsAgentUrl}
                  onChange={(event) =>
                    setEditWindowsAgentUrl(event.target.value)
                  }
                  placeholder="URL do instalador Windows"
                />
              </FieldLabel>

              <FieldLabel label="Instalador Linux">
                <input
                  className={inputClassName}
                  value={editLinuxAgentUrl}
                  onChange={(event) =>
                    setEditLinuxAgentUrl(event.target.value)
                  }
                  placeholder="URL do instalador Linux"
                />
              </FieldLabel>

              <FieldLabel label="Instalador macOS">
                <input
                  className={inputClassName}
                  value={editMacosAgentUrl}
                  onChange={(event) =>
                    setEditMacosAgentUrl(event.target.value)
                  }
                  placeholder="URL do instalador macOS"
                />
              </FieldLabel>

              <FieldLabel label="Observações">
                <textarea
                  className={inputClassName}
                  value={editCustomerNotes}
                  onChange={(event) =>
                    setEditCustomerNotes(event.target.value)
                  }
                  rows={3}
                />
              </FieldLabel>

              <label className="flex items-start gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={editCustomerActive}
                  onChange={(event) =>
                    setEditCustomerActive(event.target.checked)
                  }
                  className="mt-1"
                />
                <span>Cliente ativo</span>
              </label>

              <button
                type="submit"
                className={buttonClassName}
                disabled={isSavingCustomer}
              >
                {isSavingCustomer ? 'Salvando...' : 'Salvar cliente'}
              </button>
            </div>
          </form>

          <div className="space-y-6">
            <form
              onSubmit={handleCreateSite}
              className="rounded-2xl border border-surface-border bg-white p-5 shadow-sm"
            >
              <h3 className="section-title">Criar site</h3>

              <div className="mt-5 space-y-4">
                <FieldLabel label="Nome do site">
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

                <FieldLabel label="Slug">
                  <input
                    className={inputClassName}
                    value={newSiteSlug}
                    onChange={(event) => setNewSiteSlug(event.target.value)}
                    required
                  />
                </FieldLabel>

                <FieldLabel label="ID do site na integração operacional">
                  <input
                    className={inputClassName}
                    value={newTacticalSiteId}
                    onChange={(event) =>
                      setNewTacticalSiteId(event.target.value)
                    }
                    placeholder="ID externo do site"
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
                  className={buttonClassName}
                  disabled={isCreatingSite}
                >
                  {isCreatingSite ? 'Criando...' : 'Criar site'}
                </button>
              </div>
            </form>

            <div className="rounded-2xl border border-surface-border bg-white p-5 shadow-sm">
              <h3 className="section-title">Sites do cliente</h3>

              <div className="mt-5 space-y-4">
                {(selectedCustomer.sites?.length ?? 0) === 0 ? (
                  <p className="rounded-xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">
                    Nenhum site cadastrado para este cliente.
                  </p>
                ) : (
                  <FieldLabel label="Site selecionado">
                    <select
                      className={inputClassName}
                      value={selectedSiteId}
                      onChange={(event) => setSelectedSiteId(event.target.value)}
                    >
                      {selectedCustomer.sites?.map((site) => (
                        <option key={site.id} value={site.id}>
                          {site.name}
                          {site.is_active ? '' : ' — inativo'}
                        </option>
                      ))}
                    </select>
                  </FieldLabel>
                )}

                {selectedSite ? (
                  <form onSubmit={handleSaveSite} className="space-y-4">
                    <FieldLabel label="Nome">
                      <input
                        className={inputClassName}
                        value={editSiteName}
                        onChange={(event) =>
                          setEditSiteName(event.target.value)
                        }
                        required
                      />
                    </FieldLabel>

                    <FieldLabel label="Slug">
                      <input
                        className={inputClassName}
                        value={editSiteSlug}
                        onChange={(event) =>
                          setEditSiteSlug(event.target.value)
                        }
                        required
                      />
                    </FieldLabel>

                    <FieldLabel label="ID do site na integração operacional">
                      <input
                        className={inputClassName}
                        value={editTacticalSiteId}
                        onChange={(event) =>
                          setEditTacticalSiteId(event.target.value)
                        }
                      />
                    </FieldLabel>

                    <FieldLabel label="Observações">
                      <textarea
                        className={inputClassName}
                        value={editSiteNotes}
                        onChange={(event) =>
                          setEditSiteNotes(event.target.value)
                        }
                        rows={3}
                      />
                    </FieldLabel>

                    <label className="flex items-start gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={editSiteActive}
                        onChange={(event) =>
                          setEditSiteActive(event.target.checked)
                        }
                        className="mt-1"
                      />
                      <span>Site ativo</span>
                    </label>

                    <button
                      type="submit"
                      className={buttonClassName}
                      disabled={isSavingSite}
                    >
                      {isSavingSite ? 'Salvando...' : 'Salvar site'}
                    </button>
                  </form>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-relaxed text-amber-900">
        <p className="font-semibold">Próximo passo da integração</p>
        <p className="mt-2">
          Esta tela já prepara clientes, sites e URLs de instaladores. A próxima
          etapa é automatizar a criação no ambiente operacional e preencher os
          IDs externos automaticamente.
        </p>
      </div>
    </div>
  );
}
