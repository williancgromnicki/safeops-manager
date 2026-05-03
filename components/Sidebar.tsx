'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

type AllowedCustomer = {
  customerId: string;
  customerName: string;
  customerSlug: string;
  role: string;
};

type CustomersApiResponse = {
  ok: boolean;
  customers: AllowedCustomer[];
  error?: string;
};

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', preserveCustomer: true },
  { href: '/devices', label: 'Dispositivos', preserveCustomer: true },
  { href: '/alerts', label: 'Alertas', preserveCustomer: true },
  { href: '/admin', label: 'Administração', preserveCustomer: false },
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

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const customerIdFromUrl = searchParams.get('customerId');

  const [customers, setCustomers] = useState<AllowedCustomer[]>([]);
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function loadCustomers() {
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
  }, []);

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

  const handleCustomerChange = (customerId: string) => {
    const params = new URLSearchParams(searchParams.toString());

    if (customerId) {
      params.set('customerId', customerId);
    } else {
      params.delete('customerId');
    }

    const nextPathname =
      pathname === '/admin' || pathname === '/login' ? '/dashboard' : pathname;

    router.push(`${nextPathname}?${params.toString()}`);
  };

  return (
    <aside className="hidden w-72 shrink-0 border-r border-surface-border bg-white/90 p-6 shadow-sm lg:block">
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
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href;
          const href = buildHref(
            item.href,
            activeCustomerId,
            item.preserveCustomer,
          );

          return (
            <li key={item.href}>
              <Link
                href={href}
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
