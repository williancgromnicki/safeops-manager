'use client';

import { ReactNode, Suspense, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import { Header } from '@/components/Header';
import { Sidebar } from '@/components/Sidebar';

type AppShellProps = {
  title?: string;
  children: ReactNode;
};

const PUBLIC_PATHS = ['/login', '/change-password'];

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
  const router = useRouter();

  const isPublicPath = PUBLIC_PATHS.some((path) => pathname === path);

  useEffect(() => {
    let isMounted = true;

    async function checkPasswordStatus() {
      if (isPublicPath) {
        return;
      }

      try {
        const response = await fetch('/api/me/password-status', {
          method: 'GET',
          cache: 'no-store',
        });

        if (response.status === 401) {
          return;
        }

        const data = (await response.json()) as {
          ok: boolean;
          mustChangePassword?: boolean;
        };

        if (isMounted && data.ok && data.mustChangePassword) {
          router.replace('/change-password');
        }
      } catch {
        // Não bloqueia a renderização caso a verificação falhe.
      }
    }

    checkPasswordStatus();

    return () => {
      isMounted = false;
    };
  }, [isPublicPath, router]);

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
