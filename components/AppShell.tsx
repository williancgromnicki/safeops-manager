'use client';

import { ReactNode, Suspense } from 'react';
import { usePathname } from 'next/navigation';

import { Header } from '@/components/Header';
import { Sidebar } from '@/components/Sidebar';

type AppShellProps = {
  title?: string;
  children: ReactNode;
};

const PUBLIC_PATHS = ['/login'];

function SidebarFallback() {
  return (
    <aside className="hidden w-72 shrink-0 border-r border-surface-border bg-white/90 p-6 shadow-sm lg:block">
      <p className="mb-6 text-lg font-semibold text-brand-900">
        SafeOps Manager
      </p>

      <div className="mb-6 rounded-xl border border-surface-border bg-brand-900 p-4 text-white shadow-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-brand-100">
          Cliente ativo
        </p>
        <div className="mt-3 h-10 rounded-lg bg-white/10" />
      </div>

      <div className="space-y-2">
        <div className="h-10 rounded-xl bg-brand-50" />
        <div className="h-10 rounded-xl bg-brand-50" />
        <div className="h-10 rounded-xl bg-brand-50" />
        <div className="h-10 rounded-xl bg-brand-50" />
      </div>
    </aside>
  );
}

export function AppShell({
  title = 'SafeOps Manager',
  children,
}: AppShellProps) {
  const pathname = usePathname();

  const isPublicPath = PUBLIC_PATHS.some((path) => pathname === path);

  if (isPublicPath) {
    return <div className="min-h-screen bg-surface-light">{children}</div>;
  }

  return (
    <div className="min-h-screen bg-surface-light lg:flex">
      <Suspense fallback={<SidebarFallback />}>
        <Sidebar />
      </Suspense>

      <div className="flex-1">
        <Header title={title} />
        <main className="p-4 sm:p-6 lg:p-10">{children}</main>
      </div>
    </div>
  );
}
