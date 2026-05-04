import { NextRequest, NextResponse } from 'next/server';

import { slugify } from '@/lib/integrations/normalize-alert';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

type IncomingDevice = {
  tactical_agent_id?: string | null;
  hostname?: string | null;
  site?: string | null;
  operating_system?: string | null;
  status?: string | null;
  last_seen_at?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  serial_number?: string | null;
  cpu?: string | null;
  ram_gb?: number | string | null;
  disk_total_gb?: number | string | null;
};

type IncomingPayload = {
  client?: string | null;
  site?: string | null;
  devices?: IncomingDevice[];
};

type DeviceStatus = 'online' | 'offline' | 'attention' | 'unknown';

type ExistingDeviceRow = {
  id: string;
  active_alerts: number | null;
  status: string | null;
  last_seen_at: string | null;
};

type OpenAlertRow = {
  id: string;
  occurrence_count: number | null;
};

type AvailabilityAlertResult = {
  created: number;
  updated: number;
  closed: number;
  alertId?: string;
};

type EmailNotification = {
  kind: 'offline_created' | 'offline_recovered';
  severity: 'INFO' | 'WARN' | 'CRIT';
  subject: string;
  body: string;
  recipients: string[];
  customerId: string;
  deviceId: string;
  alertId?: string;
};

const OFFLINE_ALERT_TYPE = 'availability_offline';
const OFFLINE_ALERT_TITLE = 'Dispositivo offline';

function cleanString(value?: string | null): string | null {
  const cleaned = value?.trim();

  return cleaned ? cleaned : null;
}

function parseDate(value?: string | null): string | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

function parseNumber(value?: number | string | null): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed =
    typeof value === 'number'
      ? value
      : Number(String(value).replace(',', '.'));

  if (Number.isNaN(parsed)) {
    return null;
  }

  return parsed;
}

function normalizeDeviceStatus(status?: string | null): DeviceStatus {
  const normalized = (status ?? '').trim().toLowerCase();

  if (['online', 'ok', 'up', 'ativo', 'active'].includes(normalized)) {
    return 'online';
  }

  if (['offline', 'down', 'inactive', 'inativo'].includes(normalized)) {
    return 'offline';
  }

  if (
    ['attention', 'warning', 'warn', 'alerta', 'atenção'].includes(normalized)
  ) {
    return 'attention';
  }

  return 'unknown';
}

function formatLastSeenForDetails(lastSeenAt: string | null): string {
  if (!lastSeenAt) {
    return 'Sem informação de último check-in.';
  }

  return new Date(lastSeenAt).toLocaleString('pt-BR');
}

function buildOfflineAlertDetails(input: {
  hostname: string;
  clientName: string;
  site: string | null;
  lastSeenAt: string | null;
}): string {
  return [
    `O dispositivo ${input.hostname} está offline no SafeOps Manager.`,
    `Cliente: ${input.clientName}.`,
    `Site: ${input.site ?? 'Não informado'}.`,
    `Último check-in: ${formatLastSeenForDetails(input.lastSeenAt)}.`,
    'Critério atual: dispositivo sem check-in dentro do limite configurado no sync de inventário.',
  ].join('\n');
}

async function assignCustomerToDefaultAdmin(
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>,
  customerId: string,
): Promise<void> {
  const defaultAdminUserId = process.env.SAFEOPS_DEFAULT_ADMIN_USER_ID;

  if (!defaultAdminUserId) {
    console.warn(
      'SAFEOPS_DEFAULT_ADMIN_USER_ID não configurado. Cliente não foi autoatribuído ao admin padrão.',
    );
    return;
  }

  const { data: existingAccess, error: findAccessError } = await supabaseAdmin
    .from('user_customer_access')
    .select('customer_id')
    .eq('user_id', defaultAdminUserId)
    .eq('customer_id', customerId)
    .limit(1)
    .maybeSingle();

  if (findAccessError) {
    console.error(
      'Erro ao verificar vínculo do cliente com admin padrão:',
      findAccessError,
    );
    return;
  }

  if (existingAccess) {
    return;
  }

  const { error: insertAccessError } = await supabaseAdmin
    .from('user_customer_access')
    .insert({
      user_id: defaultAdminUserId,
      customer_id: customerId,
      role: 'admin',
    });

  if (insertAccessError) {
    console.error(
      'Erro ao vincular cliente ao admin padrão:',
      insertAccessError,
    );
  }
}

