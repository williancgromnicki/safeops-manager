'use client';

import { useEffect, useMemo, useState } from 'react';

type RemoteBackgroundWorkspaceProps = {
  deviceId: string;
  customerId: string;
  deviceName: string;
};

type RemoteBackgroundResponse = {
  ok: boolean;
  url?: string;
  error?: string;
  mesh?: {
    hostname?: string | null;
    status?: string | null;
    client?: string | null;
    site?: string | null;
    mode?: string | null;
    viewmode?: number | null;
  };
};

type RemoteTab =
  | 'terminal'
  | 'files'
  | 'services'
  | 'processes'
  | 'eventlog'
  | 'registry';

const tabs: Array<{
  key: RemoteTab;
  label: string;
  description: string;
}> = [
  {
    key: 'terminal',
    label: 'Terminal',
    description: 'Sessão de terminal remoto via MeshCentral.',
  },
  {
    key: 'files',
    label: 'File Browser',
    description: 'Navegação de arquivos do dispositivo.',
  },
  {
    key: 'services',
    label: 'Services',
    description: 'Serviços do Windows e respectivos estados.',
  },
  {
    key: 'processes',
    label: 'Processes',
    description: 'Processos em execução no endpoint.',
  },
  {
    key: 'eventlog',
    label: 'Event Log',
    description: 'Eventos do Windows coletados via TRMM API.',
  },
  {
    key: 'registry',
    label: 'Registry',
    description: 'Consulta controlada ao Registro do Windows.',
  },
];

function getStatusLabel(status?: string | null) {
  if (!status) return 'Status desconhecido';

  if (status.toLowerCase() === 'online') {
    return 'Online';
  }

  if (status.toLowerCase() === 'offline') {
    return 'Offline';
  }

  return status;
}

function getStatusClassName(status?: string | null) {
  if (status?.toLowerCase() === 'online') {
    return 'bg-emerald-50 text-emerald-700 ring-emerald-600/20';
  }

  if (status?.toLowerCase() === 'offline') {
    return 'bg-rose-50 text-rose-700 ring-rose-600/20';
  }

  return 'bg-slate-50 text-slate-700 ring-slate-600/20';
}

function PlaceholderPanel({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex min-h-[420px] items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
      <div className="max-w-md">
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-700">
          Em desenvolvimento
        </p>

        <h3 className="mt-2 text-lg font-semibold text-slate-900">{title}</h3>

        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          {description}
        </p>

        <p className="mt-4 text-xs leading-relaxed text-slate-500">
          Esta aba será reconstruída dentro do SafeOps Manager usando endpoints
          internos que consomem a API oficial do TRMM. Nenhuma sessão web do TRMM
          será exigida do usuário final.
        </p>
      </div>
    </div>
  );
}

