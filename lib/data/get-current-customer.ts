import { createClient } from '@/lib/supabase/server';

export type CurrentCustomer = {
  userId: string;
  customerId: string;
  customerName: string;
  customerSlug: string;
  role: string;
};

export type AllowedCustomer = {
  customerId: string;
  customerName: string;
  customerSlug: string;
  role: string;
};

export type CustomerContext = {
  userId: string;
  customers: AllowedCustomer[];
  activeCustomer: AllowedCustomer | null;
};

type UserCustomerAccessRow = {
  customer_id: string;
  role: string;
  customers:
    | {
        id: string;
        name: string;
        slug: string;
      }
    | {
        id: string;
        name: string;
        slug: string;
      }[]
    | null;
};

function normalizeCustomer(
  customer:
    | {
        id: string;
        name: string;
        slug: string;
      }
    | {
        id: string;
        name: string;
        slug: string;
      }[]
    | null,
) {
  if (Array.isArray(customer)) {
    return customer[0] ?? null;
  }

  return customer;
}

function mapAllowedCustomer(row: UserCustomerAccessRow): AllowedCustomer | null {
  const customer = normalizeCustomer(row.customers);

  if (!customer) {
    return null;
  }

  return {
    customerId: row.customer_id,
    customerName: customer.name,
    customerSlug: customer.slug,
    role: row.role,
  };
}

export async function getAllowedCustomers(): Promise<{
  userId: string;
  customers: AllowedCustomer[];
} | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data, error } = await supabase
    .from('user_customer_access')
    .select('customer_id, role, customers:customers!inner(id, name, slug)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`Failed to list allowed customers: ${error.message}`);
  }

  const customers = ((data ?? []) as UserCustomerAccessRow[])
    .map(mapAllowedCustomer)
    .filter((customer): customer is AllowedCustomer => Boolean(customer));

  return {
    userId: user.id,
    customers,
  };
}

export async function resolveCurrentCustomer(
  requestedCustomerId?: string | null,
): Promise<CustomerContext | null> {
  const result = await getAllowedCustomers();

  if (!result) {
    return null;
  }

  const requested = requestedCustomerId?.trim();

  const activeCustomer =
    result.customers.find((customer) => customer.customerId === requested) ??
    result.customers[0] ??
    null;

  return {
    userId: result.userId,
    customers: result.customers,
    activeCustomer,
  };
}

export async function getCurrentCustomer(): Promise<CurrentCustomer | null> {
  const context = await resolveCurrentCustomer();

  if (!context?.activeCustomer) {
    return null;
  }

  return {
    userId: context.userId,
    customerId: context.activeCustomer.customerId,
    customerName: context.activeCustomer.customerName,
    customerSlug: context.activeCustomer.customerSlug,
    role: context.activeCustomer.role,
  };
}
