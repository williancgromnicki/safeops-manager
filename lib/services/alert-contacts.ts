import { createClient } from '@/lib/supabase/server';
import {
  listAlertContactsByCustomer,
  listAlertContactsByCustomers,
  type AlertContactRecord,
} from '@/lib/repositories/alert-contacts-repository';

type UserProfile = {
  role: string | null;
};

type UserCustomerAccess = {
  customer_id: string;
};

export type ListAlertContactsInput = {
  customerId?: string;
};

export async function listAlertContactsService(
  input: ListAlertContactsInput = {},
): Promise<AlertContactRecord[]> {
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

  const { data: accessRows, error: accessError } = await supabase
    .from('user_customer_access')
    .select('customer_id')
    .eq('user_id', user.id);

  if (accessError) {
    throw new Error(`Failed to list customer access: ${accessError.message}`);
  }

  const customerIds = (accessRows as UserCustomerAccess[] | null)?.map((row) => row.customer_id) ?? [];

  if (input.customerId) {
    if (!isAdmin && !customerIds.includes(input.customerId)) {
      return [];
    }

    if (isAdmin && customerIds.length > 0 && !customerIds.includes(input.customerId)) {
      return [];
    }

    return listAlertContactsByCustomer(input.customerId);
  }

  return listAlertContactsByCustomers(customerIds);
}
