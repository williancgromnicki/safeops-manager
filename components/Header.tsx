"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/devices', label: 'Dispositivos' },
  { href: '/alerts', label: 'Alertas' },
  { href: '/admin', label: 'Administração' },
];

type HeaderProps = {
  title: string;
};

export function Header({ title }: HeaderProps) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-10 border-b border-surface-border bg-white/95 px-4 py-4 backdrop-blur sm:px-6 lg:px-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-brand-900">{title}</h1>
        <nav className="flex w-full gap-2 overflow-x-auto lg:hidden">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition ${
                  active
                    ? 'bg-brand-700 text-white'
                    : 'bg-white text-brand-700 ring-1 ring-surface-border hover:bg-brand-50'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
