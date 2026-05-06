'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { SoftwareInstallModal } from '@/components/SoftwareInstallModal';

type DeviceActionsMenuProps = {
  deviceId: string;
  customerId: string;
  deviceName: string;
  hardwareInventoryHref: string;
  softwareInventoryHref: string;
};

type RemoteActionResponse = {
  ok: boolean;
  url?: string;
  error?: string;
};

function GearIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2.06 2.06 0 0 1-2.91 2.91l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21a2.06 2.06 0 0 1-4.12 0v-.09A1.7 1.7 0 0 0 8 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06a2.06 2.06 0 0 1-2.91-2.91l.06-.06A1.7 1.7 0 0 0 3.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H1.8a2.06 2.06 0 0 1 0-4.12h.09A1.7 1.7 0 0 0 3.6 8a1.7 1.7 0 0 0-.34-1.88l-.06-.06a2.06 2.06 0 0 1 2.91-2.91l.06.06A1.7 1.7 0 0 0 8 3.6a1.7 1.7 0 0 0 1-.6A1.7 1.7 0 0 0 9.4 1.9V1.8a2.06 2.06 0 0 1 4.12 0v.09A1.7 1.7 0 0 0 15 3.6a1.7 1.7 0 0 0 1.88-.34l.06-.06a2.06 2.06 0 0 1 2.91 2.91l-.06.06A1.7 1.7 0 0 0 19.4 8c.28.38.64.6 1 .6h.1a2.06 2.06 0 0 1 0 4.12h-.09a1.7 1.7 0 0 0-1.01.6Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

async function parseRemoteResponse(
  response: Response,
): Promise<RemoteActionResponse> {
  const contentType = response.headers.get('content-type') ?? '';
  const text = await response.text();

  if (!contentType.includes('application/json')) {
    return {
      ok: false,
      error: 'A API retornou uma resposta inválida.',
    };
  }

  try {
    return JSON.parse(text) as RemoteActionResponse;
  } catch {
    return {
      ok: false,
      error: 'Resposta inválida da API.',
    };
  }
}

export function DeviceActionsMenu({
  deviceId,
  customerId,
  hardwareInventoryHref,
  softwareInventoryHref,
}: DeviceActionsMenuProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isOpeningRemote, setIsOpeningRemote] = useState(false);
  const [isOpeningBackground, setIsOpeningBackground] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  async function openRemoteUrl(endpoint: string, type: 'remote' | 'background') {
    try {
      setMessage(null);

      if (type === 'remote') {
        setIsOpeningRemote(true);
      } else {
        setIsOpeningBackground(true);
      }

      const response = await fetch(
        `${endpoint}?customerId=${encodeURIComponent(customerId)}`,
        {
          method: 'POST',
          cache: 'no-store',
        },
      );

      const data = await parseRemoteResponse(response);

      if (!response.ok || !data.ok || !data.url) {
        throw new Error(
          data.error ?? 'Não foi possível abrir a ação solicitada.',
        );
      }

      window.open(data.url, '_blank', 'noopener,noreferrer');
      setIsOpen(false);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Não foi possível abrir a ação solicitada.',
      );
    } finally {
      setIsOpeningRemote(false);
      setIsOpeningBackground(false);
    }
  }

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50"
      >
        <GearIcon />
        Ações
      </button>

      {isOpen ? (
        <div className="absolute right-0 z-30 mt-2 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-semibold text-slate-900">
              Ações do dispositivo
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Operações, acesso remoto e inventários.
            </p>
          </div>

          <div className="p-2">
            <button
              type="button"
              onClick={() =>
                openRemoteUrl(
                  `/api/devices/${encodeURIComponent(deviceId)}/remote`,
                  'remote',
                )
              }
              disabled={isOpeningRemote || isOpeningBackground}
              className="flex w-full items-center rounded-lg px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-brand-50 hover:text-brand-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isOpeningRemote ? 'Abrindo acesso remoto...' : 'Acesso remoto'}
            </button>

            <button
              type="button"
              onClick={() =>
                openRemoteUrl(
                  `/api/devices/${encodeURIComponent(
                    deviceId,
                  )}/remote-background`,
                  'background',
                )
              }
              disabled={isOpeningRemote || isOpeningBackground}
              className="flex w-full items-center rounded-lg px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-brand-50 hover:text-brand-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isOpeningBackground
                ? 'Abrindo Remote Background...'
                : 'Remote Background'}
            </button>

            <div className="my-2 border-t border-slate-100" />

            <Link
              href={hardwareInventoryHref}
              onClick={() => setIsOpen(false)}
              className="flex w-full items-center rounded-lg px-3 py-2 text-sm text-slate-700 transition hover:bg-brand-50 hover:text-brand-800"
            >
              Inventário de hardware
            </Link>

            <Link
              href={softwareInventoryHref}
              onClick={() => setIsOpen(false)}
              className="flex w-full items-center rounded-lg px-3 py-2 text-sm text-slate-700 transition hover:bg-brand-50 hover:text-brand-800"
            >
              Inventário de software
            </Link>
          </div>

          {message ? (
            <div className="border-t border-rose-100 bg-rose-50 px-4 py-3 text-xs text-rose-700">
              {message}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
