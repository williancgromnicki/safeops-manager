import { createClient } from '@/lib/supabase/server';
import { listCustomersForAdminContext, type AdminCustomerRecord } from '@/lib/repositories/admin-repository';

type UserProfile = {
  role: string | null;
};

type UserCustomerAccess = {
  customer_id: string;
};

export async function listAllowedCustomersForAdminService(): Promise<AdminCustomerRecord[]> {
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
    .eq('user_id', user.id)
    .maybeSingle<UserProfile>();

  if (profile?.role !== 'admin') {
    throw new Error('Forbidden: admin role is required.');
  }

  const { data: allowedCustomers, error: allowedCustomersError } = await supabase
    .from('user_customer_access')
    .select('customer_id')
    .eq('user_id', user.id);

  if (allowedCustomersError) {
    throw new Error(`Failed to list customer access: ${allowedCustomersError.message}`);
  }

  const customerIds = (allowedCustomers as UserCustomerAccess[] | null)?.map((row) => row.customer_id) ?? [];

  if (customerIds.length === 0) {
    return [];
  }

  return listCustomersForAdminContext(customerIds);
}
