'use client';

import type { FormEvent, ReactNode } from 'react';
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

const secondaryButtonClassName =
  'inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60';

const dangerButtonClassName =
  'inline-flex items-center justify-center rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 shadow-sm transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60';

function FieldLabel({ label, children }: { label: string; children: ReactNode }) {
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
  if (!status) return null;

  const className =
    status.type === 'success'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
      : 'border-rose-200 bg-rose-50 text-rose-800';

  return <div className={`rounded-lg border px-4 py-3 text-sm ${className}`}>{status.message}</div>;
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
  if (!value) return '—';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString('pt-BR');
}

function createRandomTemporaryPassword(): string {
  const random = Math.random().toString(36).slice(2, 10);
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();

  return `SafeOps@${random}${suffix}`;
}

async function parseApiResponse(response: Response): Promise<UsersApiResponse> {
  const data = (await response.json().catch(() => null)) as UsersApiResponse | null;

  if (!data) return { ok: false, error: 'Resposta inválida da API.' };
  if (!response.ok) return { ok: false, error: data.error ?? 'Erro ao executar operação.' };

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
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusMessage>(null);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [temporaryPassword, setTemporaryPassword] = useState(createRandomTemporaryPassword());
  const [role, setRole] = useState('viewer');
  const [mustChangePassword, setMustChangePassword] = useState(true);

  const [selectedUserId, setSelectedUserId] = useState('');
  const [newPassword, setNewPassword] = useState(createRandomTemporaryPassword());
  const [resetMustChangePassword, setResetMustChangePassword] = useState(true);

  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [editFullName, setEditFullName] = useState('');
  const [editRole, setEditRole] = useState('viewer');
  const [editMustChangePassword, setEditMustChangePassword] = useState(false);
  const [editDisabled, setEditDisabled] = useState(false);

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
        { method: 'GET', cache: 'no-store' },
      );

      const data = await parseApiResponse(response);
      if (!data.ok) throw new Error(data.error ?? 'Erro ao carregar usuários.');

      setUsers(data.users ?? []);
      setManagerRole(data.managerRole ?? currentUserRole);
    } catch (error) {
      setStatus({
        type: 'error',
        message: error instanceof Error ? error.message : 'Erro ao carregar usuários.',
      });
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  async function handleCreateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      setIsCreating(true);
      setStatus(null);

      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      if (!data.ok) throw new Error(data.error ?? 'Erro ao criar usuário.');

      setStatus({ type: 'success', message: data.message ?? 'Usuário criado com sucesso.' });
      setFullName('');
      setEmail('');
      setTemporaryPassword(createRandomTemporaryPassword());
      setRole('viewer');
      setMustChangePassword(true);

      await loadUsers();
      router.refresh();
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Erro ao criar usuário.' });
    } finally {
      setIsCreating(false);
    }
  }

  async function handleResetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedUserId) {
      setStatus({ type: 'error', message: 'Selecione um usuário para resetar a senha.' });
      return;
    }

    try {
      setResettingUserId(selectedUserId);
      setStatus(null);

      const response = await fetch(
        `/api/admin/users/${encodeURIComponent(selectedUserId)}/password`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          cache: 'no-store',
          body: JSON.stringify({
            customerId,
            password: newPassword,
            mustChangePassword: resetMustChangePassword,
          }),
        },
      );

      const data = await parseApiResponse(response);
      if (!data.ok) throw new Error(data.error ?? 'Erro ao resetar senha.');

      setStatus({ type: 'success', message: data.message ?? 'Senha resetada com sucesso.' });
      setNewPassword(createRandomTemporaryPassword());
      setResetMustChangePassword(true);

      await loadUsers();
      router.refresh();
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Erro ao resetar senha.' });
    } finally {
      setResettingUserId(null);
    }
  }

  function startEditingUser(user: ManagedUser) {
    setEditingUser(user);
    setEditFullName(user.fullName ?? '');
    setEditRole(user.customerRole || 'viewer');
    setEditMustChangePassword(Boolean(user.mustChangePassword));
    setEditDisabled(Boolean(user.disabledAt));
    setStatus(null);
  }

  function cancelEditingUser() {
    setEditingUser(null);
    setEditFullName('');
    setEditRole('viewer');
    setEditMustChangePassword(false);
    setEditDisabled(false);
  }

  async function handleUpdateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingUser) return;

    try {
      setUpdatingUserId(editingUser.id);
      setStatus(null);

      const response = await fetch(`/api/admin/users/${encodeURIComponent(editingUser.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({
          customerId,
          fullName: editFullName,
          role: editRole,
          mustChangePassword: editMustChangePassword,
          disabled: editDisabled,
        }),
      });

      const data = await parseApiResponse(response);
      if (!data.ok) throw new Error(data.error ?? 'Erro ao atualizar usuário.');

      setStatus({ type: 'success', message: data.message ?? 'Usuário atualizado com sucesso.' });
      cancelEditingUser();
      await loadUsers();
      router.refresh();
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Erro ao atualizar usuário.' });
    } finally {
      setUpdatingUserId(null);
    }
  }

  async function handleRemoveUser(user: ManagedUser) {
    const confirmed = window.confirm(`Remover o acesso de ${user.email} ao cliente ${customerName}?`);
    if (!confirmed) return;

    try {
      setRemovingUserId(user.id);
      setStatus(null);

      const response = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ customerId }),
      });

      const data = await parseApiResponse(response);
      if (!data.ok) throw new Error(data.error ?? 'Erro ao remover usuário.');

      setStatus({ type: 'success', message: data.message ?? 'Usuário removido com sucesso.' });
      if (editingUser?.id === user.id) cancelEditingUser();
      if (selectedUserId === user.id) setSelectedUserId('');

      await loadUsers();
      router.refresh();
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Erro ao remover usuário.' });
    } finally {
      setRemovingUserId(null);
    }
  }

  return (
    <div className="space-y-6">
      <StatusAlert status={status} />

      <div className="rounded-2xl border border-surface-border bg-white p-5 shadow-sm">
        <h2 className="section-title">Usuários e permissões</h2>
        <p className="mt-2 text-sm text-slate-600">
          Gerencie usuários de acesso ao SafeOps para o cliente{' '}
          <span className="font-semibold text-slate-800">{customerName}</span>.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <form onSubmit={handleCreateUser} className="rounded-2xl border border-surface-border bg-white p-5 shadow-sm">
          <h3 className="section-title">Criar usuário</h3>
          <p className="mt-2 text-sm text-slate-600">Crie um novo acesso e vincule automaticamente ao cliente ativo.</p>

          <div className="mt-5 space-y-4">
            <FieldLabel label="Nome">
              <input className={inputClassName} value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Nome do usuário" />
            </FieldLabel>

            <FieldLabel label="E-mail">
              <input className={inputClassName} type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="usuario@empresa.com.br" required />
            </FieldLabel>

            <FieldLabel label="Senha temporária">
              <div className="flex gap-2">
                <input className={inputClassName} type="text" value={temporaryPassword} onChange={(event) => setTemporaryPassword(event.target.value)} required minLength={8} />
                <button type="button" onClick={() => setTemporaryPassword(createRandomTemporaryPassword())} className={secondaryButtonClassName}>Gerar</button>
              </div>
            </FieldLabel>

            <FieldLabel label="Papel">
              <select className={inputClassName} value={role} onChange={(event) => setRole(event.target.value)}>
                {roleOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </FieldLabel>

            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={mustChangePassword} onChange={(event) => setMustChangePassword(event.target.checked)} className="mt-1" />
              <span>Exigir troca de senha no próximo login</span>
            </label>

            <button type="submit" className={buttonClassName} disabled={isCreating}>{isCreating ? 'Criando...' : 'Criar usuário'}</button>
          </div>
        </form>

        <form onSubmit={handleResetPassword} className="rounded-2xl border border-surface-border bg-white p-5 shadow-sm">
          <h3 className="section-title">Resetar senha</h3>
          <p className="mt-2 text-sm text-slate-600">Defina uma nova senha temporária sem depender do fluxo de reset por e-mail do Supabase.</p>

          <div className="mt-5 space-y-4">
            <FieldLabel label="Usuário">
              <select className={inputClassName} value={selectedUserId} onChange={(event) => setSelectedUserId(event.target.value)} required>
                <option value="">Selecione...</option>
                {users.map((user) => <option key={user.id} value={user.id}>{user.email}</option>)}
              </select>
            </FieldLabel>

            <FieldLabel label="Nova senha temporária">
              <div className="flex gap-2">
                <input className={inputClassName} type="text" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required minLength={8} />
                <button type="button" onClick={() => setNewPassword(createRandomTemporaryPassword())} className={secondaryButtonClassName}>Gerar</button>
              </div>
            </FieldLabel>

            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={resetMustChangePassword} onChange={(event) => setResetMustChangePassword(event.target.checked)} className="mt-1" />
              <span>Exigir troca de senha no próximo login</span>
            </label>

            <button type="submit" className={buttonClassName} disabled={Boolean(resettingUserId)}>{resettingUserId ? 'Resetando...' : 'Resetar senha'}</button>
          </div>
        </form>
      </div>

      {editingUser ? (
        <form onSubmit={handleUpdateUser} className="rounded-2xl border border-brand-100 bg-brand-50/50 p-5 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="section-title">Editar usuário</h3>
              <p className="mt-2 text-sm text-slate-600">Editando permissões e status de <span className="font-semibold text-slate-900">{editingUser.email}</span>.</p>
            </div>
            <button type="button" onClick={cancelEditingUser} className={secondaryButtonClassName} disabled={Boolean(updatingUserId)}>Cancelar</button>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <FieldLabel label="Nome">
              <input className={inputClassName} value={editFullName} onChange={(event) => setEditFullName(event.target.value)} placeholder="Nome do usuário" />
            </FieldLabel>

            <FieldLabel label="Papel no cliente">
              <select className={inputClassName} value={editRole} onChange={(event) => setEditRole(event.target.value)}>
                {roleOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </FieldLabel>

            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={editMustChangePassword} onChange={(event) => setEditMustChangePassword(event.target.checked)} className="mt-1" />
              <span>Exigir troca de senha no próximo login</span>
            </label>

            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={editDisabled} onChange={(event) => setEditDisabled(event.target.checked)} className="mt-1" />
              <span>Desativar acesso do usuário ao portal</span>
            </label>
          </div>

          <div className="mt-5">
            <button type="submit" className={buttonClassName} disabled={Boolean(updatingUserId)}>{updatingUserId ? 'Salvando...' : 'Salvar alterações'}</button>
          </div>
        </form>
      ) : null}

      <div className="rounded-2xl border border-surface-border bg-white p-5 shadow-sm">
        <h3 className="section-title">Usuários vinculados</h3>

        <div className="mt-5 overflow-x-auto">
          {isLoading ? (
            <p className="text-sm text-slate-500">Carregando usuários...</p>
          ) : users.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">Nenhum usuário vinculado a este cliente.</p>
          ) : (
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Usuário</th>
                  <th className="px-4 py-3">Papel</th>
                  <th className="px-4 py-3">Trocar senha</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Criado em</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {users.map((user) => (
                  <tr key={user.id} className="align-top text-slate-700">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{user.fullName || user.email}</p>
                      <p className="mt-1 text-xs text-slate-500">{user.email}</p>
                    </td>
                    <td className="px-4 py-3">{roleLabel(user.customerRole)}</td>
                    <td className="px-4 py-3">
                      {user.mustChangePassword ? <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 ring-1 ring-amber-600/20">Sim</span> : <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-600/20">Não</span>}
                    </td>
                    <td className="px-4 py-3">
                      {user.disabledAt ? <span className="rounded-full bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700 ring-1 ring-rose-600/20">Desativado</span> : <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-600/20">Ativo</span>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">{formatDate(user.createdAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap justify-end gap-2">
                        <button type="button" className={secondaryButtonClassName} onClick={() => startEditingUser(user)} disabled={Boolean(updatingUserId) || Boolean(removingUserId)}>Editar</button>
                        <button type="button" className={dangerButtonClassName} onClick={() => handleRemoveUser(user)} disabled={removingUserId === user.id || Boolean(updatingUserId)}>{removingUserId === user.id ? 'Removendo...' : 'Remover'}</button>
                      </div>
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
