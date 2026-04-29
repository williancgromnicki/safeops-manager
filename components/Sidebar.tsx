"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/devices', label: 'Dispositivos' },
  { href: '/alerts', label: 'Alertas' },
  { href: '/admin', label: 'Administração' },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-72 shrink-0 border-r border-surface-border bg-white/90 p-6 shadow-sm lg:block">
      <p className="mb-8 text-lg font-semibold text-brand-900">SafeOps Manager</p>
      <ul className="space-y-2">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href;

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`block rounded-xl px-4 py-2.5 text-sm font-medium transition ${
                  active
                    ? 'bg-brand-700 text-white shadow-sm'
                    : 'text-brand-900 hover:bg-brand-50'
                }`}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
