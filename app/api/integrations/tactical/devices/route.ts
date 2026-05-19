import { NextRequest, NextResponse } from 'next/server';

import { slugify } from '@/lib/integrations/normalize-alert';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
type JsonObject = {
  [key: string]: JsonValue;
};

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
  hardware_inventory?: JsonObject | null;
  inventory_source?: string | null;
  inventory_version?: string | null;
  mesh_node_id?: string | null;
  remote_access_url?: string | null;
  remote_access_synced_at?: string | null;
};

type IncomingPayload = {
  client?: string | null;
  site?: string | null;
  devices?: IncomingDevice[];
};

type DeviceStatus = 'online' | 'offline' | 'attention' | 'unknown';
type AlertSeverity = 'INFO' | 'WARN' | 'CRIT';

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
  severity: AlertSeverity;
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

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeHardwareInventory(
  incomingDevice: IncomingDevice,
  clientName: string,
  site: string | null,
  lastSeenAt: string | null,
): JsonObject {
  const providedInventory = isJsonObject(incomingDevice.hardware_inventory)
    ? incomingDevice.hardware_inventory
    : {};

  const identification =
    isJsonObject(providedInventory.identification)
      ? providedInventory.identification
      : {};

  const cpu = isJsonObject(providedInventory.cpu) ? providedInventory.cpu : {};
  const memory = isJsonObject(providedInventory.memory)
    ? providedInventory.memory
    : {};
  const storage = isJsonObject(providedInventory.storage)
    ? providedInventory.storage
    : {};
  const network = isJsonObject(providedInventory.network)
    ? providedInventory.network
    : {};
  const operatingSystem = isJsonObject(providedInventory.operatingSystem)
    ? providedInventory.operatingSystem
    : {};

  const graphics = Array.isArray(providedInventory.graphics)
    ? providedInventory.graphics
    : [];

  const hostname = cleanString(incomingDevice.hostname);
  const manufacturer = cleanString(incomingDevice.manufacturer);
  const model = cleanString(incomingDevice.model);
  const serialNumber = cleanString(incomingDevice.serial_number);
  const operatingSystemName = cleanString(incomingDevice.operating_system);
  const cpuName = cleanString(incomingDevice.cpu);
  const ramGb = parseNumber(incomingDevice.ram_gb);
  const diskTotalGb = parseNumber(incomingDevice.disk_total_gb);

  return {
    ...providedInventory,

    identification: {
      hostname,
      client: clientName,
      site,
      manufacturer,
      model,
      serial_number: serialNumber,
      last_seen_at: lastSeenAt,
      ...identification,
    },

    cpu: {
      name: cpuName,
      ...cpu,
    },

    memory: {
      total_gb: ramGb,
      ...memory,
    },

    storage: {
      summary: {
        total_gb: diskTotalGb,
      },
      physical_disks: [],
      volumes: [],
      ...storage,
    },

    network: {
      adapters: [],
      ...network,
    },

    graphics,

    operatingSystem: {
      name: operatingSystemName,
      ...operatingSystem,
    },
  };
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

function buildOfflineEmailSubject(input: {
  hostname: string;
  clientName: string;
}): string {
  return `[SafeOps][CRIT] Dispositivo offline - ${input.hostname} - ${input.clientName}`;
}

function buildOfflineEmailBody(input: {
  hostname: string;
  clientName: string;
  site: string | null;
  lastSeenAt: string | null;
  details: string;
}): string {
  return [
    'Alerta crítico de disponibilidade detectado pelo SafeOps Manager.',
    '',
    `Cliente: ${input.clientName}`,
    `Dispositivo: ${input.hostname}`,
    `Site: ${input.site ?? 'Não informado'}`,
    `Último check-in: ${formatLastSeenForDetails(input.lastSeenAt)}`,
    '',
    'Detalhes:',
    input.details,
    '',
    'Critério atual: dispositivo sem check-in há mais de 15 minutos no inventário sincronizado do SafeOps.',
  ].join('\n');
}

function buildRecoveryEmailSubject(input: {
  hostname: string;
  clientName: string;
}): string {
  return `[SafeOps][OK] Dispositivo voltou online - ${input.hostname} - ${input.clientName}`;
}

function buildRecoveryEmailBody(input: {
  hostname: string;
  clientName: string;
  site: string | null;
  lastSeenAt: string | null;
}): string {
  return [
    'Recuperação de disponibilidade detectada pelo SafeOps Manager.',
    '',
    `Cliente: ${input.clientName}`,
    `Dispositivo: ${input.hostname}`,
    `Site: ${input.site ?? 'Não informado'}`,
    `Último check-in: ${formatLastSeenForDetails(input.lastSeenAt)}`,
    '',
    'O alerta automático de dispositivo offline foi encerrado porque o equipamento voltou a aparecer como online no inventário sincronizado do SafeOps.',
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

async function getAlertRecipients(
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>,
  customerId: string,
  severity: AlertSeverity,
): Promise<string[]> {
  const { data: activeContacts, error } = await supabaseAdmin
    .from('customer_alert_contacts')
    .select('email, receives_info, receives_warn, receives_crit')
    .eq('customer_id', customerId)
    .eq('is_active', true);

  if (error) {
    throw new Error(`Erro ao buscar contatos de alerta: ${error.message}`);
  }

  const filteredContactEmails = (activeContacts ?? [])
    .filter((contact) => {
      if (severity === 'INFO') return contact.receives_info === true;
      if (severity === 'WARN') return contact.receives_warn === true;

      return contact.receives_crit === true;
    })
    .map((contact) => contact.email);

  return Array.from(
    new Set(
      [...filteredContactEmails, 'suporte@safesys.net.br']
        .map((email) => email?.trim().toLowerCase())
        .filter((email): email is string => Boolean(email)),
    ),
  );
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
      alertId: existingAlert.id,
    };
  }

  const { data: createdAlert, error } = await supabaseAdmin
    .from('alerts')
    .insert({
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
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`Erro ao criar alerta offline: ${error.message}`);
  }

  return {
    created: 1,
    updated: 0,
    closed: 0,
    alertId: createdAlert.id as string,
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
    alertId: existingAlert.id,
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

async function buildEmailNotification(input: {
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>;
  customerId: string;
  deviceId: string;
  alertId?: string;
  hostname: string;
  clientName: string;
  site: string | null;
  lastSeenAt: string | null;
  availabilityAlert: AvailabilityAlertResult;
}): Promise<EmailNotification | null> {
  const {
    supabaseAdmin,
    customerId,
    deviceId,
    alertId,
    hostname,
    clientName,
    site,
    lastSeenAt,
    availabilityAlert,
  } = input;

  if (availabilityAlert.created > 0) {
    const recipients = await getAlertRecipients(
      supabaseAdmin,
      customerId,
      'CRIT',
    );

    const details = buildOfflineAlertDetails({
      hostname,
      clientName,
      site,
      lastSeenAt,
    });

    return {
      kind: 'offline_created',
      severity: 'CRIT',
      subject: buildOfflineEmailSubject({
        hostname,
        clientName,
      }),
      body: buildOfflineEmailBody({
        hostname,
        clientName,
        site,
        lastSeenAt,
        details,
      }),
      recipients,
      customerId,
      deviceId,
      alertId,
    };
  }

  if (availabilityAlert.closed > 0) {
    const recipients = await getAlertRecipients(
      supabaseAdmin,
      customerId,
      'INFO',
    );

    return {
      kind: 'offline_recovered',
      severity: 'INFO',
      subject: buildRecoveryEmailSubject({
        hostname,
        clientName,
      }),
      body: buildRecoveryEmailBody({
        hostname,
        clientName,
        site,
        lastSeenAt,
      }),
      recipients,
      customerId,
      deviceId,
      alertId,
    };
  }

  return null;
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

    const emailNotifications: EmailNotification[] = [];

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
      const meshNodeId = cleanString(incomingDevice.mesh_node_id);
      const remoteAccessUrl = cleanString(incomingDevice.remote_access_url);
      const now = new Date().toISOString();

      const remoteAccessSyncedAt =
        parseDate(incomingDevice.remote_access_synced_at) ??
        (meshNodeId || remoteAccessUrl ? now : null);

      const existingDevice = await findExistingDevice(
        supabaseAdmin,
        customerId,
        hostname,
        tacticalAgentId,
      );

      const nextStatus = normalizeDeviceStatus(incomingDevice.status);
      const lastSeenAt = parseDate(incomingDevice.last_seen_at);
      const site = cleanString(incomingDevice.site) ?? cleanString(payload.site);

      const hardwareInventory = normalizeHardwareInventory(
        incomingDevice,
        clientName,
        site,
        lastSeenAt,
      );

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
        hardware_inventory: hardwareInventory,
        inventory_source:
          cleanString(incomingDevice.inventory_source) ??
          'SafeOps Inventory Sync',
        inventory_version:
          cleanString(incomingDevice.inventory_version) ?? '1.0',
        mesh_node_id: meshNodeId,
        remote_access_url: remoteAccessUrl,
        remote_access_synced_at: remoteAccessSyncedAt,
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

        const deviceId = updatedDevice.id as string;

        const availabilityAlert = await handleAvailabilityAlert({
          supabaseAdmin,
          customerId,
          deviceId,
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

        const emailNotification = await buildEmailNotification({
          supabaseAdmin,
          customerId,
          deviceId,
          alertId: availabilityAlert.alertId,
          hostname,
          clientName,
          site,
          lastSeenAt,
          availabilityAlert,
        });

        if (emailNotification) {
          emailNotifications.push(emailNotification);
        }

        const activeAlerts = await refreshDeviceActiveAlerts(
          supabaseAdmin,
          deviceId,
        );

        updated += 1;
        deviceResults.push({
          hostname,
          action: 'updated',
          id: deviceId,
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

      const deviceId = createdDevice.id as string;

      const availabilityAlert = await handleAvailabilityAlert({
        supabaseAdmin,
        customerId,
        deviceId,
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

      const emailNotification = await buildEmailNotification({
        supabaseAdmin,
        customerId,
        deviceId,
        alertId: availabilityAlert.alertId,
        hostname,
        clientName,
        site,
        lastSeenAt,
        availabilityAlert,
      });

      if (emailNotification) {
        emailNotifications.push(emailNotification);
      }

      const activeAlerts = await refreshDeviceActiveAlerts(
        supabaseAdmin,
        deviceId,
      );

      created += 1;
      deviceResults.push({
        hostname,
        action: 'created',
        id: deviceId,
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
      email_notifications: emailNotifications,
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
