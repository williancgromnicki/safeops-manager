"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/login", label: "Login" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/devices", label: "Dispositivos" },
  { href: "/alerts", label: "Alertas" },
  { href: "/admin", label: "Administração" },
];

function NavLinks({ mobile = false }: { mobile?: boolean }) {
  const pathname = usePathname();

  return (
    <ul className={mobile ? "grid grid-cols-2 gap-2" : "space-y-2"}>
      {NAV_ITEMS.map((item) => {
        const active = pathname === item.href;

        return (
          <li key={item.href}>
            <Link
              href={item.href}
              className={`block rounded-lg px-3 py-2 text-sm font-medium transition ${
                active
                  ? "bg-brand-700 text-white"
                  : "text-brand-100 hover:bg-brand-500/20 hover:text-white"
              } ${mobile ? "bg-white text-brand-700 hover:bg-brand-50" : ""}`}
            >
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function Sidebar() {
  return (
    <aside className="hidden w-64 bg-brand-900 p-5 text-white lg:block">
      <p className="mb-8 text-lg font-semibold">SafeOps Manager</p>
      <NavLinks />
    </aside>
  );
}

export function MobileNav() {
  return (
    <nav className="border-b border-surface-border bg-white p-4 lg:hidden">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-base font-semibold text-brand-900">SafeOps Manager</p>
      </div>
      <NavLinks mobile />
    </nav>
  );
}
