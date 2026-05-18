import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { findTrmmClientByIdOrName } from '@/lib/trmm/api';

export type CustomerSiteListItem = {
  id: string;
  customerId: string;
  name: string;
  slug: string;
  tacticalSiteId: string | null;
  isActive: boolean;
};

type CustomerRow = {
  id: string;
  tactical_client_id: string | null;
};

type SiteRow = {
  id: string;
  customer_id: string;
  name: string;
  slug: string;
  tactical_site_id: string | null;
  is_active: boolean | null;
};

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase();
}

function isMissingSitesTableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const maybeError = error as { code?: string; message?: string; details?: string };
  const text = [maybeError.code, maybeError.message, maybeError.details]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return (
    text.includes('public.sites') ||
    text.includes("table 'sites'") ||
    text.includes('could not find the table') ||
    text.includes('schema cache') ||
    text.includes('pgrst205') ||
    text.includes('42p01')
  );
}

async function getCustomer(customerId: string): Promise<CustomerRow | null> {
  const supabaseAdmin = getSupabaseAdmin();

  const { data, error } = await supabaseAdmin
    .from('customers')
    .select('id, tactical_client_id')
    .eq('id', customerId)
    .maybeSingle<CustomerRow>();

  if (error) {
    return null;
  }

  return data ?? null;
}

async function getLocalSites(customerId: string): Promise<CustomerSiteListItem[]> {
  const supabaseAdmin = getSupabaseAdmin();

  const { data, error } = await supabaseAdmin
    .from('sites')
    .select('id, customer_id, name, slug, tactical_site_id, is_active')
    .eq('customer_id', customerId)
    .order('name', { ascending: true })
    .returns<SiteRow[]>();

  if (error) {
    if (isMissingSitesTableError(error)) {
      return [];
    }

    return [];
  }

  return (data ?? []).map((site) => ({
    id: site.id,
    customerId: site.customer_id,
    name: site.name,
    slug: site.slug,
    tacticalSiteId: site.tactical_site_id,
    isActive: site.is_active !== false,
  }));
}

async function getOperationalSites(customerId: string): Promise<CustomerSiteListItem[]> {
  const customer = await getCustomer(customerId);
  const operationalClientId = Number(customer?.tactical_client_id);

  if (!customer || !Number.isFinite(operationalClientId) || operationalClientId <= 0) {
    return [];
  }

  try {
    const client = await findTrmmClientByIdOrName({
      clientId: operationalClientId,
    });

    return (client?.sites ?? [])
      .filter((site) => site.name?.trim())
      .map((site) => ({
        id: `operational-${site.id}`,
        customerId,
        name: site.name,
        slug: slugify(site.name),
        tacticalSiteId: String(site.id),
        isActive: true,
      }));
  } catch {
    return [];
  }
}

function mergeSites(
  localSites: CustomerSiteListItem[],
  operationalSites: CustomerSiteListItem[],
): CustomerSiteListItem[] {
  const merged = new Map<string, CustomerSiteListItem>();

  for (const site of localSites) {
    merged.set(normalizeName(site.name), site);
  }

  for (const site of operationalSites) {
    const key = normalizeName(site.name);
    const existing = merged.get(key);

    if (!existing) {
      merged.set(key, site);
      continue;
    }

    merged.set(key, {
      ...existing,
      tacticalSiteId: existing.tacticalSiteId ?? site.tacticalSiteId,
      isActive: existing.isActive !== false,
    });
  }

  return Array.from(merged.values()).sort((a, b) =>
    a.name.localeCompare(b.name, 'pt-BR'),
  );
}

export async function getSitesForCustomer(
  customerId: string,
): Promise<CustomerSiteListItem[]> {
  const [localSites, operationalSites] = await Promise.all([
    getLocalSites(customerId),
    getOperationalSites(customerId),
  ]);

  return mergeSites(localSites, operationalSites);
}
