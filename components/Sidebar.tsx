'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { LogoutButton } from '@/components/LogoutButton';

type AllowedCustomer = {
  customerId: string;
  customerName: string;
  customerSlug: string;
  role: string;
};

type CustomersApiResponse = {
  ok: boolean;
  customers?: AllowedCustomer[];
  error?: string;
};

type NavItem = {
  href: string;
  label: string;
  preserveCustomer: boolean;
  disabled?: boolean;
  hidden?: boolean;
  roles?: string[];
};

const PUBLIC_PATHS = ['/login'];

const MAIN_NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', preserveCustomer: true },
  { href: '/devices', label: 'Dispositivos', preserveCustomer: true },
  { href: '/alerts', label: 'Alertas', preserveCustomer: true },
];

const OPERATIONS_NAV_ITEMS: NavItem[] = [
  {
    href: '/admin/remote-jobs',
    label: 'Jobs remotos',
    preserveCustomer: true,
    roles: ['admin', 'client'],
  },
  {
    href: '/operations/software-install',
    label: 'Instalar software',
    preserveCustomer: true,
    disabled: true,
    roles: ['admin', 'client'],
  },
  {
    href: '/operations/actions',
    label: 'Ações administrativas',
    preserveCustomer: true,
    disabled: true,
    roles: ['admin'],
  },
  {
    href: '/operations/history',
    label: 'Histórico',
    preserveCustomer: true,
    disabled: true,
    roles: ['admin', 'client'],
  },
];

const ADMIN_NAV_ITEMS: NavItem[] = [
  {
    href: '/admin',
    label: 'Painel administrativo',
    preserveCustomer: true,
    roles: ['admin'],
  },
  {
    href: '/admin/customers',
    label: 'Clientes e sites',
    preserveCustomer: true,
    hidden: true,
    roles: ['admin'],
  },
  {
    href: '/admin/users',
    label: 'Usuários e permissões',
    preserveCustomer: true,
    roles: ['admin', 'client'],
  },
  {
    href: '/admin/agent-installers',
    label: 'Instaladores de agentes',
    preserveCustomer: true,
    roles: ['admin', 'client'],
  },
  {
    href: '/admin/alert-contacts',
    label: 'Contatos de alerta',
    preserveCustomer: true,
    disabled: true,
    roles: ['admin'],
  },
];

function buildHref(
  href: string,
  customerId: string | null,
  preserveCustomer: boolean,
) {
  if (!preserveCustomer || !customerId) {
    return href;
  }

  return `${href}?customerId=${encodeURIComponent(customerId)}`;
}

function normalizeRole(role?: string | null): string {
  return role?.trim().toLowerCase() ?? '';
}

function getHighestRole(customers: AllowedCustomer[]): string {
  if (customers.some((customer) => normalizeRole(customer.role) === 'admin')) {
    return 'admin';
  }

  if (customers.some((customer) => normalizeRole(customer.role) === 'client')) {
    return 'client';
  }

  if (customers.some((customer) => normalizeRole(customer.role) === 'viewer')) {
    return 'viewer';
  }

  return '';
}

function isItemAllowed(item: NavItem, currentRole: string): boolean {
  if (item.hidden) {
    return false;
  }

  if (!item.roles || item.roles.length === 0) {
    return true;
  }

  return item.roles.includes(currentRole);
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`h-4 w-4 transition-transform ${open ? 'rotate-90' : ''}`}
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M7.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L10.94 10 7.22 6.28a.75.75 0 0 1 0-1.06Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function NavLink({
  item,
  activeCustomerId,
  pathname,
  nested = false,
}: {
  item: NavItem;
  activeCustomerId: string | null;
  pathname: string;
  nested?: boolean;
}) {
  const active = pathname === item.href;
  const href = buildHref(
    item.href,
    activeCustomerId,
    item.preserveCustomer,
  );

  if (item.disabled) {
    return (
      <span
        className={[
          'flex cursor-not-allowed items-center justify-between rounded-xl px-4 py-2.5 text-sm font-medium text-slate-400',
          nested ? 'pl-7' : '',
        ].join(' ')}
        title="Em breve"
      >
        <span>{item.label}</span>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          Em breve
        </span>
      </span>
    );
  }

  return (
    <Link
      href={href}
      className={[
        'block rounded-xl px-4 py-2.5 text-sm font-medium transition',
        nested ? 'pl-7' : '',
        active
          ? 'bg-brand-700 text-white shadow-sm'
          : 'text-brand-900 hover:bg-brand-50',
      ].join(' ')}
    >
      {item.label}
    </Link>
  );
}

