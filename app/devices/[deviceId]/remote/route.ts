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
};

function replaceTemplateVariables(
  template: string,
  input: {
    deviceId: string;
    customerId: string;
    hostname: string;
    agentId: string;
  },
): string {
  return template
    .replaceAll('{deviceId}', encodeURIComponent(input.deviceId))
    .replaceAll('{customerId}', encodeURIComponent(input.customerId))
    .replaceAll('{hostname}', encodeURIComponent(input.hostname))
    .replaceAll('{agentId}', encodeURIComponent(input.agentId));
}

function buildRemoteAccessUrl(input: {
  deviceId: string;
  customerId: string;
  hostname: string;
  agentId: string | null;
}): string | null {
  const template = process.env.SAFEOPS_REMOTE_URL_TEMPLATE?.trim();

  if (!template) {
    return null;
  }

  if (!input.agentId) {
    return null;
  }

  return replaceTemplateVariables(template, {
    deviceId: input.deviceId,
    customerId: input.customerId,
    hostname: input.hostname,
    agentId: input.agentId,
  });
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
    .select('id, customer_id, hostname, tactical_agent_id')
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
  });

  if (!remoteUrl) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'Acesso remoto ainda não configurado. Configure SAFEOPS_REMOTE_URL_TEMPLATE na Vercel.',
      },
      { status: 501 },
    );
  }

  return NextResponse.json({
    ok: true,
    url: remoteUrl,
    device: {
      id: data.id,
      hostname: data.hostname,
      customerId: activeCustomer.customerId,
    },
  });
}
