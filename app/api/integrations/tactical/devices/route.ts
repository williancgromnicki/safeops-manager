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

type ExistingDeviceRow = {
  id: string;
  active_alerts: number | null;
};

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

function normalizeDeviceStatus(status?: string | null): 'online' | 'offline' | 'attention' | 'unknown' {
  const normalized = (status ?? '').trim().toLowerCase();

  if (['online', 'ok', 'up', 'ativo', 'active'].includes(normalized)) {
    return 'online';
  }

  if (['offline', 'down', 'inactive', 'inativo'].includes(normalized)) {
    return 'offline';
  }

  if (['attention', 'warning', 'warn', 'alerta', 'atenção'].includes(normalized)) {
    return 'attention';
  }

  return 'unknown';
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
    await assignCustomerToDefaultAdmin(supabaseAdmin, customerMatch.id as string);
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
      .select('id, active_alerts')
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
    .select('id, active_alerts')
    .eq('customer_id', customerId)
    .eq('hostname', hostname)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Erro ao buscar device por hostname: ${error.message}`);
  }

  return data as ExistingDeviceRow | null;
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

    const deviceResults: Array<{
      hostname: string;
      action: 'created' | 'updated' | 'skipped';
      id?: string;
      reason?: string;
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

      const deviceData = {
        customer_id: customerId,
        tactical_agent_id: tacticalAgentId,
        hostname,
        site: cleanString(incomingDevice.site) ?? cleanString(payload.site),
        operating_system: cleanString(incomingDevice.operating_system),
        status: normalizeDeviceStatus(incomingDevice.status),
        last_seen_at: parseDate(incomingDevice.last_seen_at),
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

        updated += 1;
        deviceResults.push({
          hostname,
          action: 'updated',
          id: updatedDevice.id as string,
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

      created += 1;
      deviceResults.push({
        hostname,
        action: 'created',
        id: createdDevice.id as string,
      });
    }

    return NextResponse.json({
      ok: true,
      customer_id: customerId,
      received: payload.devices.length,
      created,
      updated,
      skipped,
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
