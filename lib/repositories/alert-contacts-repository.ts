import { getSupabaseAdmin } from '@/lib/supabase/admin';

export type AlertContactRecord = {
  id: string;
  customerId: string;
  customerName: string;
  email: string;
  name: string | null;
  receivesInfo: boolean;
  receivesWarn: boolean;
  receivesCrit: boolean;
  isActive: boolean;
};

type AlertContactRow = {
  id: string;
  customer_id: string;
  email: string;
  name: string | null;
  receives_info: boolean;
  receives_warn: boolean;
  receives_crit: boolean;
  is_active: boolean;
  customer: { name: string | null } | { name: string | null }[] | null;
};

function getCustomerName(
  customer: { name: string | null } | { name: string | null }[] | null,
): string {
  if (Array.isArray(customer)) {
    return customer[0]?.name ?? '—';
  }

  return customer?.name ?? '—';
}

export async function listAlertContactsByCustomer(customerId?: string): Promise<AlertContactRecord[]> {
  const supabase = getSupabaseAdmin();

  let query = supabase
    .from('customer_alert_contacts')
    .select('id, customer_id, email, name, receives_info, receives_warn, receives_crit, is_active, customer:customers(name)')
    .order('created_at', { ascending: false });

  if (customerId) {
    query = query.eq('customer_id', customerId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to list alert contacts: ${error.message}`);
  }

  const rows = (data ?? []) as AlertContactRow[];

  return rows.map((contact) => ({
    id: contact.id,
    customerId: contact.customer_id,
    customerName: getCustomerName(contact.customer),
    email: contact.email,
    name: contact.name,
    receivesInfo: contact.receives_info,
    receivesWarn: contact.receives_warn,
    receivesCrit: contact.receives_crit,
    isActive: contact.is_active,
  }));
}


export async function listAlertContactsByCustomers(customerIds: string[]): Promise<AlertContactRecord[]> {
  if (customerIds.length === 0) {
    return [];
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('customer_alert_contacts')
    .select('id, customer_id, email, name, receives_info, receives_warn, receives_crit, is_active, customer:customers(name)')
    .in('customer_id', customerIds)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to list alert contacts: ${error.message}`);
  }

  const rows = (data ?? []) as AlertContactRow[];

  return rows.map((contact) => ({
    id: contact.id,
    customerId: contact.customer_id,
    customerName: getCustomerName(contact.customer),
    email: contact.email,
    name: contact.name,
    receivesInfo: contact.receives_info,
    receivesWarn: contact.receives_warn,
    receivesCrit: contact.receives_crit,
    isActive: contact.is_active,
  }));
}
