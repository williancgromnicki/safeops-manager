import { type Severity } from '@/lib/demo-data';
import { createClient } from '@/lib/supabase/server';

export type DeviceAlertHistoryItem = {
  id: string;
  customerId: string;
  deviceId: string | null;
  source: string;
  alertType: string;
  severity: Severity;
  title: string;
  details: string;
  status: string | null;
  occurredAt: string;
  lastSeenAt: string;
  resolvedAt: string;
  occurrenceCount: number;
};

type AlertRow = {
  id: string;
  customer_id: string;
  device_id: string | null;
  source: string | null;
  alert_type: string | null;
  severity: string | null;
  title: string;
  details: string | null;
  status: string | null;
  occurred_at: string | null;
  occurrence_count: number | null;
  last_seen_at: string | null;
  resolved_at: string | null;
};

function normalizeSeverity(severity: string | null): Severity {
  const value = severity?.toLowerCase();

  if (value === 'crit' || value === 'critical' || value === 'high') {
    return 'CRIT';
  }

  if (value === 'warn' || value === 'warning' || value === 'medium') {
    return 'WARN';
  }

  return 'INFO';
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return '—';
  }

  return new Date(value).toLocaleString('pt-BR');
}

export async function getDeviceAlerts(
  customerId: string,
  deviceId: string,
): Promise<DeviceAlertHistoryItem[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from('alerts')
    .select(
      [
        'id',
        'customer_id',
        'device_id',
        'source',
        'alert_type',
        'severity',
        'title',
        'details',
        'status',
        'occurred_at',
        'occurrence_count',
        'last_seen_at',
        'resolved_at',
      ].join(', '),
    )
    .eq('customer_id', customerId)
    .eq('device_id', deviceId)
    .order('status', { ascending: true })
    .order('last_seen_at', { ascending: false, nullsFirst: false })
    .order('occurred_at', { ascending: false })
    .returns<AlertRow[]>();

  if (!data?.length) {
    return [];
  }

  return data.map((alert) => ({
    id: alert.id,
    customerId: alert.customer_id,
    deviceId: alert.device_id,
    source: alert.source ?? 'Origem não informada',
    alertType: alert.alert_type ?? 'Não informado',
    severity: normalizeSeverity(alert.severity),
    title: alert.title,
    details: alert.details ?? 'Sem detalhes adicionais.',
    status: alert.status,
    occurredAt: formatDateTime(alert.occurred_at),
    lastSeenAt: formatDateTime(alert.last_seen_at),
    resolvedAt: formatDateTime(alert.resolved_at),
    occurrenceCount: alert.occurrence_count ?? 1,
  }));
}
