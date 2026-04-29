import { ReactNode } from 'react';

import { Header } from '@/components/Header';
import { Sidebar } from '@/components/Sidebar';

type AppShellProps = {
  title?: string;
  children: ReactNode;
};

export function AppShell({ title = 'SafeOps Manager', children }: AppShellProps) {
  return (
    <div className="min-h-screen bg-surface-light lg:flex">
      <Sidebar />
      <div className="flex-1">
        <Header title={title} />
        <main className="p-4 sm:p-6 lg:p-10">{children}</main>
      </div>
    </div>
  );
}
