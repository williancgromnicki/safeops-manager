'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

const buttonClassName =
  'inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60';

export function RemoteJobsRefreshButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      className={buttonClassName}
      disabled={isPending}
      onClick={() => {
        startTransition(() => {
          router.refresh();
        });
      }}
    >
      {isPending ? 'Atualizando...' : 'Atualizar status'}
    </button>
  );
}
