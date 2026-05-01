import { createClient } from '@/lib/supabase/server';
import {
  listCustomersForAdminContext,
  type AdminCustomerRecord,
} from '@/lib/repositories/admin-repository';

type UserProfile = {
  role: string | null;
};

type UserCustomerAccess = {
  customer_id: string;
};

export type AdminCustomersResult = {
  customers: AdminCustomerRecord[];
  isAdmin: boolean;
};

export async function listAllowedCustomersForAdminService(): Promise<AdminCustomersResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('Unauthorized: user not authenticated.');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle<UserProfile>();

  const isAdmin = profile?.role === 'admin';

  const { data: allowedCustomers, error: allowedCustomersError } = await supabase
    .from('user_customer_access')
    .select('customer_id')
    .eq('user_id', user.id);

  if (allowedCustomersError) {
    throw new Error(
      `Failed to list customer access: ${allowedCustomersError.message}`,
    );
  }

  const customerIds =
    (allowedCustomers as UserCustomerAccess[] | null)?.map(
      (row) => row.customer_id,
    ) ?? [];

  if (customerIds.length === 0) {
    return {
      customers: [],
      isAdmin,
    };
  }

  const customers = await listCustomersForAdminContext(customerIds);

  return {
    customers,
    isAdmin,
  };
}