async function resolveCustomer(
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>,
  clientName: string,
): Promise<string> {
  const { data: customerMatch, error: customerFindError } = await supabaseAdmin
    .from('customers')
    .select('id')
    .eq('name', clientName)
    .limit(1)
    .maybeSingle();

  if (customerFindError) {
    throw new Error(customerFindError.message);
  }

  if (customerMatch?.id) {
    await assignCustomerToDefaultAdmin(
      supabaseAdmin,
      customerMatch.id as string,
    );
    return customerMatch.id as string;
  }

  const { data: newCustomer, error: createCustomerError } = await supabaseAdmin
    .from('customers')
    .insert({
      name: clientName,
      slug: slugify(clientName),
    })
    .select('id')
    .single();

  if (createCustomerError) {
    throw new Error(createCustomerError.message);
  }

  const customerId = newCustomer.id as string;

  await assignCustomerToDefaultAdmin(supabaseAdmin, customerId);

  return customerId;
}

async function findExistingDevice(
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>,
  customerId: string,
  hostname: string,
  tacticalAgentId: string | null,
): Promise<ExistingDeviceRow | null> {
  if (tacticalAgentId) {
    const { data, error } = await supabaseAdmin
      .from('devices')
      .select('id, active_alerts, status, last_seen_at')
      .eq('customer_id', customerId)
      .eq('tactical_agent_id', tacticalAgentId)
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new Error(`Erro ao buscar device por agent id: ${error.message}`);
    }

    if (data) {
      return data as ExistingDeviceRow;
    }
  }

  const { data, error } = await supabaseAdmin
    .from('devices')
    .select('id, active_alerts, status, last_seen_at')
    .eq('customer_id', customerId)
    .eq('hostname', hostname)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Erro ao buscar device por hostname: ${error.message}`);
  }

  return data as ExistingDeviceRow | null;
}

async function findOpenOfflineAlert(
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>,
  customerId: string,
  deviceId: string,
): Promise<OpenAlertRow | null> {
  const { data, error } = await supabaseAdmin
    .from('alerts')
    .select('id, occurrence_count')
    .eq('customer_id', customerId)
    .eq('device_id', deviceId)
    .eq('alert_type', OFFLINE_ALERT_TYPE)
    .eq('status', 'open')
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Erro ao buscar alerta offline aberto: ${error.message}`);
  }

  return data as OpenAlertRow | null;
}

async function createOrUpdateOfflineAlert(input: {
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>;
  customerId: string;
  deviceId: string;
  hostname: string;
  clientName: string;
  site: string | null;
  lastSeenAt: string | null;
  shouldIncrementOccurrence: boolean;
}): Promise<AvailabilityAlertResult> {
  const {
    supabaseAdmin,
    customerId,
    deviceId,
    hostname,
    clientName,
    site,
    lastSeenAt,
    shouldIncrementOccurrence,
  } = input;

  const now = new Date().toISOString();
  const existingAlert = await findOpenOfflineAlert(
    supabaseAdmin,
    customerId,
    deviceId,
  );

  const details = buildOfflineAlertDetails({
    hostname,
    clientName,
    site,
    lastSeenAt,
  });

  if (existingAlert) {
    const nextOccurrenceCount = shouldIncrementOccurrence
      ? (existingAlert.occurrence_count ?? 1) + 1
      : (existingAlert.occurrence_count ?? 1);

    const { error } = await supabaseAdmin
      .from('alerts')
      .update({
        severity: 'CRIT',
        title: OFFLINE_ALERT_TITLE,
        details,
        status: 'open',
        occurrence_count: nextOccurrenceCount,
        last_seen_at: now,
        resolved_at: null,
      })
      .eq('id', existingAlert.id);

    if (error) {
      throw new Error(`Erro ao atualizar alerta offline: ${error.message}`);
    }

    return {
      created: 0,
      updated: 1,
      closed: 0,
    };
  }

  const { error } = await supabaseAdmin.from('alerts').insert({
    customer_id: customerId,
    device_id: deviceId,
    source: 'SafeOps Inventory Sync',
    alert_type: OFFLINE_ALERT_TYPE,
    severity: 'CRIT',
    title: OFFLINE_ALERT_TITLE,
    details,
    status: 'open',
    occurred_at: now,
    occurrence_count: 1,
    last_seen_at: now,
    resolved_at: null,
  });

  if (error) {
    throw new Error(`Erro ao criar alerta offline: ${error.message}`);
  }

  return {
    created: 1,
    updated: 0,
    closed: 0,
  };
}

