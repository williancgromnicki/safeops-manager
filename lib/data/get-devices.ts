import { type OperationalStatus } from '@/lib/demo-data';
import { createClient } from '@/lib/supabase/server';

export type DeviceListItem = {
  id: string;
  customerId: string;
  name: string;
  site: string;
  status: OperationalStatus;
  operatingSystem: string;
  lastSeen: string;
  activeAlerts: number;
  manufacturer?: string | null;
  model?: string | null;
  serialNumber?: string | null;
  cpu?: string | null;
  ramGb?: number | null;
  diskTotalGb?: number | null;
  lastInventoryAt?: string | null;
};

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
  manufacturer: string | null;
  model: string | null;
  serial_number: string | null;
  cpu: string | null;
  ram_gb: number | null;
  disk_total_gb: number | null;
  last_inventory_at: string | null;
};

export function normalizeDeviceStatus(status: string | null): OperationalStatus {
  if (status === 'online') return 'online';
  if (status === 'offline') return 'offline';
  if (status === 'attention') return 'attention';

  return 'unknown';
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return 'Sem informação recente';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);
}

export async function getDevices(customerId: string): Promise<DeviceListItem[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from('devices')
    .select(
      [
        'id',
        'customer_id',
        'hostname',
        'site',
        'status',
        'operating_system',
        'last_seen_at',
        'active_alerts',
        'visible_to_customer',
        'manufacturer',
        'model',
        'serial_number',
        'cpu',
        'ram_gb',
        'disk_total_gb',
        'last_inventory_at',
      ].join(', '),
    )
    .eq('customer_id', customerId)
    .eq('visible_to_customer', true)
    .order('hostname', { ascending: true })
    .returns<DeviceRow[]>();

  if (!data?.length) return [];

  return data.map(
    (device): DeviceListItem => ({
      id: device.id,
      customerId: device.customer_id,
      name: device.hostname,
      site: device.site ?? 'Não informado',
      status: normalizeDeviceStatus(device.status),
      operatingSystem: device.operating_system ?? 'Não informado',
      lastSeen: formatDateTime(device.last_seen_at),
      activeAlerts: device.active_alerts ?? 0,
      manufacturer: device.manufacturer,
      model: device.model,
      serialNumber: device.serial_number,
      cpu: device.cpu,
      ramGb: device.ram_gb,
      diskTotalGb: device.disk_total_gb,
      lastInventoryAt: device.last_inventory_at
        ? formatDateTime(device.last_inventory_at)
        : null,
    }),
  );
}