function NavGroup({
  label,
  open,
  onToggle,
  children,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between rounded-xl px-4 py-2.5 text-sm font-semibold text-brand-900 transition hover:bg-brand-50"
      >
        <span>{label}</span>
        <ChevronIcon open={open} />
      </button>

      {open ? <ul className="mt-1 space-y-1">{children}</ul> : null}
    </li>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const isPublicPath = PUBLIC_PATHS.some((path) => pathname === path);
  const customerIdFromUrl = searchParams.get('customerId');

  const [customers, setCustomers] = useState<AllowedCustomer[]>([]);
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(true);
  const [operationsOpen, setOperationsOpen] = useState(
    pathname.startsWith('/operations') ||
      pathname.startsWith('/admin/remote-jobs'),
  );
  const [adminOpen, setAdminOpen] = useState(pathname.startsWith('/admin'));

  useEffect(() => {
    if (
      pathname.startsWith('/operations') ||
      pathname.startsWith('/admin/remote-jobs')
    ) {
      setOperationsOpen(true);
    }

    if (pathname.startsWith('/admin')) {
      setAdminOpen(true);
    }
  }, [pathname]);

  useEffect(() => {
    let isMounted = true;

    async function loadCustomers() {
      if (isPublicPath) {
        setCustomers([]);
        setIsLoadingCustomers(false);
        return;
      }

      try {
        const response = await fetch('/api/customers', {
          method: 'GET',
          cache: 'no-store',
        });

        const payload = (await response.json()) as CustomersApiResponse;

        if (!isMounted) {
          return;
        }

        if (!response.ok || !payload.ok) {
          setCustomers([]);
          return;
        }

        setCustomers(payload.customers ?? []);
      } catch {
        if (isMounted) {
          setCustomers([]);
        }
      } finally {
        if (isMounted) {
          setIsLoadingCustomers(false);
        }
      }
    }

    loadCustomers();

    return () => {
      isMounted = false;
    };
  }, [isPublicPath]);

  const activeCustomerId = useMemo(() => {
    if (customerIdFromUrl) {
      const exists = customers.some(
        (customer) => customer.customerId === customerIdFromUrl,
      );

      if (exists) {
        return customerIdFromUrl;
      }
    }

    return customers[0]?.customerId ?? null;
  }, [customerIdFromUrl, customers]);

  const activeCustomerRole = useMemo(() => {
    if (!activeCustomerId) {
      return getHighestRole(customers);
    }

    const activeCustomer = customers.find(
      (customer) => customer.customerId === activeCustomerId,
    );

    return normalizeRole(activeCustomer?.role) || getHighestRole(customers);
  }, [activeCustomerId, customers]);

  const visibleOperationsItems = OPERATIONS_NAV_ITEMS.filter((item) =>
    isItemAllowed(item, activeCustomerRole),
  );

  const visibleAdminItems = ADMIN_NAV_ITEMS.filter((item) =>
    isItemAllowed(item, activeCustomerRole),
  );

  const handleCustomerChange = (customerId: string) => {
    const params = new URLSearchParams(searchParams.toString());

    if (customerId) {
      params.set('customerId', customerId);
    } else {
      params.delete('customerId');
    }

    const nextPathname =
      pathname === '/login' ? '/dashboard' : pathname;

    router.push(`${nextPathname}?${params.toString()}`);
  };

  if (isPublicPath) {
    return null;
  }

  return (
    <aside className="hidden min-h-screen w-72 shrink-0 flex-col border-r border-surface-border bg-white/90 p-6 shadow-sm lg:flex">
      <div>
        <p className="mb-6 text-lg font-semibold text-brand-900">
          SafeOps Manager
        </p>

        <div className="mb-6 rounded-xl border border-surface-border bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Cliente ativo
          </p>

          {isLoadingCustomers ? (
            <div className="mt-3 h-10 rounded-lg bg-slate-100" />
          ) : customers.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">
              Nenhum cliente vinculado
            </p>
          ) : customers.length === 1 ? (
            <p className="mt-2 truncate text-sm font-semibold text-brand-900">
              {customers[0].customerName}
            </p>
          ) : (
            <select
              value={activeCustomerId ?? ''}
              onChange={(event) => handleCustomerChange(event.target.value)}
              className="mt-3 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-brand-900 outline-none transition focus:border-brand-700 focus:ring-2 focus:ring-brand-100"
            >
              {customers.map((customer) => (
                <option key={customer.customerId} value={customer.customerId}>
                  {customer.customerName}
                </option>
              ))}
            </select>
          )}
        </div>

        <ul className="space-y-2">
          {MAIN_NAV_ITEMS.map((item) => (
            <li key={item.href}>
              <NavLink
                item={item}
                activeCustomerId={activeCustomerId}
                pathname={pathname}
              />
            </li>
          ))}

          {visibleOperationsItems.length > 0 ? (
            <NavGroup
              label="Operações"
              open={operationsOpen}
              onToggle={() => setOperationsOpen((current) => !current)}
            >
              {visibleOperationsItems.map((item) => (
                <li key={item.href}>
                  <NavLink
                    item={item}
                    activeCustomerId={activeCustomerId}
                    pathname={pathname}
                    nested
                  />
                </li>
              ))}
            </NavGroup>
          ) : null}

          {visibleAdminItems.length > 0 ? (
            <NavGroup
              label="Administração"
              open={adminOpen}
              onToggle={() => setAdminOpen((current) => !current)}
            >
              {visibleAdminItems.map((item) => (
                <li key={item.href}>
                  <NavLink
                    item={item}
                    activeCustomerId={activeCustomerId}
                    pathname={pathname}
                    nested
                  />
                </li>
              ))}
            </NavGroup>
          ) : null}
        </ul>
      </div>

      <div className="mt-auto border-t border-slate-200 pt-4">
        <LogoutButton />
      </div>
    </aside>
  );
}
