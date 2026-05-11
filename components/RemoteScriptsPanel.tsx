'use client';

import type { FormEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

type LibraryScript = {
  source: 'library';
  id: number;
  name: string;
  description?: string | null;
  script_type?: string | null;
  shell?: string | null;
  category?: string | null;
  default_timeout?: number | null;
  filename?: string | null;
  hidden?: boolean;
  supported_platforms?: string[];
  run_as_user?: boolean;
  args?: unknown[];
};

type LocalScript = {
  source: 'local';
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

type UnifiedScript = LibraryScript | LocalScript;

type Device = {
  id: string;
  name: string;
  site: string;
  status: string;
};

type ApiResponse = {
  ok: boolean;
  error?: string;
  message?: string;
  scripts?: Omit<LibraryScript, 'source'>[];
  result?: {
    stdout?: string;
    stderr?: string;
    retcode?: number;
    execution_time?: number;
  };
};

type LocalScriptsApiResponse = {
  ok: boolean;
  error?: string;
  message?: string;
  scripts?: Omit<LocalScript, 'source'>[];
};

type DevicesApiResponse = {
  ok: boolean;
  error?: string;
  devices?: Device[];
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

function formatPlatforms(platforms?: string[]): string {
  if (!platforms?.length) {
    return 'All';
  }

  return platforms.join(', ');
}

function cleanShell(shell?: string | null): string {
  return shell?.trim() || 'powershell';
}

function scriptKey(script: UnifiedScript): string {
  return `${script.source}:${script.id}`;
}

function getScriptSourceLabel(script: UnifiedScript): string {
  if (script.source === 'library') {
    if (script.script_type === 'builtin') {
      return 'Nativo';
    }

    if (script.script_type === 'userdefined') {
      return 'Personalizado';
    }

    return 'Biblioteca';
  }

  return script.scope === 'safesys' ? 'Local Safesys' : 'Local cliente';
}

function getScriptTimeout(script: UnifiedScript): number {
  if (script.source === 'library') {
    return script.default_timeout ?? 90;
  }

  return 90;
}

function getScriptCategory(script: UnifiedScript): string {
  if (script.source === 'library') {
    return script.category ?? 'Sem categoria';
  }

  return script.scope === 'safesys' ? 'SafeOps local' : 'Cliente local';
}

function getScriptDescription(script: UnifiedScript): string {
  return script.description ?? 'Sem descrição.';
}

function getScriptPlatforms(script: UnifiedScript): string {
  if (script.source === 'library') {
    return formatPlatforms(script.supported_platforms);
  }

  return 'All';
}

function canExecuteScript(script: UnifiedScript, isAdmin: boolean): boolean {
  if (script.source === 'library') {
    return true;
  }

  return script.status === 'approved' || isAdmin;
}

async function parseApiResponse(response: Response): Promise<ApiResponse> {
  const data = (await response.json().catch(() => null)) as ApiResponse | null;

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

async function parseLocalScriptsResponse(
  response: Response,
): Promise<LocalScriptsApiResponse> {
  const data = (await response.json().catch(() => null)) as
    | LocalScriptsApiResponse
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

async function parseDevicesResponse(response: Response): Promise<DevicesApiResponse> {
  const data = (await response.json().catch(() => null)) as DevicesApiResponse | null;

  if (!data) {
    return {
      ok: false,
      error: 'Resposta inválida da API.',
      devices: [],
    };
  }

  if (!response.ok || !data.ok) {
    return {
      ok: false,
      error: data.error ?? 'Erro ao carregar dispositivos.',
      devices: [],
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

  const [libraryScripts, setLibraryScripts] = useState<LibraryScript[]>([]);
  const [localScripts, setLocalScripts] = useState<LocalScript[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(true);
  const [isLoadingLocalScripts, setIsLoadingLocalScripts] = useState(true);
  const [isLoadingDevices, setIsLoadingDevices] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [status, setStatus] = useState<StatusMessage>(null);
  const [executionResult, setExecutionResult] = useState<{
    stdout?: string;
    stderr?: string;
    retcode?: number;
    execution_time?: number;
  } | null>(null);

  const [scriptSearch, setScriptSearch] = useState('');
  const [selectedScriptKey, setSelectedScriptKey] = useState('');
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [runAsUser, setRunAsUser] = useState(false);
  const [timeout, setTimeoutValue] = useState(90);

  const [scriptName, setScriptName] = useState('');
  const [scriptDescription, setScriptDescription] = useState('');
  const [scriptShell, setScriptShell] = useState<LocalScript['shell']>('powershell');
  const [scriptBody, setScriptBody] = useState('');
  const [createAsSafesys, setCreateAsSafesys] = useState(false);

  const isAdmin = role.toLowerCase() === 'admin';

  const unifiedScripts = useMemo<UnifiedScript[]>(() => {
    return [...libraryScripts, ...localScripts];
  }, [libraryScripts, localScripts]);

  const filteredScripts = useMemo(() => {
    const query = scriptSearch.trim().toLowerCase();

    const filtered = unifiedScripts.filter((script) => {
      if (!query) {
        return true;
      }

      return [
        script.name,
        getScriptDescription(script),
        getScriptCategory(script),
        getScriptSourceLabel(script),
        cleanShell(script.shell),
        getScriptPlatforms(script),
      ]
        .join(' ')
        .toLowerCase()
        .includes(query);
    });

    return filtered.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [scriptSearch, unifiedScripts]);

  const selectedScript = useMemo(() => {
    return unifiedScripts.find((script) => scriptKey(script) === selectedScriptKey) ?? null;
  }, [selectedScriptKey, unifiedScripts]);

  const selectedDevice = useMemo(() => {
    return devices.find((device) => device.id === selectedDeviceId) ?? null;
  }, [devices, selectedDeviceId]);

  async function loadLibraryScripts() {
    try {
      setIsLoadingLibrary(true);

      const response = await fetch(
        `/api/admin/scripts/trmm?customerId=${encodeURIComponent(customerId)}`,
        {
          method: 'GET',
          cache: 'no-store',
        },
      );

      const data = await parseApiResponse(response);

      if (!data.ok) {
        throw new Error(data.error ?? 'Erro ao carregar biblioteca.');
      }

      const scripts = (data.scripts ?? []).map((script) => ({
        ...script,
        source: 'library' as const,
      }));

      setLibraryScripts(scripts);
    } catch (error) {
      setStatus({
        type: 'error',
        message:
          error instanceof Error ? error.message : 'Erro ao carregar biblioteca.',
      });
    } finally {
      setIsLoadingLibrary(false);
    }
  }

  async function loadLocalScripts() {
    try {
      setIsLoadingLocalScripts(true);

      const response = await fetch(
        `/api/admin/scripts?customerId=${encodeURIComponent(customerId)}`,
        {
          method: 'GET',
          cache: 'no-store',
        },
      );

      const data = await parseLocalScriptsResponse(response);

      if (!data.ok) {
        throw new Error(data.error ?? 'Erro ao carregar scripts locais.');
      }

      const scripts = (data.scripts ?? []).map((script) => ({
        ...script,
        source: 'local' as const,
      }));

      setLocalScripts(scripts);
    } catch (error) {
      setStatus({
        type: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Erro ao carregar scripts locais.',
      });
    } finally {
      setIsLoadingLocalScripts(false);
    }
  }

  async function loadDevices() {
    try {
      setIsLoadingDevices(true);

      const response = await fetch(
        `/api/admin/devices?customerId=${encodeURIComponent(customerId)}`,
        {
          method: 'GET',
          cache: 'no-store',
        },
      );

      const data = await parseDevicesResponse(response);

      if (!data.ok) {
        throw new Error(data.error ?? 'Erro ao carregar dispositivos.');
      }

      const nextDevices = data.devices ?? [];
      setDevices(nextDevices);

      if (!selectedDeviceId && nextDevices.length > 0) {
        setSelectedDeviceId(nextDevices[0].id);
      }
    } catch (error) {
      setStatus({
        type: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Erro ao carregar dispositivos.',
      });
    } finally {
      setIsLoadingDevices(false);
    }
  }

  useEffect(() => {
    loadLibraryScripts();
    loadLocalScripts();
    loadDevices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  useEffect(() => {
    if (!selectedScriptKey && filteredScripts.length > 0) {
      setSelectedScriptKey(scriptKey(filteredScripts[0]));
    }
  }, [filteredScripts, selectedScriptKey]);

  useEffect(() => {
    if (selectedScript) {
      setTimeoutValue(getScriptTimeout(selectedScript));
      setRunAsUser(
        selectedScript.source === 'library' && selectedScript.run_as_user === true,
      );
    }
  }, [selectedScript]);

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

      const data = await parseLocalScriptsResponse(response);

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

      await loadLocalScripts();
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

  async function handleExecuteScript(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedScript || !selectedDevice) {
      setStatus({
        type: 'error',
        message: 'Selecione um script e um dispositivo.',
      });
      return;
    }

    if (!canExecuteScript(selectedScript, isAdmin)) {
      setStatus({
        type: 'error',
        message: 'Este script ainda não está aprovado para execução.',
      });
      return;
    }

    try {
      setIsExecuting(true);
      setStatus(null);
      setExecutionResult(null);

      const response = await fetch('/api/admin/scripts/trmm/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
        body: JSON.stringify({
          customerId,
          deviceId: selectedDevice.id,
          scriptSource: selectedScript.source,
          scriptId: selectedScript.id,
          scriptName: selectedScript.name,
          shell: cleanShell(selectedScript.shell),
          timeout,
          runAsUser,
        }),
      });

      const data = await parseApiResponse(response);

      if (!data.ok) {
        throw new Error(data.error ?? 'Erro ao executar script.');
      }

      setExecutionResult(data.result ?? null);
      setStatus({
        type: data.result?.retcode === 0 ? 'success' : 'error',
        message: data.message ?? 'Script executado.',
      });

      router.refresh();
    } catch (error) {
      setStatus({
        type: 'error',
        message:
          error instanceof Error ? error.message : 'Erro ao executar script.',
      });
    } finally {
      setIsExecuting(false);
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
              Execute scripts da biblioteca e scripts locais em dispositivos do cliente{' '}
              <span className="font-semibold text-slate-800">{customerName}</span>.
              Nesta etapa, a execução é liberada em um dispositivo por vez.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3 text-sm">
            <div className="rounded-xl border border-brand-100 bg-brand-50 px-4 py-3 text-brand-900">
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">
                Biblioteca
              </p>
              <p className="mt-1 text-2xl font-bold">{libraryScripts.length}</p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                Locais
              </p>
              <p className="mt-1 text-2xl font-bold">{localScripts.length}</p>
            </div>

            <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-emerald-900">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                Devices
              </p>
              <p className="mt-1 text-2xl font-bold">{devices.length}</p>
            </div>
          </div>
        </div>
      </div>

      <form
        onSubmit={handleExecuteScript}
        className="rounded-2xl border border-surface-border bg-white p-5 shadow-sm"
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="section-title">Executar script</h3>
            <p className="mt-1 text-sm text-slate-600">
              Selecione um script da biblioteca ou um script local aprovado e execute em um agente.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              loadLibraryScripts();
              loadLocalScripts();
              loadDevices();
            }}
            className={secondaryButtonClassName}
          >
            Atualizar biblioteca
          </button>
        </div>

        <div className="mt-5 grid gap-4 xl:grid-cols-2">
          <FieldLabel label="Buscar script">
            <input
              className={inputClassName}
              value={scriptSearch}
              onChange={(event) => setScriptSearch(event.target.value)}
              placeholder="Buscar por nome, categoria, shell, plataforma..."
            />
          </FieldLabel>

          <FieldLabel label="Script">
            <select
              className={inputClassName}
              value={selectedScriptKey}
              onChange={(event) => setSelectedScriptKey(event.target.value)}
              disabled={isLoadingLibrary || isLoadingLocalScripts}
              required
            >
              {filteredScripts.map((script) => (
                <option key={scriptKey(script)} value={scriptKey(script)}>
                  {script.name} — {getScriptCategory(script)}
                </option>
              ))}
            </select>
          </FieldLabel>

          <FieldLabel label="Dispositivo">
            <select
              className={inputClassName}
              value={selectedDeviceId}
              onChange={(event) => setSelectedDeviceId(event.target.value)}
              disabled={isLoadingDevices}
              required
            >
              {devices.map((device) => (
                <option key={device.id} value={device.id}>
                  {device.name} — {device.site}
                </option>
              ))}
            </select>
          </FieldLabel>

          <div className="grid gap-4 sm:grid-cols-2">
            <FieldLabel label="Timeout">
              <input
                type="number"
                min={5}
                max={3600}
                className={inputClassName}
                value={timeout}
                onChange={(event) => setTimeoutValue(Number(event.target.value))}
                required
              />
            </FieldLabel>

            <FieldLabel label="Executar como">
              <select
                className={inputClassName}
                value={runAsUser ? 'user' : 'system'}
                onChange={(event) => setRunAsUser(event.target.value === 'user')}
              >
                <option value="system">SYSTEM</option>
                <option value="user">Usuário logado</option>
              </select>
            </FieldLabel>
          </div>
        </div>

        {selectedScript ? (
          <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="font-semibold text-brand-900">{selectedScript.name}</p>
                <p className="mt-1">{getScriptDescription(selectedScript)}</p>
              </div>

              <span className="inline-flex w-fit items-center rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
                {getScriptSourceLabel(selectedScript)}
              </span>
            </div>

            <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-6">
              <p>
                <span className="font-semibold text-slate-800">ID:</span>{' '}
                {selectedScript.id}
              </p>
              <p>
                <span className="font-semibold text-slate-800">Shell:</span>{' '}
                {cleanShell(selectedScript.shell)}
              </p>
              <p>
                <span className="font-semibold text-slate-800">Plataformas:</span>{' '}
                {getScriptPlatforms(selectedScript)}
              </p>
              <p>
                <span className="font-semibold text-slate-800">Categoria:</span>{' '}
                {getScriptCategory(selectedScript)}
              </p>
              <p>
                <span className="font-semibold text-slate-800">Timeout:</span>{' '}
                {getScriptTimeout(selectedScript)}s
              </p>
              <p>
                <span className="font-semibold text-slate-800">Default args:</span>{' '}
                {selectedScript.source === 'library' && selectedScript.args?.length
                  ? JSON.stringify(selectedScript.args)
                  : '—'}
              </p>
            </div>

            {!canExecuteScript(selectedScript, isAdmin) ? (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                Este script local ainda está pendente de revisão e não pode ser executado por usuários do cliente.
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="mt-5 flex justify-end">
          <button
            type="submit"
            className={primaryButtonClassName}
            disabled={
              isExecuting ||
              isLoadingLibrary ||
              isLoadingLocalScripts ||
              isLoadingDevices ||
              !selectedScriptKey ||
              !selectedDeviceId ||
              (selectedScript ? !canExecuteScript(selectedScript, isAdmin) : true)
            }
          >
            {isExecuting ? 'Executando...' : 'Executar script'}
          </button>
        </div>
      </form>

      {executionResult ? (
        <div className="rounded-2xl border border-surface-border bg-white p-5 shadow-sm">
          <h3 className="section-title">Resultado da última execução</h3>

          <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Retcode
              </p>
              <p className="mt-1 text-xl font-bold text-slate-900">
                {executionResult.retcode ?? '—'}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Tempo
              </p>
              <p className="mt-1 text-xl font-bold text-slate-900">
                {executionResult.execution_time ?? '—'}s
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Status
              </p>
              <p className="mt-1 text-xl font-bold text-slate-900">
                {executionResult.retcode === 0 ? 'Sucesso' : 'Falha'}
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                STDOUT
              </p>
              <pre className="mt-2 max-h-96 overflow-auto rounded-xl bg-slate-950 p-4 text-xs text-slate-100">
                {executionResult.stdout || 'Sem saída.'}
              </pre>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                STDERR
              </p>
              <pre className="mt-2 max-h-96 overflow-auto rounded-xl bg-slate-950 p-4 text-xs text-rose-100">
                {executionResult.stderr || 'Sem erros.'}
              </pre>
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)]">
        <form
          onSubmit={handleCreateScript}
          className="rounded-2xl border border-surface-border bg-white p-5 shadow-sm"
        >
          <h3 className="section-title">Cadastrar script local</h3>

          <p className="mt-2 text-sm text-slate-600">
            Scripts locais ficam registrados no SafeOps para revisão e também aparecem no mesmo campo de busca dos scripts.
          </p>

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
                  setScriptShell(event.target.value as LocalScript['shell'])
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
                <span>Cadastrar como script aprovado da biblioteca Safesys</span>
              </label>
            ) : null}

            <button
              type="submit"
              className={secondaryButtonClassName}
              disabled={isCreating}
            >
              {isCreating ? 'Salvando...' : 'Salvar script local'}
            </button>
          </div>
        </form>

        <div className="rounded-2xl border border-surface-border bg-white p-5 shadow-sm">
          <h3 className="section-title">Scripts cadastrados localmente</h3>
          <p className="mt-1 text-sm text-slate-600">
            Scripts locais ficam disponíveis no campo principal de busca.
          </p>

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
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100 bg-white">
                {isLoadingLocalScripts ? (
                  <tr>
                    <td className="px-4 py-6 text-slate-500" colSpan={4}>
                      Carregando scripts...
                    </td>
                  </tr>
                ) : localScripts.length === 0 ? (
                  <tr>
                    <td className="px-4 py-6 text-slate-500" colSpan={4}>
                      Nenhum script local cadastrado.
                    </td>
                  </tr>
                ) : (
                  localScripts.map((script) => (
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
                        {getScriptSourceLabel(script)}
                      </td>

                      <td className="px-4 py-3 text-slate-700">
                        {script.shell}
                      </td>

                      <td className="px-4 py-3 text-slate-700">
                        {script.status === 'approved'
                          ? 'Aprovado'
                          : script.status === 'pending_review'
                            ? 'Pendente'
                            : 'Desativado'}
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
