'use client';

import type { FormEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

type RemoteScript = {
  id: string;
  customer_id: string | null;
  scope: 'safesys' | 'customer';
  name: string;
  description: string | null;
  shell: 'powershell' | 'cmd' | 'bash';
  script_body: string;
  status: 'approved' | 'pending_review' | 'disabled';
  created_by_email: string | null;
  created_at: string;
  updated_at: string | null;
};

type ScriptsApiResponse = {
  ok: boolean;
  error?: string;
  message?: string;
  scripts?: RemoteScript[];
};

type StatusMessage = {
  type: 'success' | 'error';
  message: string;
} | null;

type RemoteScriptsPanelProps = {
  customerId: string;
  customerName: string;
  role: string;
};

const inputClassName =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20';

const primaryButtonClassName =
  'inline-flex items-center justify-center rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-60';

const secondaryButtonClassName =
  'inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60';

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

function statusLabel(status: RemoteScript['status']): string {
  const labels: Record<RemoteScript['status'], string> = {
    approved: 'Aprovado',
    pending_review: 'Pendente de revisão',
    disabled: 'Desativado',
  };

  return labels[status] ?? status;
}

function statusClassName(status: RemoteScript['status']): string {
  if (status === 'approved') {
    return 'bg-emerald-50 text-emerald-700 ring-emerald-600/20';
  }

  if (status === 'pending_review') {
    return 'bg-amber-50 text-amber-700 ring-amber-600/20';
  }

  return 'bg-slate-50 text-slate-700 ring-slate-600/20';
}

function scopeLabel(scope: RemoteScript['scope']): string {
  return scope === 'safesys' ? 'Biblioteca Safesys' : 'Script do cliente';
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

async function parseApiResponse(response: Response): Promise<ScriptsApiResponse> {
  const data = (await response.json().catch(() => null)) as
    | ScriptsApiResponse
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

export function RemoteScriptsPanel({
  customerId,
  customerName,
  role,
}: RemoteScriptsPanelProps) {
  const router = useRouter();

  const [scripts, setScripts] = useState<RemoteScript[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [status, setStatus] = useState<StatusMessage>(null);

  const [scriptName, setScriptName] = useState('');
  const [scriptDescription, setScriptDescription] = useState('');
  const [scriptShell, setScriptShell] =
    useState<RemoteScript['shell']>('powershell');
  const [scriptBody, setScriptBody] = useState('');
  const [createAsSafesys, setCreateAsSafesys] = useState(false);

  const isAdmin = role.toLowerCase() === 'admin';

  const approvedScripts = useMemo(
    () => scripts.filter((script) => script.status === 'approved'),
    [scripts],
  );

  const pendingScripts = useMemo(
    () => scripts.filter((script) => script.status === 'pending_review'),
    [scripts],
  );

  async function loadScripts() {
    try {
      setIsLoading(true);

      const response = await fetch(
        `/api/admin/scripts?customerId=${encodeURIComponent(customerId)}`,
        {
          method: 'GET',
          cache: 'no-store',
        },
      );

      const data = await parseApiResponse(response);

      if (!data.ok) {
        throw new Error(data.error ?? 'Erro ao carregar scripts.');
      }

      setScripts(data.scripts ?? []);
    } catch (error) {
      setStatus({
        type: 'error',
        message:
          error instanceof Error ? error.message : 'Erro ao carregar scripts.',
      });
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadScripts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  async function handleCreateScript(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const name = scriptName.trim();
    const body = scriptBody.trim();

    if (!name || !body) {
      setStatus({
        type: 'error',
        message: 'Informe nome e conteúdo do script.',
      });
      return;
    }

    try {
      setIsCreating(true);
      setStatus(null);

      const response = await fetch('/api/admin/scripts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
        body: JSON.stringify({
          customerId,
          name,
          description: scriptDescription,
          shell: scriptShell,
          scriptBody: body,
          scope: createAsSafesys && isAdmin ? 'safesys' : 'customer',
        }),
      });

      const data = await parseApiResponse(response);

      if (!data.ok) {
        throw new Error(data.error ?? 'Erro ao cadastrar script.');
      }

      setStatus({
        type: 'success',
        message: data.message ?? 'Script cadastrado com sucesso.',
      });

      setScriptName('');
      setScriptDescription('');
      setScriptShell('powershell');
      setScriptBody('');
      setCreateAsSafesys(false);

      await loadScripts();
      router.refresh();
    } catch (error) {
      setStatus({
        type: 'error',
        message:
          error instanceof Error ? error.message : 'Erro ao cadastrar script.',
      });
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <div className="space-y-6">
      <StatusAlert status={status} />

      <div className="rounded-2xl border border-surface-border bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="section-title">Scripts remotos</h2>
            <p className="mt-2 text-sm text-slate-600">
              Biblioteca de scripts aprovados e scripts próprios do cliente{' '}
              <span className="font-semibold text-slate-800">{customerName}</span>.
              Este primeiro pacote prepara o catálogo. A execução remota será
              ativada no próximo pacote.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl border border-brand-100 bg-brand-50 px-4 py-3 text-brand-900">
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">
                Aprovados
              </p>
              <p className="mt-1 text-2xl font-bold">{approvedScripts.length}</p>
            </div>

            <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-amber-900">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                Pendentes
              </p>
              <p className="mt-1 text-2xl font-bold">{pendingScripts.length}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)]">
        <form
          onSubmit={handleCreateScript}
          className="rounded-2xl border border-surface-border bg-white p-5 shadow-sm"
        >
          <h3 className="section-title">Cadastrar script</h3>

          <div className="mt-5 space-y-4">
            <FieldLabel label="Nome do script">
              <input
                className={inputClassName}
                value={scriptName}
                onChange={(event) => setScriptName(event.target.value)}
                placeholder="Ex: Limpeza de arquivos temporários"
                required
              />
            </FieldLabel>

            <FieldLabel label="Descrição">
              <textarea
                className={inputClassName}
                value={scriptDescription}
                onChange={(event) => setScriptDescription(event.target.value)}
                rows={3}
                placeholder="Explique o objetivo do script e quando ele deve ser usado."
              />
            </FieldLabel>

            <FieldLabel label="Tipo">
              <select
                className={inputClassName}
                value={scriptShell}
                onChange={(event) =>
                  setScriptShell(event.target.value as RemoteScript['shell'])
                }
              >
                <option value="powershell">PowerShell</option>
                <option value="cmd">CMD/BAT</option>
                <option value="bash">Bash</option>
              </select>
            </FieldLabel>

            <FieldLabel label="Conteúdo do script">
              <textarea
                className={`${inputClassName} font-mono`}
                value={scriptBody}
                onChange={(event) => setScriptBody(event.target.value)}
                rows={12}
                placeholder="$ErrorActionPreference = 'Stop'&#10;Write-Output 'Hello SafeOps'"
                required
              />
            </FieldLabel>

            {isAdmin ? (
              <label className="flex items-start gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={createAsSafesys}
                  onChange={(event) => setCreateAsSafesys(event.target.checked)}
                  className="mt-1"
                />
                <span>
                  Cadastrar como script aprovado da biblioteca Safesys
                </span>
              </label>
            ) : null}

            <button
              type="submit"
              className={primaryButtonClassName}
              disabled={isCreating}
            >
              {isCreating ? 'Salvando...' : 'Salvar script'}
            </button>
          </div>
        </form>

        <div className="rounded-2xl border border-surface-border bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="section-title">Biblioteca de scripts</h3>
              <p className="mt-1 text-sm text-slate-600">
                Scripts aprovados da Safesys e scripts cadastrados para este cliente.
              </p>
            </div>

            <button
              type="button"
              onClick={loadScripts}
              className={secondaryButtonClassName}
              disabled={isLoading}
            >
              {isLoading ? 'Atualizando...' : 'Atualizar lista'}
            </button>
          </div>

          <div className="mt-5 overflow-hidden rounded-xl border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Script
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Origem
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Tipo
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Status
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Ações
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100 bg-white">
                {isLoading ? (
                  <tr>
                    <td className="px-4 py-6 text-slate-500" colSpan={5}>
                      Carregando scripts...
                    </td>
                  </tr>
                ) : scripts.length === 0 ? (
                  <tr>
                    <td className="px-4 py-6 text-slate-500" colSpan={5}>
                      Nenhum script cadastrado.
                    </td>
                  </tr>
                ) : (
                  scripts.map((script) => (
                    <tr key={script.id}>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-brand-900">
                          {script.name}
                        </p>
                        <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                          {script.description ?? 'Sem descrição.'}
                        </p>
                        <p className="mt-1 text-xs text-slate-400">
                          Criado em {formatDate(script.created_at)}
                        </p>
                      </td>

                      <td className="px-4 py-3 text-slate-700">
                        {scopeLabel(script.scope)}
                      </td>

                      <td className="px-4 py-3 text-slate-700">
                        {script.shell}
                      </td>

                      <td className="px-4 py-3">
                        <span
                          className={[
                            'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset',
                            statusClassName(script.status),
                          ].join(' ')}
                        >
                          {statusLabel(script.status)}
                        </span>
                      </td>

                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          disabled
                          className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-400"
                          title="Execução será habilitada no próximo pacote"
                        >
                          Executar em breve
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
