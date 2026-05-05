import { NextRequest, NextResponse } from 'next/server';

import { resolveCurrentCustomer } from '@/lib/data/get-current-customer';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type RemoteRouteContext = {
  params: Promise<{
    deviceId: string;
  }>;
};

type DeviceRemoteRow = {
  id: string;
  customer_id: string;
  hostname: string;
  tactical_agent_id: string | null;
  mesh_node_id: string | null;
  remote_access_url: string | null;
};

function cleanString(value?: string | null): string | null {
  const cleaned = value?.trim();

  return cleaned ? cleaned : null;
}

function replaceTemplateVariables(
  template: string,
  input: {
    deviceId: string;
    customerId: string;
    hostname: string;
    agentId: string | null;
    meshNodeId: string | null;
  },
): string {
  return template
    .replaceAll('{deviceId}', encodeURIComponent(input.deviceId))
    .replaceAll('{customerId}', encodeURIComponent(input.customerId))
    .replaceAll('{hostname}', encodeURIComponent(input.hostname))
    .replaceAll('{agentId}', encodeURIComponent(input.agentId ?? ''))
    .replaceAll('{meshNodeId}', encodeURIComponent(input.meshNodeId ?? ''))
    .replaceAll('{mesh_node_id}', encodeURIComponent(input.meshNodeId ?? ''));
}

function buildRemoteAccessUrl(input: {
  deviceId: string;
  customerId: string;
  hostname: string;
  agentId: string | null;
  meshNodeId: string | null;
  remoteAccessUrl: string | null;
}): string {
  const savedRemoteAccessUrl = cleanString(input.remoteAccessUrl);

  if (savedRemoteAccessUrl) {
    return savedRemoteAccessUrl;
  }

  const template =
    process.env.SAFEOPS_REMOTE_URL_TEMPLATE?.trim() ??
    'https://central.safesys.net.br/?viewmode=11&gotonode={meshNodeId}';

  if (input.meshNodeId) {
    return replaceTemplateVariables(template, input);
  }

  return 'https://central.safesys.net.br';
}

export async function POST(
  request: NextRequest,
  context: RemoteRouteContext,
) {
  const { deviceId } = await context.params;
  const requestedCustomerId = request.nextUrl.searchParams.get('customerId');

  const customerContext = await resolveCurrentCustomer(requestedCustomerId);

  if (!customerContext) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Usuário não autenticado.',
      },
      { status: 401 },
    );
  }

  const activeCustomer = customerContext.activeCustomer;

  if (!activeCustomer) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Nenhum cliente vinculado ao usuário.',
      },
      { status: 403 },
    );
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from('devices')
    .select(
      'id, customer_id, hostname, tactical_agent_id, mesh_node_id, remote_access_url',
    )
    .eq('id', deviceId)
    .eq('customer_id', activeCustomer.customerId)
    .eq('visible_to_customer', true)
    .maybeSingle<DeviceRemoteRow>();

  if (error) {
    return NextResponse.json(
      {
        ok: false,
        error: `Erro ao localizar dispositivo: ${error.message}`,
      },
      { status: 500 },
    );
  }

  if (!data) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'Dispositivo não encontrado ou não pertence ao cliente vinculado ao usuário.',
      },
      { status: 404 },
    );
  }

  const remoteUrl = buildRemoteAccessUrl({
    deviceId: data.id,
    customerId: activeCustomer.customerId,
    hostname: data.hostname,
    agentId: data.tactical_agent_id,
    meshNodeId: data.mesh_node_id,
    remoteAccessUrl: data.remote_access_url,
  });

  return NextResponse.json({
    ok: true,
    url: remoteUrl,
    device: {
      id: data.id,
      hostname: data.hostname,
      customerId: activeCustomer.customerId,
      hasMeshNodeId: Boolean(data.mesh_node_id),
      hasRemoteAccessUrl: Boolean(data.remote_access_url),
    },
  });
}
