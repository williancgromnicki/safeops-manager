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

type UpsertAlertContactInput = {
  id?: string;
  customerId: string;
  email: string;
  name: string | null;
  receivesInfo: boolean;
  receivesWarn: boolean;
  receivesCrit: boolean;
};

function getCustomerName(
  customer: { name: string | null } | { name: string | null }[] | null,
): string {
  if (Array.isArray(customer)) {
    return customer[0]?.name ?? '—';
  }

  return customer?.name ?? '—';
}

function mapRow(contact: AlertContactRow): AlertContactRecord {
  return {
    id: contact.id,
    customerId: contact.customer_id,
    customerName: getCustomerName(contact.customer),
    email: contact.email,
    name: contact.name,
    receivesInfo: contact.receives_info,
    receivesWarn: contact.receives_warn,
    receivesCrit: contact.receives_crit,
    isActive: contact.is_active,
  };
}

async function fetchAlertContact(id: string, customerId: string): Promise<AlertContactRecord> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('customer_alert_contacts')
    .select('id, customer_id, email, name, receives_info, receives_warn, receives_crit, is_active, customer:customers(name)')
    .eq('id', id)
    .eq('customer_id', customerId)
    .single();

  if (error) {
    throw new Error(`Failed to fetch alert contact: ${error.message}`);
  }

  return mapRow(data as AlertContactRow);
}

export async function listAlertContacts(customerIds: string[]): Promise<AlertContactRecord[]> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('customer_alert_contacts')
    .select('id, customer_id, email, name, receives_info, receives_warn, receives_crit, is_active, customer:customers(name)')
    .in('customer_id', customerIds)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to list alert contacts: ${error.message}`);
  }

  return ((data ?? []) as AlertContactRow[]).map(mapRow);
}

export async function createAlertContact(input: UpsertAlertContactInput): Promise<AlertContactRecord> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('customer_alert_contacts')
    .insert({
      customer_id: input.customerId,
      email: input.email,
      name: input.name,
      receives_info: input.receivesInfo,
      receives_warn: input.receivesWarn,
      receives_crit: input.receivesCrit,
      is_active: true,
    })
    .select('id, customer_id')
    .single();

  if (error) {
    throw new Error(`Failed to create alert contact: ${error.message}`);
  }

  return fetchAlertContact(data.id as string, data.customer_id as string);
}

export async function updateAlertContact(input: UpsertAlertContactInput): Promise<AlertContactRecord> {
  if (!input.id) {
    throw new Error('Failed to update alert contact: missing id.');
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('customer_alert_contacts')
    .update({
      email: input.email,
      name: input.name,
      receives_info: input.receivesInfo,
      receives_warn: input.receivesWarn,
      receives_crit: input.receivesCrit,
    })
    .eq('id', input.id)
    .eq('customer_id', input.customerId);

  if (error) {
    throw new Error(`Failed to update alert contact: ${error.message}`);
  }

  return fetchAlertContact(input.id, input.customerId);
}

export async function deactivateAlertContact(id: string, customerId: string): Promise<AlertContactRecord> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('customer_alert_contacts')
    .update({ is_active: false })
    .eq('id', id)
    .eq('customer_id', customerId);

  if (error) {
    throw new Error(`Failed to deactivate alert contact: ${error.message}`);
  }

  return fetchAlertContact(id, customerId);
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
