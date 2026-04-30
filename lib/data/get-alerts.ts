import { type DemoAlert, type Severity } from '@/lib/demo-data';
import { createClient } from '@/lib/supabase/server';

export type AlertItem = DemoAlert & {
  status?: string | null;
  occurrenceCount?: number | null;
  lastSeenAt?: string | null;
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
  occurred_at: string;
  occurrence_count: number | null;
  last_seen_at: string | null;
};

function normalizeSeverity(severity: string | null): Severity {
  const value = severity?.toLowerCase();

  if (value === 'crit' || value === 'critical' || value === 'high') return 'CRIT';
  if (value === 'warn' || value === 'warning' || value === 'medium') return 'WARN';
  return 'INFO';
}

export async function getAlerts(customerId: string): Promise<AlertItem[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from('alerts')
    .select(
      'id, customer_id, device_id, source, alert_type, severity, title, details, status, occurred_at, occurrence_count, last_seen_at',
    )
    .eq('customer_id', customerId)
    .order('status', { ascending: true })
    .order('last_seen_at', { ascending: false, nullsFirst: false })
    .order('occurred_at', { ascending: false })
    .returns<AlertRow[]>();

  if (!data?.length) return [];

  return data.map(
    (alert): AlertItem => ({
      id: alert.id,
      customerId: alert.customer_id,
      source: alert.source ?? alert.device_id ?? 'Origem não informada',
      severity: normalizeSeverity(alert.severity),
      title: alert.title,
      status: alert.status,
      occurrenceCount: alert.occurrence_count,
      lastSeenAt: alert.last_seen_at,
    }),
  );
}