async function closeOfflineAlert(input: {
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>;
  customerId: string;
  deviceId: string;
}): Promise<AvailabilityAlertResult> {
  const { supabaseAdmin, customerId, deviceId } = input;

  const existingAlert = await findOpenOfflineAlert(
    supabaseAdmin,
    customerId,
    deviceId,
  );

  if (!existingAlert) {
    return {
      created: 0,
      updated: 0,
      closed: 0,
    };
  }

  const now = new Date().toISOString();

  const { error } = await supabaseAdmin
    .from('alerts')
    .update({
      status: 'closed',
      resolved_at: now,
      last_seen_at: now,
    })
    .eq('id', existingAlert.id);

  if (error) {
    throw new Error(`Erro ao fechar alerta offline: ${error.message}`);
  }

  return {
    created: 0,
    updated: 0,
    closed: 1,
  };
}

async function refreshDeviceActiveAlerts(
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>,
  deviceId: string,
): Promise<number> {
  const { count, error: countError } = await supabaseAdmin
    .from('alerts')
    .select('id', { count: 'exact', head: true })
    .eq('device_id', deviceId)
    .eq('status', 'open');

  if (countError) {
    throw new Error(
      `Erro ao recalcular alertas ativos do device: ${countError.message}`,
    );
  }

  const activeAlerts = count ?? 0;

  const { error: updateError } = await supabaseAdmin
    .from('devices')
    .update({
      active_alerts: activeAlerts,
    })
    .eq('id', deviceId);

  if (updateError) {
    throw new Error(
      `Erro ao atualizar contador de alertas ativos: ${updateError.message}`,
    );
  }

  return activeAlerts;
}

async function handleAvailabilityAlert(input: {
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>;
  customerId: string;
  deviceId: string;
  hostname: string;
  clientName: string;
  site: string | null;
  previousStatus: string | null;
  nextStatus: DeviceStatus;
  lastSeenAt: string | null;
}): Promise<AvailabilityAlertResult> {
  const {
    supabaseAdmin,
    customerId,
    deviceId,
    hostname,
    clientName,
    site,
    previousStatus,
    nextStatus,
    lastSeenAt,
  } = input;

  if (nextStatus === 'offline') {
    return createOrUpdateOfflineAlert({
      supabaseAdmin,
      customerId,
      deviceId,
      hostname,
      clientName,
      site,
      lastSeenAt,
      shouldIncrementOccurrence: previousStatus !== 'offline',
    });
  }

  if (previousStatus === 'offline' && nextStatus === 'online') {
    return closeOfflineAlert({
      supabaseAdmin,
      customerId,
      deviceId,
    });
  }

  return {
    created: 0,
    updated: 0,
    closed: 0,
  };
}

