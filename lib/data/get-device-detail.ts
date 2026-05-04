import { type OperationalStatus } from '@/lib/demo-data';
import { createClient } from '@/lib/supabase/server';
import { normalizeDeviceStatus } from '@/lib/data/get-devices';

export type DeviceDetail = {
  id: string;
  customerId: string;
  name: string;
  site: string;
  status: OperationalStatus;
  operatingSystem: string;
  lastSeen: string;
  lastInventoryAt: string;
  activeAlerts: number;
  manufacturer: string;
  model: string;
  serialNumber: string;
  cpu: string;
  ramGb: number | null;
  diskTotalGb: number | null;
};

type DeviceDetailRow = {
  id: string;
  customer_id: string;
  hostname: string;
  site: string | null;
  status: string | null;
  operating_system: string | null;
  last_seen_at: string | null;
  active_alerts: number | null;
  manufacturer: string | null;
  model: string | null;
  serial_number: string | null;
  cpu: string | null;
  ram_gb: number | null;
  disk_total_gb: number | null;
  last_inventory_at: string | null;
};

function formatDateTime(value: string | null): string {
  if (!value) {
    return 'Sem informação';
  }

  return new Date(value).toLocaleString('pt-BR');
}

export async function getDeviceDetail(
  customerId: string,
  deviceId: string,
): Promise<DeviceDetail | null> {
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
    .eq('id', deviceId)
    .eq('visible_to_customer', true)
    .maybeSingle<DeviceDetailRow>();

  if (!data) {
    return null;
  }

  return {
    id: data.id,
    customerId: data.customer_id,
    name: data.hostname,
    site: data.site ?? 'Não informado',
    status: normalizeDeviceStatus(data.status),
    operatingSystem: data.operating_system ?? 'Não informado',
    lastSeen: formatDateTime(data.last_seen_at),
    lastInventoryAt: formatDateTime(data.last_inventory_at),
    activeAlerts: data.active_alerts ?? 0,
    manufacturer: data.manufacturer ?? 'Não informado',
    model: data.model ?? 'Não informado',
    serialNumber: data.serial_number ?? 'Não informado',
    cpu: data.cpu ?? 'Não informado',
    ramGb: data.ram_gb,
    diskTotalGb: data.disk_total_gb,
  };
}
