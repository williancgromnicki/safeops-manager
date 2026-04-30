import { type DemoDevice, type OperationalStatus } from '@/lib/demo-data';
import { createClient } from '@/lib/supabase/server';

type DeviceRow = {
  id: string;
  customer_id: string;
  hostname: string;
  site: string | null;
  status: string | null;
  operating_system: string | null;
  last_seen_at: string | null;
  active_alerts: number | null;
  visible_to_customer: boolean;
};

function normalizeStatus(status: string | null): OperationalStatus {
  if (status === 'online') return 'online';
  if (status === 'offline') return 'offline';
  if (status === 'attention') return 'attention';
  return 'unknown';
}

export async function getDevices(customerId: string): Promise<DemoDevice[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from('devices')
    .select(
      'id, customer_id, hostname, site, status, operating_system, last_seen_at, active_alerts, visible_to_customer',
    )
    .eq('customer_id', customerId)
    .eq('visible_to_customer', true)
    .order('hostname', { ascending: true })
    .returns<DeviceRow[]>();

  if (!data?.length) return [];

  return data.map(
    (device): DemoDevice => ({
      id: device.id,
      customerId: device.customer_id,
      name: device.hostname,
      site: device.site ?? 'Não informado',
      status: normalizeStatus(device.status),
      operatingSystem: device.operating_system ?? 'Não informado',
      lastSeen: device.last_seen_at
        ? new Date(device.last_seen_at).toLocaleString('pt-BR')
        : 'Sem informação recente',
      activeAlerts: device.active_alerts ?? 0,
    }),
  );
}