export async function POST(request: NextRequest) {
  const token = request.headers.get('x-safeops-webhook-token');
  const supabaseAdmin = getSupabaseAdmin();

  if (!token || token !== process.env.SAFEOPS_WEBHOOK_TOKEN) {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized' },
      { status: 401 },
    );
  }

  let payload: IncomingPayload;

  try {
    payload = (await request.json()) as IncomingPayload;
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Invalid JSON payload' },
      { status: 400 },
    );
  }

  const clientName = cleanString(payload.client);

  if (!clientName) {
    return NextResponse.json(
      { ok: false, error: 'Missing required field: client' },
      { status: 400 },
    );
  }

  if (!Array.isArray(payload.devices) || payload.devices.length === 0) {
    return NextResponse.json(
      { ok: false, error: 'Missing required field: devices' },
      { status: 400 },
    );
  }

  try {
    const customerId = await resolveCustomer(supabaseAdmin, clientName);

    let created = 0;
    let updated = 0;
    let skipped = 0;
    let alertsCreated = 0;
    let alertsUpdated = 0;
    let alertsClosed = 0;

    const deviceResults: Array<{
      hostname: string;
      action: 'created' | 'updated' | 'skipped';
      id?: string;
      reason?: string;
      status?: DeviceStatus;
      activeAlerts?: number;
      availabilityAlert?: AvailabilityAlertResult;
    }> = [];

    for (const incomingDevice of payload.devices) {
      const hostname = cleanString(incomingDevice.hostname);

      if (!hostname) {
        skipped += 1;
        deviceResults.push({
          hostname: 'unknown',
          action: 'skipped',
          reason: 'missing_hostname',
        });
        continue;
      }

      const tacticalAgentId = cleanString(incomingDevice.tactical_agent_id);
      const now = new Date().toISOString();

      const existingDevice = await findExistingDevice(
        supabaseAdmin,
        customerId,
        hostname,
        tacticalAgentId,
      );

      const nextStatus = normalizeDeviceStatus(incomingDevice.status);
      const lastSeenAt = parseDate(incomingDevice.last_seen_at);
      const site = cleanString(incomingDevice.site) ?? cleanString(payload.site);

      const deviceData = {
        customer_id: customerId,
        tactical_agent_id: tacticalAgentId,
        hostname,
        site,
        operating_system: cleanString(incomingDevice.operating_system),
        status: nextStatus,
        last_seen_at: lastSeenAt,
        visible_to_customer: true,
        manufacturer: cleanString(incomingDevice.manufacturer),
        model: cleanString(incomingDevice.model),
        serial_number: cleanString(incomingDevice.serial_number),
        cpu: cleanString(incomingDevice.cpu),
        ram_gb: parseNumber(incomingDevice.ram_gb),
        disk_total_gb: parseNumber(incomingDevice.disk_total_gb),
        last_inventory_at: now,
      };

      if (existingDevice) {
        const { data: updatedDevice, error: updateError } = await supabaseAdmin
          .from('devices')
          .update(deviceData)
          .eq('id', existingDevice.id)
          .select('id')
          .single();

        if (updateError) {
          throw new Error(`Erro ao atualizar ${hostname}: ${updateError.message}`);
        }

        const availabilityAlert = await handleAvailabilityAlert({
          supabaseAdmin,
          customerId,
          deviceId: updatedDevice.id as string,
          hostname,
          clientName,
          site,
          previousStatus: existingDevice.status,
          nextStatus,
          lastSeenAt,
        });

        alertsCreated += availabilityAlert.created;
        alertsUpdated += availabilityAlert.updated;
        alertsClosed += availabilityAlert.closed;

        const activeAlerts = await refreshDeviceActiveAlerts(
          supabaseAdmin,
          updatedDevice.id as string,
        );

        updated += 1;
        deviceResults.push({
          hostname,
          action: 'updated',
          id: updatedDevice.id as string,
          status: nextStatus,
          activeAlerts,
          availabilityAlert,
        });

        continue;
      }

      const { data: createdDevice, error: createError } = await supabaseAdmin
        .from('devices')
        .insert({
          ...deviceData,
          active_alerts: 0,
        })
        .select('id')
        .single();

      if (createError) {
        throw new Error(`Erro ao criar ${hostname}: ${createError.message}`);
      }

      const availabilityAlert = await handleAvailabilityAlert({
        supabaseAdmin,
        customerId,
        deviceId: createdDevice.id as string,
        hostname,
        clientName,
        site,
        previousStatus: null,
        nextStatus,
        lastSeenAt,
      });

      alertsCreated += availabilityAlert.created;
      alertsUpdated += availabilityAlert.updated;
      alertsClosed += availabilityAlert.closed;

      const activeAlerts = await refreshDeviceActiveAlerts(
        supabaseAdmin,
        createdDevice.id as string,
      );

      created += 1;
      deviceResults.push({
        hostname,
        action: 'created',
        id: createdDevice.id as string,
        status: nextStatus,
        activeAlerts,
        availabilityAlert,
      });
    }

    return NextResponse.json({
      ok: true,
      customer_id: customerId,
      received: payload.devices.length,
      created,
      updated,
      skipped,
      alerts_created: alertsCreated,
      alerts_updated: alertsUpdated,
      alerts_closed: alertsClosed,
      devices: deviceResults,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : 'Internal server error',
      },
      { status: 500 },
    );
  }
}
