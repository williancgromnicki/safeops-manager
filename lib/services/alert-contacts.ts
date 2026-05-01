import { createClient } from '@/lib/supabase/server';
import {
  listAlertContactsByCustomer,
  type AlertContactRecord,
} from '@/lib/repositories/alert-contacts-repository';

type UserProfile = {
  role: string | null;
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
    .eq('user_id', user.id)
    .maybeSingle<UserProfile>();

  if (profile?.role !== 'admin') {
    throw new Error('Forbidden: admin role is required.');
  }

  if (input.customerId) {
    const { data: access } = await supabase
      .from('user_customer_access')
      .select('id')
      .eq('user_id', user.id)
      .eq('customer_id', input.customerId)
      .maybeSingle();

    if (!access) {
      throw new Error('Forbidden: no access to this customer.');
    }
  }

  return listAlertContactsByCustomer(input.customerId);
}
