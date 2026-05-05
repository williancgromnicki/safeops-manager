import { NextRequest, NextResponse } from 'next/server';

import { slugify } from '@/lib/integrations/normalize-alert';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
type JsonObject = {
  [key: string]: JsonValue;
};

type IncomingSoftwareItem = {
  name?: string | null;
  version?: string | null;
  publisher?: string | null;
  install_date?: string | null;
  size?: string | null;
  location?: string | null;
  source?: string | null;
  uninstall?: string | null;
  [key: string]: JsonValue | undefined;
};

type IncomingDeviceSoftware = {
  tactical_agent_id?: string | null;
  hostname?: string | null;
  site?: string | null;
  software?: IncomingSoftwareItem[];
};

type IncomingPayload = {
  client?: string | null;
  site?: string | null;
  devices?: IncomingDeviceSoftware[];
};

type DeviceRow = {
  id: string;
  customer_id: string;
  hostname: string;
  tactical_agent_id: string | null;
};

type NormalizedSoftwareItem = {
  software_name: string;
  software_version: string | null;
  publisher: string | null;
  install_date: string | null;
  size: string | null;
  location: string | null;
  source: string;
  raw: JsonObject;
};

function cleanString(value?: string | null): string | null {
  const cleaned = value?.trim();

  return cleaned ? cleaned : null;
}

function normalizeSoftwareName(value?: string | null): string | null {
  const cleaned = cleanString(value);

  if (!cleaned) {
    return null;
  }

  return cleaned;
}

function normalizeSoftwareItem(
  item: IncomingSoftwareItem,
): NormalizedSoftwareItem | null {
  const softwareName = normalizeSoftwareName(item.name);

  if (!softwareName) {
    return null;
  }

  return {
    software_name: softwareName,
    software_version: cleanString(item.version),
    publisher: cleanString(item.publisher),
    install_date: cleanString(item.install_date),
    size: cleanString(item.size),
    location: cleanString(item.location),
    source: cleanString(item.source) ?? 'Tactical RMM',
    raw: item as JsonObject,
  };
}

function buildSoftwareDedupKey(item: NormalizedSoftwareItem): string {
  return [
    item.software_name.trim().toLowerCase(),
    item.software_version?.trim().toLowerCase() ?? '',
  ].join('::');
}

function deduplicateSoftwareItems(
  items: NormalizedSoftwareItem[],
): NormalizedSoftwareItem[] {
  const unique = new Map<string, NormalizedSoftwareItem>();

  for (const item of items) {
    const key = buildSoftwareDedupKey(item);

    if (!unique.has(key)) {
      unique.set(key, item);
      continue;
    }

    const existing = unique.get(key);

    if (!existing) {
      unique.set(key, item);
      continue;
    }

    unique.set(key, {
      ...existing,
      publisher: existing.publisher ?? item.publisher,
      install_date: existing.install_date ?? item.install_date,
      size: existing.size ?? item.size,
      location: existing.location ?? item.location,
      source: existing.source ?? item.source,
      raw: {
        ...item.raw,
        duplicate_merged: true,
        previous_raw: existing.raw,
      },
    });
  }

  return Array.from(unique.values());
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

  return newCustomer.id as string;
}

