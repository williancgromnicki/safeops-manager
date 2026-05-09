import { createClient } from '@/lib/supabase/server';

export type CustomerSiteListItem = {
  id: string;
  customerId: string;
  name: string;
  slug: string;
  tacticalSiteId: string | null;
  isActive: boolean;
};

type SiteRow = {
  id: string;
  customer_id: string;
  name: string;
  slug: string;
  tactical_site_id: string | null;
  is_active: boolean | null;
};

export async function getSitesForCustomer(
  customerId: string,
): Promise<CustomerSiteListItem[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('sites')
    .select('id, customer_id, name, slug, tactical_site_id, is_active')
    .eq('customer_id', customerId)
    .order('name', { ascending: true })
    .returns<SiteRow[]>();

  if (error || !data?.length) {
    return [];
  }

  return data.map((site) => ({
    id: site.id,
    customerId: site.customer_id,
    name: site.name,
    slug: site.slug,
    tacticalSiteId: site.tactical_site_id,
    isActive: site.is_active !== false,
  }));
}
