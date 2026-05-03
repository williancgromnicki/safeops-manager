'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import type { AllowedCustomer } from '@/lib/data/get-current-customer';

type CustomerSelectorProps = {
  customers: AllowedCustomer[];
  activeCustomerId: string;
};

export function CustomerSelector({
  customers,
  activeCustomerId,
}: CustomerSelectorProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (customers.length === 0) {
    return null;
  }

  if (customers.length === 1) {
    return (
      <div className="rounded-xl border border-surface-border bg-white px-4 py-3 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Cliente
        </p>
        <p className="mt-1 text-sm font-semibold text-brand-900">
          {customers[0].customerName}
        </p>
      </div>
    );
  }

  const handleChange = (customerId: string) => {
    const params = new URLSearchParams(searchParams.toString());

    if (customerId) {
      params.set('customerId', customerId);
    } else {
      params.delete('customerId');
    }

    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="rounded-xl border border-surface-border bg-white px-4 py-3 shadow-sm">
      <label
        htmlFor="customer-selector"
        className="text-xs font-medium uppercase tracking-wide text-slate-500"
      >
        Cliente ativo
      </label>

      <select
        id="customer-selector"
        value={activeCustomerId}
        onChange={(event) => handleChange(event.target.value)}
        className="mt-2 w-full min-w-[260px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-brand-900 outline-none transition focus:border-brand-700 focus:ring-2 focus:ring-brand-100"
      >
        {customers.map((customer) => (
          <option key={customer.customerId} value={customer.customerId}>
            {customer.customerName}
          </option>
        ))}
      </select>
    </div>
  );
}
