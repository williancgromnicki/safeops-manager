import { NextRequest, NextResponse } from 'next/server';

import {
  isAvailabilityCheck,
  normalizeSeverity,
  normalizeStatus,
  slugify,
} from '@/lib/integrations/normalize-alert';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

type IncomingPayload = {
  occurred_at?: string;
  site?: string;
  severity?: string;
  hostname?: string;
  check_type?: string;
  client?: string;
  details?: string;
  check_name?: string;
  status?: string;
};

function parseOccurredAt(occurredAt?: string): string {
  const date = occurredAt ? new Date(occurredAt) : new Date();
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function buildFingerprint(payload: IncomingPayload, customerId: string): string {
  const hostname = (payload.hostname ?? '').trim().toLowerCase();
  const checkType = (payload.check_type ?? '').trim().toLowerCase();
  const checkName = (payload.check_name ?? '').trim().toLowerCase();

  if (hostname && checkType && checkName) {
    return `${customerId}::${hostname}::${checkType}::${checkName}`;
  }

  const alertType = checkType || 'unknown';
  const title = (payload.check_name ?? 'Alerta operacional').trim().toLowerCase();
  return `${hostname}::${alertType}::${title}`;
}

export async function POST(request: NextRequest) {
  const token = request.headers.get('x-safeops-webhook-token');
  const supabaseAdmin = getSupabaseAdmin();

  if (!token || token !== process.env.SAFEOPS_WEBHOOK_TOKEN) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  let payload: IncomingPayload;

  try {
    payload = (await request.json()) as IncomingPayload;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON payload' }, { status: 400 });
  }

  if (!payload.client || !payload.hostname) {
    return NextResponse.json(
      { ok: false, error: 'Missing required fields: client and hostname' },
      { status: 400 },
    );
  }

  const occurredAt = parseOccurredAt(payload.occurred_at);
  const severity = normalizeSeverity(payload.severity ?? payload.status);
  const normalizedStatus = normalizeStatus(payload.status);
  const isOfflineCheck = isAvailabilityCheck(payload.check_type) && severity === 'CRIT';

  const { data: customerMatch, error: customerFindError } = await supabaseAdmin
    .from('customers')
    .select('id, name')
    .eq('name', payload.client)
    .limit(1)
    .maybeSingle();

  if (customerFindError) {
    return NextResponse.json({ ok: false, error: customerFindError.message }, { status: 500 });
  }

  let customerId = customerMatch?.id as string | undefined;

  if (!customerId) {
    const { data: newCustomer, error: createCustomerError } = await supabaseAdmin
      .from('customers')
      .insert({
        name: payload.client,
        slug: slugify(payload.client),
      })
      .select('id')
      .single();

    if (createCustomerError) {
      return NextResponse.json({ ok: false, error: createCustomerError.message }, { status: 500 });
    }

    customerId = newCustomer.id as string;
  }

  const { data: deviceMatch, error: deviceFindError } = await supabaseAdmin
    .from('devices')
    .select('id, status')
    .eq('customer_id', customerId)
    .eq('hostname', payload.hostname)
    .limit(1)
    .maybeSingle();

  if (deviceFindError) {
    return NextResponse.json({ ok: false, error: deviceFindError.message }, { status: 500 });
  }

  let deviceId = deviceMatch?.id as string | undefined;

  if (!deviceId) {
    const initialStatus = isOfflineCheck ? 'offline' : 'attention';

    const { data: newDevice, error: createDeviceError } = await supabaseAdmin
      .from('devices')
      .insert({
        customer_id: customerId,
        hostname: payload.hostname,
        site: payload.site,
        status: initialStatus,
        last_seen_at: occurredAt,
        active_alerts: 1,
        visible_to_customer: true,
      })
      .select('id')
      .single();

    if (createDeviceError) {
      return NextResponse.json({ ok: false, error: createDeviceError.message }, { status: 500 });
    }

    deviceId = newDevice.id as string;
  }

  const alertType = payload.check_type ?? 'operational';
  const title = payload.check_name ?? 'Alerta operacional';
  const fingerprint = buildFingerprint(payload, customerId);

  let alertRecord: { id: string } | null = null;
  let action: 'created' | 'updated' | 'closed' | 'closed_without_open_alert';

  if (normalizedStatus === 'open') {
    const { data: existingOpenAlert, error: existingOpenAlertError } = await supabaseAdmin
      .from('alerts')
      .select('id, occurrence_count')
      .eq('customer_id', customerId)
      .eq('device_id', deviceId)
      .eq('fingerprint', fingerprint)
      .eq('status', 'open')
      .limit(1)
      .maybeSingle();

    if (existingOpenAlertError) {
      return NextResponse.json({ ok: false, error: existingOpenAlertError.message }, { status: 500 });
    }

    if (existingOpenAlert) {
      const { data: updatedAlert, error: updateAlertError } = await supabaseAdmin
        .from('alerts')
        .update({
          severity,
          title,
          details: payload.details,
          alert_type: alertType,
          occurred_at: occurredAt,
          last_seen_at: occurredAt,
          occurrence_count: (existingOpenAlert.occurrence_count ?? 0) + 1,
          resolved_at: null,
        })
        .eq('id', existingOpenAlert.id)
        .select('id')
        .single();

      if (updateAlertError) {
        return NextResponse.json({ ok: false, error: updateAlertError.message }, { status: 500 });
      }

      alertRecord = updatedAlert;
      action = 'updated';
    } else {
      const { data: createdAlert, error: createAlertError } = await supabaseAdmin
        .from('alerts')
        .insert({
          customer_id: customerId,
          device_id: deviceId,
          source: 'safeops-webhook',
          alert_type: alertType,
          severity,
          title,
          details: payload.details,
          status: 'open',
          fingerprint,
          occurrence_count: 1,
          occurred_at: occurredAt,
          last_seen_at: occurredAt,
        })
        .select('id')
        .single();

      if (createAlertError) {
        return NextResponse.json({ ok: false, error: createAlertError.message }, { status: 500 });
      }

      alertRecord = createdAlert;
      action = 'created';
    }
  } else {
    const { data: existingOpenAlert, error: existingOpenAlertError } = await supabaseAdmin
      .from('alerts')
      .select('id')
      .eq('customer_id', customerId)
      .eq('device_id', deviceId)
      .eq('fingerprint', fingerprint)
      .eq('status', 'open')
      .limit(1)
      .maybeSingle();

    if (existingOpenAlertError) {
      return NextResponse.json({ ok: false, error: existingOpenAlertError.message }, { status: 500 });
    }

    const resolutionMessage = payload.details
      ? `Alerta normalizado/resolvido. ${payload.details}`
      : 'Alerta normalizado/resolvido.';

    if (existingOpenAlert) {
      const { data: closedAlert, error: closeAlertError } = await supabaseAdmin
        .from('alerts')
        .update({
          status: 'closed',
          severity: 'INFO',
          resolved_at: occurredAt,
          last_seen_at: occurredAt,
          details: resolutionMessage,
          occurred_at: occurredAt,
          title,
          alert_type: alertType,
        })
        .eq('id', existingOpenAlert.id)
        .select('id')
        .single();

      if (closeAlertError) {
        return NextResponse.json({ ok: false, error: closeAlertError.message }, { status: 500 });
      }

      alertRecord = closedAlert;
      action = 'closed';
    } else {
      const { data: closedWithoutOpenAlert, error: createClosedAlertError } = await supabaseAdmin
        .from('alerts')
        .insert({
          customer_id: customerId,
          device_id: deviceId,
          source: 'safeops-webhook',
          alert_type: alertType,
          severity: 'INFO',
          title,
          details: resolutionMessage,
          status: 'closed',
          fingerprint,
          occurrence_count: 1,
          occurred_at: occurredAt,
          last_seen_at: occurredAt,
          resolved_at: occurredAt,
        })
        .select('id')
        .single();

      if (createClosedAlertError) {
        return NextResponse.json({ ok: false, error: createClosedAlertError.message }, { status: 500 });
      }

      alertRecord = closedWithoutOpenAlert;
      action = 'closed_without_open_alert';
    }
  }

  const { count: openAlerts, error: openCountError } = await supabaseAdmin
    .from('alerts')
    .select('*', { count: 'exact', head: true })
    .eq('device_id', deviceId)
    .eq('status', 'open');

  if (openCountError) {
    return NextResponse.json({ ok: false, error: openCountError.message }, { status: 500 });
  }

  const hasOpenAlerts = (openAlerts ?? 0) > 0;
  const nextDeviceStatus = hasOpenAlerts
    ? isOfflineCheck
      ? 'offline'
      : 'attention'
    : 'unknown';

  const { error: updateDeviceError } = await supabaseAdmin
    .from('devices')
    .update({
      last_seen_at: occurredAt,
      active_alerts: openAlerts ?? 0,
      status: nextDeviceStatus,
    })
    .eq('id', deviceId);

  if (updateDeviceError) {
    return NextResponse.json({ ok: false, error: updateDeviceError.message }, { status: 500 });
  }

  const { data: activeContacts, error: contactsReadError } = await supabaseAdmin
    .from('customer_alert_contacts')
    .select('email, receives_info, receives_warn, receives_crit')
    .eq('customer_id', customerId)
    .eq('is_active', true);

  if (contactsReadError) {
    return NextResponse.json({ ok: false, error: contactsReadError.message }, { status: 500 });
  }

  const filteredContactEmails = (activeContacts ?? [])
    .filter((contact) => {
      if (severity === 'INFO') return contact.receives_info === true;
      if (severity === 'WARN') return contact.receives_warn === true;
      return contact.receives_crit === true;
    })
    .map((contact) => contact.email);

  const emailRecipients = Array.from(
    new Set(
      [...filteredContactEmails, 'suporte@safesys.net.br']
        .map((email) => email?.trim().toLowerCase())
        .filter((email): email is string => Boolean(email)),
    ),
  );

  return NextResponse.json({
    ok: true,
    customer_id: customerId,
    device_id: deviceId,
    alert_id: alertRecord.id,
    email_recipients: emailRecipients,
    action,
  });
}
