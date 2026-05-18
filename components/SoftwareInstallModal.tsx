'use client';

import { useEffect, useMemo, useState } from 'react';

type SoftwareCatalogItem = {
  key: string;
  label: string;
  category: string;
  attentionNote: string | null;
};

type SoftwareInstallResponse = {
  ok: boolean;
  status?: 'success' | 'already_installed' | 'failed' | 'unknown';
  job_id?: string;
  error?: string;
  software?: {
    key: string;
    label: string;
    packageName: string;
  };
};

type SoftwareInstallModalProps = {
  isOpen: boolean;
  onClose: () => void;
  deviceId: string;
  customerId: string;
  deviceName: string;
};

type ProgressStage = {
  threshold: number;
  label: string;
  description: string;
};

const INSTALL_PROGRESS_STAGES: ProgressStage[] = [
  {
    threshold: 10,
    label: 'Iniciando solicitação',
    description: 'Enviando a tarefa de instalação para o agente SafeOps.',
  },
  {
    threshold: 25,
    label: 'Validando pré-requisitos',
    description: 'Verificando Chocolatey e preparando o ambiente do dispositivo.',
  },
  {
    threshold: 45,
    label: 'Executando instalação',
    description: 'O pacote está sendo baixado e instalado no dispositivo remoto.',
  },
  {
    threshold: 70,
    label: 'Aguardando conclusão',
    description: 'Alguns instaladores podem levar alguns minutos para finalizar.',
  },
  {
    threshold: 90,
    label: 'Validando resultado',
    description: 'Conferindo se o software foi instalado corretamente.',
  },
];

function getStatusMessage(data: SoftwareInstallResponse): string {
  if (!data.ok && data.error) {
    return data.error;
  }

  if (data.status === 'success') {
    return 'Software instalado com sucesso.';
  }

  if (data.status === 'already_installed') {
    return 'Este software já estava instalado neste dispositivo.';
  }

  if (data.status === 'failed') {
    return 'Falha ao instalar o software.';
  }

  if (data.status === 'unknown') {
    return 'A instalação foi executada, mas o resultado não pôde ser confirmado.';
  }

  return 'Operação finalizada.';
}

function getProgressStage(progress: number): ProgressStage {
  const current = INSTALL_PROGRESS_STAGES
    .filter((stage) => progress >= stage.threshold)
    .at(-1);

  return current ?? INSTALL_PROGRESS_STAGES[0];
}

function getProgressHint(progress: number): string {
  if (progress < 35) {
    return 'Não feche esta janela enquanto a preparação está em andamento.';
  }

  if (progress < 75) {
    return 'A instalação está em execução no dispositivo remoto. O tempo varia conforme internet e pacote.';
  }

  return 'Estamos aguardando o retorno do agente para confirmar o resultado.';
}

