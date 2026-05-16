'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

type RefreshPageButtonProps = {
  label?: string;
};

export function RefreshPageButton({
  label = 'Atualizar',
}: RefreshPageButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleRefresh() {
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={handleRefresh}
      disabled={isPending}
      className={[
        'inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold shadow-sm transition',
        isPending
          ? 'cursor-not-allowed bg-slate-200 text-slate-500'
          : 'bg-brand-700 text-white hover:bg-brand-800',
      ].join(' ')}
    >
      {isPending ? 'Atualizando...' : label}
    </button>
  );
}