async function findDevice(input: {
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>;
  customerId: string;
  hostname: string;
  tacticalAgentId: string | null;
}): Promise<DeviceRow | null> {
  const { supabaseAdmin, customerId, hostname, tacticalAgentId } = input;

  if (tacticalAgentId) {
    const { data, error } = await supabaseAdmin
      .from('devices')
      .select('id, customer_id, hostname, tactical_agent_id')
      .eq('customer_id', customerId)
      .eq('tactical_agent_id', tacticalAgentId)
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new Error(
        `Erro ao buscar dispositivo por agent id: ${error.message}`,
      );
    }

    if (data) {
      return data as DeviceRow;
    }
  }

  const { data, error } = await supabaseAdmin
    .from('devices')
    .select('id, customer_id, hostname, tactical_agent_id')
    .eq('customer_id', customerId)
    .eq('hostname', hostname)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Erro ao buscar dispositivo por hostname: ${error.message}`);
  }

  return data as DeviceRow | null;
}

async function replaceDeviceSoftwareInventory(input: {
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>;
  customerId: string;
  deviceId: string;
  software: IncomingSoftwareItem[];
}) {
  const { supabaseAdmin, customerId, deviceId, software } = input;

  const normalizedItems = software
    .map(normalizeSoftwareItem)
    .filter((item): item is NormalizedSoftwareItem => Boolean(item));

  const uniqueItems = deduplicateSoftwareItems(normalizedItems);

  const duplicatesRemoved = normalizedItems.length - uniqueItems.length;

  const { error: deleteError } = await supabaseAdmin
    .from('device_software_inventory')
    .delete()
    .eq('device_id', deviceId);

  if (deleteError) {
    throw new Error(
      `Erro ao limpar inventário de software: ${deleteError.message}`,
    );
  }

  if (uniqueItems.length === 0) {
    return {
      inserted: 0,
      duplicatesRemoved,
    };
  }

  const now = new Date().toISOString();

  const rows = uniqueItems.map((item) => ({
    customer_id: customerId,
    device_id: deviceId,
    software_name: item.software_name,
    software_version: item.software_version,
    publisher: item.publisher,
    install_date: item.install_date,
    size: item.size,
    location: item.location,
    source: item.source,
    raw: item.raw,
    last_seen_at: now,
  }));

  const chunkSize = 500;
  let inserted = 0;

  for (let index = 0; index < rows.length; index += chunkSize) {
    const chunk = rows.slice(index, index + chunkSize);

    const { error: insertError } = await supabaseAdmin
      .from('device_software_inventory')
      .insert(chunk);

    if (insertError) {
      throw new Error(
        `Erro ao inserir inventário de software: ${insertError.message}`,
      );
    }

    inserted += chunk.length;
  }

  return {
    inserted,
    duplicatesRemoved,
  };
}

export async function POST(request: NextRequest) {
  const token = request.headers.get('x-safeops-webhook-token');
  const supabaseAdmin = getSupabaseAdmin();

  if (!token || token !== process.env.SAFEOPS_WEBHOOK_TOKEN) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Unauthorized',
      },
      { status: 401 },
    );
  }

  let payload: IncomingPayload;

  try {
    payload = (await request.json()) as IncomingPayload;
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: 'Invalid JSON payload',
      },
      { status: 400 },
    );
  }

  const clientName = cleanString(payload.client);

  if (!clientName) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Missing required field: client',
      },
      { status: 400 },
    );
  }

  if (!Array.isArray(payload.devices) || payload.devices.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Missing required field: devices',
      },
      { status: 400 },
    );
  }

  try {
    const customerId = await resolveCustomer(supabaseAdmin, clientName);

    let received = 0;
    let matched = 0;
    let skipped = 0;
    let softwareInserted = 0;
    let duplicatesRemoved = 0;

    const results: Array<{
      hostname: string;
      action: 'updated' | 'skipped';
      deviceId?: string;
      softwareCount?: number;
      duplicatesRemoved?: number;
      reason?: string;
    }> = [];

    for (const incomingDevice of payload.devices) {
      received += 1;

      const hostname = cleanString(incomingDevice.hostname);
      const tacticalAgentId = cleanString(incomingDevice.tactical_agent_id);

      if (!hostname) {
        skipped += 1;
        results.push({
          hostname: 'unknown',
          action: 'skipped',
          reason: 'missing_hostname',
        });
        continue;
      }

      const device = await findDevice({
        supabaseAdmin,
        customerId,
        hostname,
        tacticalAgentId,
      });

      if (!device) {
        skipped += 1;
        results.push({
          hostname,
          action: 'skipped',
          reason: 'device_not_found_in_safeops',
        });
        continue;
      }

      const software = Array.isArray(incomingDevice.software)
        ? incomingDevice.software
        : [];

      const replaceResult = await replaceDeviceSoftwareInventory({
        supabaseAdmin,
        customerId,
        deviceId: device.id,
        software,
      });

      matched += 1;
      softwareInserted += replaceResult.inserted;
      duplicatesRemoved += replaceResult.duplicatesRemoved;

      results.push({
        hostname,
        action: 'updated',
        deviceId: device.id,
        softwareCount: replaceResult.inserted,
        duplicatesRemoved: replaceResult.duplicatesRemoved,
      });
    }

    return NextResponse.json({
      ok: true,
      customer_id: customerId,
      received,
      matched,
      skipped,
      software_inserted: softwareInserted,
      duplicates_removed: duplicatesRemoved,
      devices: results,
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
