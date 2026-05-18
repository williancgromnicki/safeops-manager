'use client';

import { useEffect, useMemo, useState } from 'react';

type SoftwareCatalogItem = {
  key: string;
  label: string;
  category: string;
  attentionNote: string | null;
};

type CommandResult = {
  ok: boolean;
  status: number;
  output: string;
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
  install?: CommandResult;
  validation?: CommandResult | null;
  chocolatey?: {
    ok: boolean;
    installedNow: boolean;
    check?: CommandResult;
    install?: CommandResult;
    validation?: CommandResult;
  } | null;
};

type SoftwareInstallModalProps = {
  isOpen: boolean;
  onClose: () => void;
  deviceId: string;
  customerId: string;
  deviceName: string;
};

function summarizeOutput(output?: string | null): string | null {
  const value = output?.trim();

  if (!value) {
    return null;
  }

  const normalized = value
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-8)
    .join(' ');

  return normalized.length > 260
    ? `${normalized.slice(0, 260).trim()}...`
    : normalized;
}

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
    const details =
      summarizeOutput(data.validation?.output) ??
      summarizeOutput(data.install?.output) ??
      summarizeOutput(data.chocolatey?.validation?.output) ??
      summarizeOutput(data.chocolatey?.install?.output);

    return details
      ? `Falha ao instalar o software. Detalhes: ${details}`
      : 'Falha ao instalar o software.';
  }

  if (data.status === 'unknown') {
    const details =
      summarizeOutput(data.validation?.output) ??
      summarizeOutput(data.install?.output);

    return details
      ? `A instalação foi executada, mas o resultado não pôde ser confirmado. Detalhes: ${details}`
      : 'A instalação foi executada, mas o resultado não pôde ser confirmado.';
  }

  if (!data.ok) {
    const details =
      summarizeOutput(data.validation?.output) ??
      summarizeOutput(data.install?.output) ??
      summarizeOutput(data.chocolatey?.validation?.output) ??
      summarizeOutput(data.chocolatey?.install?.output);

    return details
      ? `Não foi possível instalar o software. Detalhes: ${details}`
      : 'Não foi possível instalar o software.';
  }

  return 'Operação finalizada.';
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
  const [message, setMessage] = useState<string | null>(null);
  const [messageType, setMessageType] = useState<
    'success' | 'warning' | 'error' | null
  >(null);

  const selectedItem = useMemo(
    () => softwareList.find((item) => item.key === selectedSoftware) ?? null,
    [softwareList, selectedSoftware],
  );

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

  async function handleInstall() {
    if (!selectedSoftware) {
      setMessage('Selecione um software para instalar.');
      setMessageType('warning');
      return;
    }

    try {
      setIsInstalling(true);
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
      const resultMessage = getStatusMessage(data);

      if (!response.ok || !data.ok) {
        setMessage(resultMessage);
        setMessageType(data.status === 'unknown' ? 'warning' : 'error');
        return;
      }

      setMessage(resultMessage);
      setMessageType(
        data.status === 'already_installed' || data.status === 'unknown'
          ? 'warning'
          : 'success',
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Erro ao instalar software.',
      );
      setMessageType('error');
    } finally {
      setIsInstalling(false);
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
              onClick={onClose}
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
            onClick={onClose}
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
