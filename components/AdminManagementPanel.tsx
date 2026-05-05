'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

type AdminCustomer = {
  id: string;
  name: string;
  slug: string;
  trmmWindowsAgentUrl: string;
  trmmLinuxAgentUrl: string;
  trmmMacosAgentUrl: string;
  notes: string;
};

type AdminManagementPanelProps = {
  customers: AdminCustomer[];
};

type ApiResponse = {
  ok: boolean;
  error?: string;
  message?: string;
};

type FormStatus = {
  type: 'success' | 'error';
  message: string;
} | null;

async function parseApiResponse(response: Response): Promise<ApiResponse> {
  const data = (await response.json().catch(() => null)) as ApiResponse | null;

  if (!data) {
    return {
      ok: false,
      error: 'Resposta inválida da API.',
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      error: data.error ?? 'Erro ao executar ação administrativa.',
    };
  }

  return data;
}

function StatusMessage({ status }: { status: FormStatus }) {
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

const inputClassName =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20';

const buttonClassName =
  'inline-flex items-center justify-center rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-60';

export function AdminManagementPanel({ customers }: AdminManagementPanelProps) {
  const router = useRouter();

  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [isSavingPermission, setIsSavingPermission] = useState(false);
  const [isSavingLinks, setIsSavingLinks] = useState(false);

  const [status, setStatus] = useState<FormStatus>(null);

  const [customerName, setCustomerName] = useState('');
  const [customerNotes, setCustomerNotes] = useState('');

  const [userEmail, setUserEmail] = useState('');
  const [userPassword, setUserPassword] = useState('');

  const [permissionEmail, setPermissionEmail] = useState('');
  const [permissionCustomerId, setPermissionCustomerId] = useState(
    customers[0]?.id ?? '',
  );
  const [permissionRole, setPermissionRole] = useState('client');

  const [linksCustomerId, setLinksCustomerId] = useState(customers[0]?.id ?? '');
  const selectedLinksCustomer = useMemo(
    () => customers.find((customer) => customer.id === linksCustomerId) ?? null,
    [customers, linksCustomerId],
  );

  const [windowsUrl, setWindowsUrl] = useState(
    selectedLinksCustomer?.trmmWindowsAgentUrl ?? '',
  );
  const [linuxUrl, setLinuxUrl] = useState(
    selectedLinksCustomer?.trmmLinuxAgentUrl ?? '',
  );
  const [macosUrl, setMacosUrl] = useState(
    selectedLinksCustomer?.trmmMacosAgentUrl ?? '',
  );

  function syncDeploymentFields(customerId: string) {
    setLinksCustomerId(customerId);

    const customer = customers.find((item) => item.id === customerId);

    setWindowsUrl(customer?.trmmWindowsAgentUrl ?? '');
    setLinuxUrl(customer?.trmmLinuxAgentUrl ?? '');
    setMacosUrl(customer?.trmmMacosAgentUrl ?? '');
  }

  async function createCustomer(event: React.FormEvent<HTMLFormElement>) {
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
          name: customerName,
          notes: customerNotes,
        }),
      });

      const data = await parseApiResponse(response);

      if (!data.ok) {
        throw new Error(data.error ?? 'Erro ao criar cliente.');
      }

      setCustomerName('');
      setCustomerNotes('');
      setStatus({
        type: 'success',
        message: data.message ?? 'Cliente criado com sucesso.',
      });
      router.refresh();
    } catch (error) {
      setStatus({
        type: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Erro ao criar cliente.',
      });
    } finally {
      setIsCreatingCustomer(false);
    }
  }

  async function createUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      setIsCreatingUser(true);
      setStatus(null);

      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
        body: JSON.stringify({
          email: userEmail,
          password: userPassword,
        }),
      });

      const data = await parseApiResponse(response);

      if (!data.ok) {
        throw new Error(data.error ?? 'Erro ao criar usuário.');
      }

      setUserEmail('');
      setUserPassword('');
      setStatus({
        type: 'success',
        message: data.message ?? 'Usuário criado com sucesso.',
      });
      router.refresh();
    } catch (error) {
      setStatus({
        type: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Erro ao criar usuário.',
      });
    } finally {
      setIsCreatingUser(false);
    }
  }

  async function savePermission(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      setIsSavingPermission(true);
      setStatus(null);

      const response = await fetch('/api/admin/permissions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
        body: JSON.stringify({
          email: permissionEmail,
          customerId: permissionCustomerId,
          role: permissionRole,
        }),
      });

      const data = await parseApiResponse(response);

      if (!data.ok) {
        throw new Error(data.error ?? 'Erro ao salvar permissão.');
      }

      setStatus({
        type: 'success',
        message: data.message ?? 'Permissão salva com sucesso.',
      });
      router.refresh();
    } catch (error) {
      setStatus({
        type: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Erro ao salvar permissão.',
      });
    } finally {
      setIsSavingPermission(false);
    }
  }

  async function saveDeploymentLinks(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!linksCustomerId) {
      setStatus({
        type: 'error',
        message: 'Selecione um cliente para atualizar os links.',
      });
      return;
    }

    try {
      setIsSavingLinks(true);
      setStatus(null);

      const response = await fetch(
        `/api/admin/customers/${encodeURIComponent(
          linksCustomerId,
        )}/deployment-links`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          cache: 'no-store',
          body: JSON.stringify({
            trmmWindowsAgentUrl: windowsUrl,
            trmmLinuxAgentUrl: linuxUrl,
            trmmMacosAgentUrl: macosUrl,
          }),
        },
      );

      const data = await parseApiResponse(response);

      if (!data.ok) {
        throw new Error(data.error ?? 'Erro ao salvar links.');
      }

      setStatus({
        type: 'success',
        message: data.message ?? 'Links atualizados com sucesso.',
      });
      router.refresh();
    } catch (error) {
      setStatus({
        type: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Erro ao salvar links.',
      });
    } finally {
      setIsSavingLinks(false);
    }
  }

  return (
    <div className="space-y-6">
      <StatusMessage status={status} />

      <div className="grid gap-6 xl:grid-cols-2">
        <form
          onSubmit={createCustomer}
          className="rounded-2xl border border-surface-border bg-white p-5 shadow-sm"
        >
          <h3 className="section-title">Cadastrar cliente</h3>
          <p className="mt-2 text-sm text-slate-600">
            Crie clientes manualmente quando necessário. Clientes criados pelo
            sync do TRMM também aparecerão automaticamente aqui.
          </p>

          <div className="mt-5 space-y-4">
            <FieldLabel label="Nome do cliente">
              <input
                className={inputClassName}
                value={customerName}
                onChange={(event) => setCustomerName(event.target.value)}
                placeholder="Ex.: Cliente Demonstração"
                required
              />
            </FieldLabel>

            <FieldLabel label="Observações">
              <textarea
                className={inputClassName}
                value={customerNotes}
                onChange={(event) => setCustomerNotes(event.target.value)}
                placeholder="Observações internas da Safesys"
                rows={3}
              />
            </FieldLabel>

            <button
              type="submit"
              className={buttonClassName}
              disabled={isCreatingCustomer}
            >
              {isCreatingCustomer ? 'Criando...' : 'Criar cliente'}
            </button>
          </div>
        </form>

        <form
          onSubmit={createUser}
          className="rounded-2xl border border-surface-border bg-white p-5 shadow-sm"
        >
          <h3 className="section-title">Cadastrar usuário</h3>
          <p className="mt-2 text-sm text-slate-600">
            Crie um usuário de acesso ao portal. Depois vincule-o a um cliente
            na seção de permissões.
          </p>

          <div className="mt-5 space-y-4">
            <FieldLabel label="E-mail">
              <input
                className={inputClassName}
                type="email"
                value={userEmail}
                onChange={(event) => setUserEmail(event.target.value)}
                placeholder="usuario@cliente.com.br"
                required
              />
            </FieldLabel>

            <FieldLabel label="Senha temporária">
              <input
                className={inputClassName}
                type="password"
                value={userPassword}
                onChange={(event) => setUserPassword(event.target.value)}
                placeholder="Defina uma senha temporária"
                required
                minLength={8}
                autoComplete="new-password"
              />
            </FieldLabel>

            <button
              type="submit"
              className={buttonClassName}
              disabled={isCreatingUser}
            >
              {isCreatingUser ? 'Criando...' : 'Criar usuário'}
            </button>
          </div>
        </form>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <form
          onSubmit={savePermission}
          className="rounded-2xl border border-surface-border bg-white p-5 shadow-sm"
        >
          <h3 className="section-title">Permissões por cliente</h3>
          <p className="mt-2 text-sm text-slate-600">
            Vincule um usuário a um cliente e defina o papel de acesso.
          </p>

          <div className="mt-5 space-y-4">
            <FieldLabel label="E-mail do usuário">
              <input
                className={inputClassName}
                type="email"
                value={permissionEmail}
                onChange={(event) => setPermissionEmail(event.target.value)}
                placeholder="usuario@cliente.com.br"
                required
              />
            </FieldLabel>

            <FieldLabel label="Cliente">
              <select
                className={inputClassName}
                value={permissionCustomerId}
                onChange={(event) => setPermissionCustomerId(event.target.value)}
                required
              >
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                  </option>
                ))}
              </select>
            </FieldLabel>

            <FieldLabel label="Papel">
              <select
                className={inputClassName}
                value={permissionRole}
                onChange={(event) => setPermissionRole(event.target.value)}
              >
                <option value="client">Cliente</option>
                <option value="viewer">Leitura</option>
                <option value="admin">Admin Safesys</option>
              </select>
            </FieldLabel>

            <button
              type="submit"
              className={buttonClassName}
              disabled={isSavingPermission || customers.length === 0}
            >
              {isSavingPermission ? 'Salvando...' : 'Salvar permissão'}
            </button>
          </div>
        </form>

        <form
          onSubmit={saveDeploymentLinks}
          className="rounded-2xl border border-surface-border bg-white p-5 shadow-sm"
        >
          <h3 className="section-title">Instaladores TRMM</h3>
          <p className="mt-2 text-sm text-slate-600">
            Cadastre links de instalação do agente para disponibilizar ao
            cliente durante a POC.
          </p>

          <div className="mt-5 space-y-4">
            <FieldLabel label="Cliente">
              <select
                className={inputClassName}
                value={linksCustomerId}
                onChange={(event) => syncDeploymentFields(event.target.value)}
                required
              >
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                  </option>
                ))}
              </select>
            </FieldLabel>

            <FieldLabel label="Windows Agent URL">
              <input
                className={inputClassName}
                value={windowsUrl}
                onChange={(event) => setWindowsUrl(event.target.value)}
                placeholder="https://..."
              />
            </FieldLabel>

            <FieldLabel label="Linux Agent URL">
              <input
                className={inputClassName}
                value={linuxUrl}
                onChange={(event) => setLinuxUrl(event.target.value)}
                placeholder="https://..."
              />
            </FieldLabel>

            <FieldLabel label="macOS Agent URL">
              <input
                className={inputClassName}
                value={macosUrl}
                onChange={(event) => setMacosUrl(event.target.value)}
                placeholder="https://..."
              />
            </FieldLabel>

            <button
              type="submit"
              className={buttonClassName}
              disabled={isSavingLinks || customers.length === 0}
            >
              {isSavingLinks ? 'Salvando...' : 'Salvar links'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
