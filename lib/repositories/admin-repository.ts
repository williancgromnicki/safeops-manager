import { getSupabaseAdmin } from '@/lib/supabase/admin';

export type AdminCustomerRecord = {
  id: string;
  name: string;
  createdAt: string;
};

type CustomerRow = {
  id: string;
  name: string;
  created_at: string;
};

export async function listCustomersForAdminContext(customerIds?: string[]): Promise<AdminCustomerRecord[]> {
  const supabase = getSupabaseAdmin();

  let query = supabase
    .from('customers')
    .select('id, name, created_at')
    .order('created_at', { ascending: false });

  if (customerIds && customerIds.length > 0) {
    query = query.in('id', customerIds);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to list customers: ${error.message}`);
  }

  const rows = (data ?? []) as CustomerRow[];

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
  }));
}
