'use client';

import { useState } from 'react';

type RemoteAccessButtonProps = {
  deviceId: string;
  customerId: string;
};

type RemoteAccessResponse = {
  ok: boolean;
  url?: string;
  error?: string;
};

function RemoteIcon({ spinning = false }: { spinning?: boolean }) {
  return (
    <svg
      className={`h-4 w-4 ${spinning ? 'animate-spin' : ''}`}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M4 5.75A1.75 1.75 0 0 1 5.75 4h12.5A1.75 1.75 0 0 1 20 5.75v8.5A1.75 1.75 0 0 1 18.25 16H5.75A1.75 1.75 0 0 1 4 14.25v-8.5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9 20h6M12 16v4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9.5 10.5h5M12 8l2.5 2.5L12 13"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return 'Não foi possível iniciar o acesso remoto.';
}

export function RemoteAccessButton({
  deviceId,
  customerId,
}: RemoteAccessButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleRemoteAccess() {
    try {
      setIsLoading(true);
      setMessage(null);

      const response = await fetch(
        `/api/devices/${encodeURIComponent(
          deviceId,
        )}/remote?customerId=${encodeURIComponent(customerId)}`,
        {
          method: 'POST',
          cache: 'no-store',
        },
      );

      const data = (await response.json()) as RemoteAccessResponse;

      if (!response.ok || !data.ok || !data.url) {
        throw new Error(
          data.error ?? 'Acesso remoto ainda não configurado para este agente.',
        );
      }

      window.open(data.url, '_blank', 'noopener,noreferrer');
    } catch (error: unknown) {
      setMessage(getErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleRemoteAccess}
        disabled={isLoading}
        className="inline-flex items-center justify-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm font-semibold text-brand-800 transition hover:bg-brand-100 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <RemoteIcon spinning={isLoading} />
        {isLoading ? 'Abrindo...' : 'Acesso remoto'}
      </button>

      {message && <p className="max-w-xs text-xs text-red-600">{message}</p>}
    </div>
  );
}