export function SoftwareInstallModal({
  isOpen,
  onClose,
  deviceId,
  customerId,
  deviceName,
}: SoftwareInstallModalProps) {
  const [softwareList, setSoftwareList] = useState<SoftwareCatalogItem[]>([]);
  const [selectedSoftware, setSelectedSoftware] = useState('');
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [installProgress, setInstallProgress] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [messageType, setMessageType] = useState<
    'success' | 'warning' | 'error' | null
  >(null);

  const selectedItem = useMemo(
    () => softwareList.find((item) => item.key === selectedSoftware) ?? null,
    [softwareList, selectedSoftware],
  );

  const progressStage = getProgressStage(installProgress);

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;

    async function loadCatalog() {
      try {
        setIsLoadingCatalog(true);
        setMessage(null);
        setMessageType(null);

        const response = await fetch(
          '/api/integrations/tactical/software/catalog',
          {
            method: 'GET',
            cache: 'no-store',
          },
        );

        const data = await response.json();

        if (!response.ok || !data.ok) {
          throw new Error(
            data.error ?? 'Não foi possível carregar a lista de softwares.',
          );
        }

        if (!cancelled) {
          const items = Array.isArray(data.software)
            ? (data.software as SoftwareCatalogItem[])
            : [];

          setSoftwareList(items);

          if (items.length > 0) {
            setSelectedSoftware((current) => current || items[0].key);
          }
        }
      } catch (error) {
        if (!cancelled) {
          setMessage(
            error instanceof Error
              ? error.message
              : 'Erro ao carregar softwares.',
          );
          setMessageType('error');
        }
      } finally {
        if (!cancelled) {
          setIsLoadingCatalog(false);
        }
      }
    }

    loadCatalog();

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isInstalling) {
      return;
    }

    setInstallProgress(8);

    const interval = window.setInterval(() => {
      setInstallProgress((current) => {
        if (current < 30) {
          return Math.min(current + 4, 30);
        }

        if (current < 60) {
          return Math.min(current + 3, 60);
        }

        if (current < 85) {
          return Math.min(current + 1, 85);
        }

        return current;
      });
    }, 900);

    return () => {
      window.clearInterval(interval);
    };
  }, [isInstalling]);

  function resetInstallState() {
    setInstallProgress(0);
    setMessage(null);
    setMessageType(null);
  }

  async function handleInstall() {
    if (!selectedSoftware) {
      setMessage('Selecione um software para instalar.');
      setMessageType('warning');
      return;
    }

    try {
      setIsInstalling(true);
      setInstallProgress(5);
      setMessage(null);
      setMessageType(null);

      const response = await fetch(
        `/api/devices/${encodeURIComponent(
          deviceId,
        )}/software/install?customerId=${encodeURIComponent(customerId)}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          cache: 'no-store',
          body: JSON.stringify({
            software: selectedSoftware,
          }),
        },
      );

      const data = (await response.json()) as SoftwareInstallResponse;

      if (!response.ok || !data.ok) {
        throw new Error(data.error ?? 'Não foi possível instalar o software.');
      }

      const resultMessage = getStatusMessage(data);

      setInstallProgress(100);
      setMessage(resultMessage);
      setMessageType(
        data.status === 'already_installed' || data.status === 'unknown'
          ? 'warning'
          : 'success',
      );
    } catch (error) {
      setInstallProgress(100);
      setMessage(
        error instanceof Error
          ? error.message
          : 'Erro ao instalar software.',
      );
      setMessageType('error');
    } finally {
      window.setTimeout(() => {
        setIsInstalling(false);
      }, 350);
    }
  }

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 py-6">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="border-b border-slate-100 px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                Instalar software
              </h3>

              <p className="mt-1 text-sm text-slate-600">
                Dispositivo: <span className="font-medium">{deviceName}</span>
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                if (!isInstalling) {
                  resetInstallState();
                  onClose();
                }
              }}
              disabled={isInstalling}
              className="rounded-lg px-2 py-1 text-sm font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              aria-label="Fechar modal"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="space-y-4 px-5 py-5">
          <div>
            <label
              htmlFor="software-select"
              className="text-sm font-semibold text-slate-800"
            >
              Software
            </label>

            <select
              id="software-select"
              value={selectedSoftware}
              onChange={(event) => {
                setSelectedSoftware(event.target.value);
                setMessage(null);
                setMessageType(null);
                setInstallProgress(0);
              }}
              disabled={isLoadingCatalog || isInstalling}
              className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500"
            >
              {isLoadingCatalog ? (
                <option>Carregando softwares...</option>
              ) : null}

              {!isLoadingCatalog && softwareList.length === 0 ? (
                <option>Nenhum software disponível</option>
              ) : null}

              {softwareList.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label} — {item.category}
                </option>
              ))}
            </select>
          </div>

          {selectedItem?.attentionNote ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {selectedItem.attentionNote}
            </div>
          ) : null}

          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-600">
            A instalação será executada pelo agente SafeOps em contexto
            operacional controlado. Apenas softwares aprovados na whitelist da
            Safesys podem ser enviados por esta tela.
          </div>

          {isInstalling ? (
            <div className="rounded-xl border border-brand-100 bg-brand-50/60 px-4 py-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-brand-900">
                    {progressStage.label}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600">
                    {progressStage.description}
                  </p>
                </div>

                <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-brand-800 ring-1 ring-brand-200">
                  {installProgress}%
                </span>
              </div>

              <div className="mt-4 h-2 overflow-hidden rounded-full bg-white ring-1 ring-brand-100">
                <div
                  className="h-full rounded-full bg-brand-700 transition-all duration-500 ease-out"
                  style={{ width: `${installProgress}%` }}
                />
              </div>

              <p className="mt-3 text-xs leading-relaxed text-slate-500">
                {getProgressHint(installProgress)}
              </p>
            </div>
          ) : null}

          {message ? (
            <div
              className={[
                'rounded-xl border px-4 py-3 text-sm',
                messageType === 'success'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : null,
                messageType === 'warning'
                  ? 'border-amber-200 bg-amber-50 text-amber-800'
                  : null,
                messageType === 'error'
                  ? 'border-rose-200 bg-rose-50 text-rose-800'
                  : null,
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {message}
            </div>
          ) : null}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 bg-slate-50 px-5 py-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={() => {
              resetInstallState();
              onClose();
            }}
            disabled={isInstalling}
            className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Fechar
          </button>

          <button
            type="button"
            onClick={handleInstall}
            disabled={isLoadingCatalog || isInstalling || !selectedSoftware}
            className="inline-flex items-center justify-center rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isInstalling ? 'Instalando...' : 'Instalar software'}
          </button>
        </div>
      </div>
    </div>
  );
}
