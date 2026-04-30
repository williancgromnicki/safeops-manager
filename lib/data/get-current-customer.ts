import { createClient } from '@/lib/supabase/server';

export type CurrentCustomer = {
  userId: string;
  customerId: string;
  customerName: string;
  customerSlug: string;
  role: string;
};

type UserCustomerAccessRow = {
  customer_id: string;
  role: string;
  customers: {
    id: string;
    name: string;
    slug: string;
  } | null;
};

export async function getCurrentCustomer(): Promise<CurrentCustomer | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data } = await supabase
    .from('user_customer_access')
    .select('customer_id, role, customers:customers!inner(id, name, slug)')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle<UserCustomerAccessRow>();

  if (!data?.customers) return null;

  return {
    userId: user.id,
    customerId: data.customer_id,
    customerName: data.customers.name,
    customerSlug: data.customers.slug,
    role: data.role,
  };
}
