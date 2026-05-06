'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

type ManagedUser = {
  id: string;
  email: string;
  fullName: string | null;
  portalRole: string;
  customerRole: string;
  mustChangePassword: boolean;
  disabledAt: string | null;
  createdAt: string;
};

type AdminUsersPanelProps = {
  customerId: string;
  customerName: string;
  currentUserRole: string;
};

type UsersApiResponse = {
  ok: boolean;
  error?: string;
  message?: string;
  managerRole?: string;
  users?: ManagedUser[];
};

type StatusMessage = {
  type: 'success' | 'error';
  message: string;
} | null;

const inputClassName =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20';

const buttonClassName =
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

function roleLabel(role: string): string {
  const normalized = role.toLowerCase();

  const labels: Record<string, string> = {
    admin: 'Admin Safesys',
    client: 'TI do cliente',
    viewer: 'Leitura',
  };

  return labels[normalized] ?? role;
}

function formatDate(value?: string | null): string {
  if (!value) {
    return '—';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString('pt-BR');
}

function createRandomTemporaryPassword(): string {
  const random = Math.random().toString(36).slice(2, 10);
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();

  return `SafeOps@${random}${suffix}`;
}

async function parseApiResponse(response: Response): Promise<UsersApiResponse> {
  const data = (await response.json().catch(() => null)) as UsersApiResponse | null;

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

export function AdminUsersPanel({
  customerId,
  customerName,
  currentUserRole,
}: AdminUsersPanelProps) {
  const router = useRouter();

  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [managerRole, setManagerRole] = useState(currentUserRole);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [resettingUserId, setResettingUserId] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusMessage>(null);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [temporaryPassword, setTemporaryPassword] = useState(
    createRandomTemporaryPassword(),
  );
  const [role, setRole] = useState('viewer');
  const [mustChangePassword, setMustChangePassword] = useState(true);

  const [selectedUserId, setSelectedUserId] = useState('');
  const [newPassword, setNewPassword] = useState(createRandomTemporaryPassword());
  const [resetMustChangePassword, setResetMustChangePassword] = useState(true);

  const canCreateAdmin = managerRole === 'admin';

  const roleOptions = useMemo(() => {
    if (canCreateAdmin) {
      return [
        { value: 'admin', label: 'Admin Safesys' },
        { value: 'client', label: 'TI do cliente' },
        { value: 'viewer', label: 'Leitura' },
      ];
    }

    return [
      { value: 'client', label: 'TI do cliente' },
      { value: 'viewer', label: 'Leitura' },
    ];
  }, [canCreateAdmin]);

  async function loadUsers() {
    try {
      setIsLoading(true);
      setStatus(null);

      const response = await fetch(
        `/api/admin/users?customerId=${encodeURIComponent(customerId)}`,
        {
          method: 'GET',
          cache: 'no-store',
        },
      );

      const data = await parseApiResponse(response);

      if (!data.ok) {
        throw new Error(data.error ?? 'Erro ao carregar usuários.');
      }

      setUsers(data.users ?? []);
      setManagerRole(data.managerRole ?? currentUserRole);
    } catch (error) {
      setStatus({
        type: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Erro ao carregar usuários.',
      });
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  async function handleCreateUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      setIsCreating(true);
      setStatus(null);

      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
        body: JSON.stringify({
          customerId,
          fullName,
          email,
          password: temporaryPassword,
          role,
          mustChangePassword,
        }),
      });

      const data = await parseApiResponse(response);

      if (!data.ok) {
        throw new Error(data.error ?? 'Erro ao criar usuário.');
      }

      setStatus({
        type: 'success',
        message: data.message ?? 'Usuário criado com sucesso.',
      });

      setFullName('');
      setEmail('');
      setTemporaryPassword(createRandomTemporaryPassword());
      setRole('viewer');
      setMustChangePassword(true);

      await loadUsers();
      router.refresh();
    } catch (error) {
      setStatus({
        type: 'error',
        message:
          error instanceof Error ? error.message : 'Erro ao criar usuário.',
      });
    } finally {
      setIsCreating(false);
    }
  }

  async function handleResetPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedUserId) {
      setStatus({
        type: 'error',
        message: 'Selecione um usuário para resetar a senha.',
      });
      return;
    }

    try {
      setResettingUserId(selectedUserId);
      setStatus(null);

      const response = await fetch(
        `/api/admin/users/${encodeURIComponent(selectedUserId)}/password`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          cache: 'no-store',
          body: JSON.stringify({
            customerId,
            password: newPassword,
            mustChangePassword: resetMustChangePassword,
          }),
        },
      );

      const data = await parseApiResponse(response);

      if (!data.ok) {
        throw new Error(data.error ?? 'Erro ao resetar senha.');
      }

      setStatus({
        type: 'success',
        message: data.message ?? 'Senha resetada com sucesso.',
      });

      setNewPassword(createRandomTemporaryPassword());
      setResetMustChangePassword(true);

      await loadUsers();
      router.refresh();
    } catch (error) {
      setStatus({
        type: 'error',
        message:
          error instanceof Error ? error.message : 'Erro ao resetar senha.',
      });
    } finally {
      setResettingUserId(null);
    }
  }

  return (
    <div className="space-y-6">
      <StatusAlert status={status} />

      <div className="rounded-2xl border border-surface-border bg-white p-5 shadow-sm">
        <div>
          <h2 className="section-title">Usuários e permissões</h2>
          <p className="mt-2 text-sm text-slate-600">
            Gerencie usuários de acesso ao SafeOps para o cliente{' '}
            <span className="font-semibold text-slate-800">
              {customerName}
            </span>
            .
          </p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <form
          onSubmit={handleCreateUser}
          className="rounded-2xl border border-surface-border bg-white p-5 shadow-sm"
        >
          <h3 className="section-title">Criar usuário</h3>
          <p className="mt-2 text-sm text-slate-600">
            Crie um novo acesso e vincule automaticamente ao cliente ativo.
          </p>

          <div className="mt-5 space-y-4">
            <FieldLabel label="Nome">
              <input
                className={inputClassName}
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                placeholder="Nome do usuário"
              />
            </FieldLabel>

            <FieldLabel label="E-mail">
              <input
                className={inputClassName}
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="usuario@empresa.com.br"
                required
              />
            </FieldLabel>

            <FieldLabel label="Senha temporária">
              <div className="flex gap-2">
                <input
                  className={inputClassName}
                  type="text"
                  value={temporaryPassword}
                  onChange={(event) =>
                    setTemporaryPassword(event.target.value)
                  }
                  required
                  minLength={8}
                />

                <button
                  type="button"
                  onClick={() =>
                    setTemporaryPassword(createRandomTemporaryPassword())
                  }
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
                >
                  Gerar
                </button>
              </div>
            </FieldLabel>

            <FieldLabel label="Papel">
              <select
                className={inputClassName}
                value={role}
                onChange={(event) => setRole(event.target.value)}
              >
                {roleOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </FieldLabel>

            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={mustChangePassword}
                onChange={(event) =>
                  setMustChangePassword(event.target.checked)
                }
                className="mt-1"
              />
              <span>Exigir troca de senha no próximo login</span>
            </label>

            <button
              type="submit"
              className={buttonClassName}
              disabled={isCreating}
            >
              {isCreating ? 'Criando...' : 'Criar usuário'}
            </button>
          </div>
        </form>

        <form
          onSubmit={handleResetPassword}
          className="rounded-2xl border border-surface-border bg-white p-5 shadow-sm"
        >
          <h3 className="section-title">Resetar senha</h3>
          <p className="mt-2 text-sm text-slate-600">
            Defina uma nova senha temporária sem depender do fluxo de reset por
            e-mail do Supabase.
          </p>

          <div className="mt-5 space-y-4">
            <FieldLabel label="Usuário">
              <select
                className={inputClassName}
                value={selectedUserId}
                onChange={(event) => setSelectedUserId(event.target.value)}
                required
              >
                <option value="">Selecione...</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.email}
                  </option>
                ))}
              </select>
            </FieldLabel>

            <FieldLabel label="Nova senha temporária">
              <div className="flex gap-2">
                <input
                  className={inputClassName}
                  type="text"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  required
                  minLength={8}
                />

                <button
                  type="button"
                  onClick={() => setNewPassword(createRandomTemporaryPassword())}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
                >
                  Gerar
                </button>
              </div>
            </FieldLabel>

            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={resetMustChangePassword}
                onChange={(event) =>
                  setResetMustChangePassword(event.target.checked)
                }
                className="mt-1"
              />
              <span>Exigir troca de senha no próximo login</span>
            </label>

            <button
              type="submit"
              className={buttonClassName}
              disabled={Boolean(resettingUserId)}
            >
              {resettingUserId ? 'Resetando...' : 'Resetar senha'}
            </button>
          </div>
        </form>
      </div>

      <div className="rounded-2xl border border-surface-border bg-white p-5 shadow-sm">
        <h3 className="section-title">Usuários vinculados</h3>

        <div className="mt-5 overflow-x-auto">
          {isLoading ? (
            <p className="text-sm text-slate-500">Carregando usuários...</p>
          ) : users.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">
              Nenhum usuário vinculado a este cliente.
            </p>
          ) : (
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Usuário</th>
                  <th className="px-4 py-3">Papel</th>
                  <th className="px-4 py-3">Trocar senha</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Criado em</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {users.map((user) => (
                  <tr key={user.id} className="align-top text-slate-700">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">
                        {user.fullName || user.email}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {user.email}
                      </p>
                    </td>

                    <td className="px-4 py-3">
                      {roleLabel(user.customerRole)}
                    </td>

                    <td className="px-4 py-3">
                      {user.mustChangePassword ? (
                        <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 ring-1 ring-amber-600/20">
                          Sim
                        </span>
                      ) : (
                        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-600/20">
                          Não
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-3">
                      {user.disabledAt ? (
                        <span className="rounded-full bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700 ring-1 ring-rose-600/20">
                          Desativado
                        </span>
                      ) : (
                        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-600/20">
                          Ativo
                        </span>
                      )}
                    </td>

                    <td className="whitespace-nowrap px-4 py-3">
                      {formatDate(user.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