export function RemoteBackgroundWorkspace({
  deviceId,
  customerId,
  deviceName,
}: RemoteBackgroundWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<RemoteTab>('terminal');
  const [terminalUrl, setTerminalUrl] = useState<string | null>(null);
  const [meshStatus, setMeshStatus] = useState<string | null>(null);
  const [isLoadingTerminal, setIsLoadingTerminal] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const activeTabDescription = useMemo(
    () => tabs.find((tab) => tab.key === activeTab)?.description ?? '',
    [activeTab],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadTerminalSession() {
      try {
        setIsLoadingTerminal(true);
        setMessage(null);

        const response = await fetch(
          `/api/devices/${encodeURIComponent(
            deviceId,
          )}/remote-background?customerId=${encodeURIComponent(customerId)}`,
          {
            method: 'POST',
            cache: 'no-store',
          },
        );

        const data = (await response.json()) as RemoteBackgroundResponse;

        if (!response.ok || !data.ok || !data.url) {
          throw new Error(
            data.error ??
              'Não foi possível abrir a sessão Remote Background.',
          );
        }

        if (!cancelled) {
          setTerminalUrl(data.url);
          setMeshStatus(data.mesh?.status ?? null);
        }
      } catch (error) {
        if (!cancelled) {
          setMessage(
            error instanceof Error
              ? error.message
              : 'Erro ao abrir Remote Background.',
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoadingTerminal(false);
        }
      }
    }

    loadTerminalSession();

    return () => {
      cancelled = true;
    };
  }, [customerId, deviceId]);

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-surface-border bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">
              Remote Background
            </p>

            <h2 className="mt-1 text-xl font-semibold text-slate-950">
              {deviceName}
            </h2>

            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
              Console operacional remoto reconstruído dentro do SafeOps Manager.
              A aba Terminal usa uma URL temporária do MeshCentral gerada pelo
              backend via API oficial do TRMM.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span
              className={[
                'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset',
                getStatusClassName(meshStatus),
              ].join(' ')}
            >
              {getStatusLabel(meshStatus)}
            </span>

            <button
              type="button"
              onClick={() => {
                setTerminalUrl(null);
                setMeshStatus(null);
                setMessage(null);

                void (async () => {
                  try {
                    setIsLoadingTerminal(true);

                    const response = await fetch(
                      `/api/devices/${encodeURIComponent(
                        deviceId,
                      )}/remote-background?customerId=${encodeURIComponent(
                        customerId,
                      )}`,
                      {
                        method: 'POST',
                        cache: 'no-store',
                      },
                    );

                    const data =
                      (await response.json()) as RemoteBackgroundResponse;

                    if (!response.ok || !data.ok || !data.url) {
                      throw new Error(
                        data.error ??
                          'Não foi possível renovar a sessão Remote Background.',
                      );
                    }

                    setTerminalUrl(data.url);
                    setMeshStatus(data.mesh?.status ?? null);
                  } catch (error) {
                    setMessage(
                      error instanceof Error
                        ? error.message
                        : 'Erro ao renovar sessão Remote Background.',
                    );
                  } finally {
                    setIsLoadingTerminal(false);
                  }
                })();
              }}
              disabled={isLoadingTerminal}
              className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoadingTerminal ? 'Renovando...' : 'Renovar sessão'}
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-surface-border bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 pt-4">
          <div className="flex gap-2 overflow-x-auto">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.key;

              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={[
                    'whitespace-nowrap rounded-t-xl px-4 py-3 text-sm font-semibold transition',
                    isActive
                      ? 'bg-brand-50 text-brand-800'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
                  ].join(' ')}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="border-b border-slate-100 px-5 py-3">
          <p className="text-sm text-slate-600">{activeTabDescription}</p>
        </div>

        <div className="p-5">
          {message ? (
            <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              {message}
            </div>
          ) : null}

          {activeTab === 'terminal' ? (
            <div className="overflow-hidden rounded-2xl border border-slate-300 bg-slate-950">
              {isLoadingTerminal ? (
                <div className="flex min-h-[620px] items-center justify-center p-8 text-center">
                  <div>
                    <p className="text-sm font-semibold text-white">
                      Abrindo sessão de terminal...
                    </p>
                    <p className="mt-2 text-xs text-slate-300">
                      Gerando URL temporária do MeshCentral via API oficial.
                    </p>
                  </div>
                </div>
              ) : terminalUrl ? (
                <iframe
                  title={`Remote Background Terminal - ${deviceName}`}
                  src={terminalUrl}
                  className="h-[720px] w-full bg-white"
                  allow="clipboard-read; clipboard-write; fullscreen"
                />
              ) : (
                <div className="flex min-h-[620px] items-center justify-center p-8 text-center">
                  <div>
                    <p className="text-sm font-semibold text-white">
                      Sessão não iniciada
                    </p>
                    <p className="mt-2 text-xs text-slate-300">
                      Clique em “Renovar sessão” para tentar novamente.
                    </p>
                  </div>
                </div>
              )}
            </div>
          ) : null}

          {activeTab === 'files' ? (
            <PlaceholderPanel
              title="File Browser"
              description="Próxima fase: listar diretórios e arquivos com controle de permissão, trilha de auditoria e ações seguras."
            />
          ) : null}

          {activeTab === 'services' ? (
            <PlaceholderPanel
              title="Services"
              description="Próxima fase: listar serviços do Windows e permitir ações controladas como iniciar, parar ou reiniciar serviços."
            />
          ) : null}

          {activeTab === 'processes' ? (
            <PlaceholderPanel
              title="Processes"
              description="Próxima fase: listar processos em execução e permitir ações administrativas controladas."
            />
          ) : null}

          {activeTab === 'eventlog' ? (
            <PlaceholderPanel
              title="Event Log"
              description="Próxima fase: consultar eventos do Windows com filtros por log, severidade, origem e período."
            />
          ) : null}

          {activeTab === 'registry' ? (
            <PlaceholderPanel
              title="Registry"
              description="Próxima fase: navegação controlada do Registro do Windows, com foco em consulta e auditoria."
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
