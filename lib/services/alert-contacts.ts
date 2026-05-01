import { createClient } from '@/lib/supabase/server';
import {
  listAlertContactsByCustomer,
  listAlertContactsByCustomers,
  type AlertContactRecord,
} from '@/lib/repositories/alert-contacts-repository';

export type ListAlertContactsInput = {
  customerId?: string;
};

export type CreateAlertContactInput = {
  customerId: string;
  email: string;
  name?: string | null;
} & AlertPermissionFlags;

export type UpdateAlertContactInput = {
  id: string;
  customerId: string;
  email: string;
  name?: string | null;
} & AlertPermissionFlags;

export type DeactivateAlertContactInput = {
  id: string;
  customerId: string;
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateEmail(email: string): string {
  const normalized = email.trim().toLowerCase();

  if (!EMAIL_REGEX.test(normalized)) {
    throw new Error('Validation error: invalid e-mail format.');
  }

  const { data, error: accessError } = await supabase
    .from('user_customer_access')
    .select('customer_id')
    .eq('user_id', user.id);

  if (accessError) {
    throw new Error(`Failed to list customer access: ${accessError.message}`);
  }

  const customerIds = (data ?? []).map((row) => row.customer_id as string);

  if (input.customerId) {
    if (!customerIds.includes(input.customerId)) {
      return [];
    }

    return listAlertContactsByCustomer(input.customerId);
  }

  return listAlertContactsByCustomers(customerIds);
}
