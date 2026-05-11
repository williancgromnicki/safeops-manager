import { NextRequest, NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import {
  fetchTrmmAgentsByClient,
  fetchTrmmWindowsUpdatesByAgent,
  findTrmmClientIdByName,
  triggerTrmmWindowsUpdateInstall,
  triggerTrmmWindowsUpdateScan,
  updateTrmmWindowsUpdateAction,
  type TrmmWindowsUpdateAction,
} from '@/lib/trmm/windows-updates';

export const dynamic = 'force-dynamic';

type AccessRow = {
  customer_id: string;
  role: string;
};

type CustomerRow = {
  id: string;
  name: string;
  tactical_client_id: number | null;
};

type AgentRow = {
  agent_id: string;
  hostname: string;
  site_name?: string | null;
};

type DeviceRow = {
  id: string;
  customer_id: string;
  hostname: string;
};

type WindowsUpdateActionPayload = {
  customerId?: string;
  agentId?: string;
  updateId?: number;
  action?:
    | 'scan'
    | 'install-approved'
    | 'approve-update'
    | 'ignore-update'
    | 'reset-update';
  deviceType?: 'server' | 'workstation';
  confirmationUsed?: boolean;
  hostnameConfirmed?: string;
};

function cleanString(value?: string | null): string | null {
  const cleaned = value?.trim();

  return cleaned ? cleaned : null;
}

function normalizeRole(role?: string | null): string {
  return cleanString(role)?.toLowerCase() ?? '';
}

function normalize(value?: string | null): string {
  return (value ?? '').trim().toLowerCase();
}

function inferDeviceType(input: {
  payloadDeviceType?: 'server' | 'workstation';
  agent: AgentRow;
}): 'server' | 'workstation' {
  if (
    input.payloadDeviceType === 'server' ||
    input.payloadDeviceType === 'workstation'
  ) {
    return input.payloadDeviceType;
  }

  const hostname = normalize(input.agent.hostname);

  if (
    hostname.startsWith('srv-') ||
    hostname.includes('-srv-')
  ) {
    return 'server';
  }

  return 'workstation';
}

async function getAuthenticatedUser() {
  const supabase = await createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    const message = error.message.toLowerCase();

    if (
      message.includes('auth session missing') ||
      message.includes('session missing') ||
      message.includes('jwt')
    ) {
      return null;
    }

    throw new Error(`Erro ao validar usuário autenticado: ${error.message}`);
  }

  return user ?? null;
}

async function getUserAccessRows(userId: string): Promise<AccessRow[]> {
  const supabaseAdmin = getSupabaseAdmin();

  const { data, error } = await supabaseAdmin
    .from('user_customer_access')
    .select('customer_id, role')
    .eq('user_id', userId);

  if (error) {
    throw new Error(`Erro ao buscar permissões do usuário: ${error.message}`);
  }

  return ((data ?? []) as unknown as AccessRow[]).map((row) => ({
    customer_id: row.customer_id,
    role: normalizeRole(row.role),
  }));
}

function isSafesysAdmin(accessRows: AccessRow[]): boolean {
  return accessRows.some((row) => row.role === 'admin');
}

function canAccessCustomer(input: {
  accessRows: AccessRow[];
  customerId: string;
}) {
  if (isSafesysAdmin(input.accessRows)) {
    return true;
  }

  return input.accessRows.some((row) => row.customer_id === input.customerId);
}

async function getCustomer(customerId: string): Promise<CustomerRow | null> {
  const supabaseAdmin = getSupabaseAdmin();

  const { data, error } = await supabaseAdmin
    .from('customers')
    .select('id, name, tactical_client_id')
    .eq('id', customerId)
    .maybeSingle();

  if (error) {
    throw new Error(`Erro ao localizar cliente: ${error.message}`);
  }

  return data as CustomerRow | null;
}

async function resolveTacticalClientId(customer: CustomerRow): Promise<number> {
  if (
    typeof customer.tactical_client_id === 'number' &&
    Number.isFinite(customer.tactical_client_id) &&
    customer.tactical_client_id > 0
  ) {
    return customer.tactical_client_id;
  }

  const tacticalClientId = await findTrmmClientIdByName(customer.name);

  if (!tacticalClientId) {
    throw new Error(
      `Não foi possível localizar o cliente "${customer.name}" na base de monitoramento.`,
    );
  }

  const supabaseAdmin = getSupabaseAdmin();

  await supabaseAdmin
    .from('customers')
    .update({
      tactical_client_id: tacticalClientId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', customer.id);

  return tacticalClientId;
}

async function assertAgentBelongsToClient(input: {
  tacticalClientId: number;
  agentId: string;
}) {
  const agents = await fetchTrmmAgentsByClient(input.tacticalClientId);
  const agent = agents.find((item) => item.agent_id === input.agentId);

  if (!agent) {
    throw new Error('Este agente não pertence ao cliente selecionado.');
  }

  return agent as AgentRow;
}

function mapUpdateAction(
  action: WindowsUpdateActionPayload['action'],
): TrmmWindowsUpdateAction {
  if (action === 'approve-update') {
    return 'approve';
  }

  if (action === 'ignore-update') {
    return 'ignore';
  }

  return 'nothing';
}

async function assertUpdateBelongsToAgent(input: {
  agentId: string;
  updateId: number;
}) {
  const updates = await fetchTrmmWindowsUpdatesByAgent(input.agentId);
  const update = updates.find(
    (item) => String(item.id) === String(input.updateId),
  );

  if (!update) {
    throw new Error(
      'Não foi possível confirmar este update no dispositivo selecionado. Atualize a tela e tente novamente.',
    );
  }

  return update;
}

async function findLocalDevice(input: {
  customerId: string;
  hostname: string;
}): Promise<DeviceRow | null> {
  const supabaseAdmin = getSupabaseAdmin();

  const { data, error } = await supabaseAdmin
    .from('devices')
    .select('id, customer_id, hostname')
    .eq('customer_id', input.customerId)
    .ilike('hostname', input.hostname)
    .limit(1)
    .maybeSingle();

  if (error) {
    return null;
  }

  return data as DeviceRow | null;
}

async function createRemoteJob(input: {
  customerId: string;
  deviceId: string | null;
  requestedBy: string;
  requestedByEmail: string | null;
  requestedByRole: string | null;
  jobType: string;
  status: 'running' | 'success' | 'failed';
  commandKey: string;
  commandLabel: string;
  parameters: Record<string, unknown>;
  result?: Record<string, unknown> | null;
  errorMessage?: string | null;
}) {
  const supabaseAdmin = getSupabaseAdmin();

  const finishedAt =
    input.status === 'success' || input.status === 'failed'
      ? new Date().toISOString()
      : null;

  const { data, error } = await supabaseAdmin
    .from('remote_jobs')
    .insert({
      customer_id: input.customerId,
      device_id: input.deviceId,
      job_type: input.jobType,
      status: input.status,
      requested_by: input.requestedBy,
      requested_by_email: input.requestedByEmail,
      requested_by_role: input.requestedByRole,
      command_key: input.commandKey,
      command_label: input.commandLabel,
      parameters: input.parameters,
      result: input.result ?? null,
      error_message: input.errorMessage ?? null,
      started_at: new Date().toISOString(),
      finished_at: finishedAt,
      approval_required: false,
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`Erro ao registrar job remoto: ${error.message}`);
  }

  return data.id as string;
}

async function appendJobLog(input: {
  jobId: string;
  level: 'info' | 'error' | 'warn';
  message: string;
  payload?: Record<string, unknown>;
}) {
  const supabaseAdmin = getSupabaseAdmin();

  await supabaseAdmin.from('remote_job_logs').insert({
    job_id: input.jobId,
    level: input.level,
    message: input.message,
    payload: input.payload ?? {},
  });
}

async function finishRemoteJob(input: {
  jobId: string;
  status: 'success' | 'failed';
  result?: Record<string, unknown> | null;
  errorMessage?: string | null;
}) {
  const supabaseAdmin = getSupabaseAdmin();

  await supabaseAdmin
    .from('remote_jobs')
    .update({
      status: input.status,
      result: input.result ?? null,
      error_message: input.errorMessage ?? null,
      finished_at: new Date().toISOString(),
    })
    .eq('id', input.jobId);
}

function getLabels(input: {
  action: NonNullable<WindowsUpdateActionPayload['action']>;
  kb?: string | null;
}) {
  if (input.action === 'scan') {
    return {
      jobType: 'windows_update_scan',
      commandKey: 'windows_update_scan',
      commandLabel: 'Verificar updates',
      successMessage: 'Verificação de updates solicitada com sucesso.',
    };
  }

  if (input.action === 'install-approved') {
    return {
      jobType: 'windows_update_install',
      commandKey: 'windows_update_install_approved',
      commandLabel: 'Instalar updates aprovados',
      successMessage:
        'Instalação solicitada com sucesso. Acompanhe o status em Jobs remotos.',
    };
  }

  if (input.action === 'approve-update') {
    return {
      jobType: 'windows_update_approval',
      commandKey: 'windows_update_approve',
      commandLabel: `Aprovar update${input.kb ? ` ${input.kb}` : ''}`,
      successMessage: 'Update aprovado com sucesso.',
    };
  }

  if (input.action === 'ignore-update') {
    return {
      jobType: 'windows_update_approval',
      commandKey: 'windows_update_ignore',
      commandLabel: `Ignorar update${input.kb ? ` ${input.kb}` : ''}`,
      successMessage: 'Update ignorado com sucesso.',
    };
  }

  return {
    jobType: 'windows_update_approval',
    commandKey: 'windows_update_reset',
    commandLabel: `Limpar ação do update${input.kb ? ` ${input.kb}` : ''}`,
    successMessage: 'Ação do update limpa com sucesso.',
  };
}

export async function POST(request: NextRequest) {
  let createdJobId: string | null = null;

  try {
    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Usuário não autenticado.',
        },
        { status: 401 },
      );
    }

    const payload = (await request.json()) as WindowsUpdateActionPayload;
    const customerId = cleanString(payload.customerId);
    const agentId = cleanString(payload.agentId);

    if (!customerId || !agentId || !payload.action) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Informe cliente, agente e ação.',
        },
        { status: 400 },
      );
    }

    const accessRows = await getUserAccessRows(user.id);

    if (!canAccessCustomer({ accessRows, customerId })) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Usuário sem permissão para executar ação neste cliente.',
        },
        { status: 403 },
      );
    }

    const role =
      accessRows.find((row) => row.customer_id === customerId)?.role ??
      (isSafesysAdmin(accessRows) ? 'admin' : null);

    const customer = await getCustomer(customerId);

    if (!customer) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Cliente não encontrado.',
        },
        { status: 404 },
      );
    }

    const tacticalClientId = await resolveTacticalClientId(customer);
    const agent = await assertAgentBelongsToClient({
      tacticalClientId,
      agentId,
    });

    const localDevice = await findLocalDevice({
      customerId,
      hostname: agent.hostname,
    });

    if (payload.action === 'scan' || payload.action === 'install-approved') {
      const labels = getLabels({ action: payload.action });

      const jobId = await createRemoteJob({
        customerId,
        deviceId: localDevice?.id ?? null,
        requestedBy: user.id,
        requestedByEmail: user.email ?? null,
        requestedByRole: role,
        jobType: labels.jobType,
        status: 'running',
        commandKey: labels.commandKey,
        commandLabel: labels.commandLabel,
        parameters: {
          agent_id: agentId,
          hostname: agent.hostname,
          site: agent.site_name ?? null,
          action: payload.action,
          device_type: inferDeviceType({
            payloadDeviceType: payload.deviceType,
            agent,
          }),
          confirmation_used: payload.confirmationUsed === true,
          hostname_confirmed: cleanString(payload.hostnameConfirmed),
        },
      });

      createdJobId = jobId;

      await appendJobLog({
        jobId,
        level: 'info',
        message:
          payload.action === 'scan'
            ? 'Verificação de updates solicitada.'
            : 'Instalação dos updates aprovados solicitada.',
        payload: {
          hostname: agent.hostname,
          requested_by_email: user.email ?? null,
        },
      });

      const result =
        payload.action === 'scan'
          ? await triggerTrmmWindowsUpdateScan(agentId)
          : await triggerTrmmWindowsUpdateInstall(agentId);

      if (payload.action === 'scan') {
        await finishRemoteJob({
          jobId,
          status: 'success',
          result: {
            message: result,
            agent_id: agentId,
            hostname: agent.hostname,
          },
        });
      } else {
        await appendJobLog({
          jobId,
          level: 'info',
          message:
            'Solicitação enviada. O status será atualizado quando a tela de Windows Updates for recarregada.',
          payload: {
            result,
          },
        });
      }

      return NextResponse.json({
        ok: true,
        jobId,
        message: labels.successMessage,
        agent,
      });
    }

    if (
      payload.action === 'approve-update' ||
      payload.action === 'ignore-update' ||
      payload.action === 'reset-update'
    ) {
      if (
        payload.updateId === undefined ||
        payload.updateId === null ||
        Number.isNaN(Number(payload.updateId))
      ) {
        return NextResponse.json(
          {
            ok: false,
            error: 'Informe o update.',
          },
          { status: 400 },
        );
      }

      const updateId = Number(payload.updateId);

      const update = await assertUpdateBelongsToAgent({
        agentId,
        updateId,
      });

      const labels = getLabels({
        action: payload.action,
        kb: update.kb,
      });

      const jobId = await createRemoteJob({
        customerId,
        deviceId: localDevice?.id ?? null,
        requestedBy: user.id,
        requestedByEmail: user.email ?? null,
        requestedByRole: role,
        jobType: labels.jobType,
        status: 'running',
        commandKey: labels.commandKey,
        commandLabel: labels.commandLabel,
        parameters: {
          agent_id: agentId,
          hostname: agent.hostname,
          site: agent.site_name ?? null,
          action: payload.action,
          update_id: updateId,
          kb: update.kb ?? null,
          title: update.title ?? null,
          severity: update.severity ?? null,
        },
      });

      createdJobId = jobId;

      const result = await updateTrmmWindowsUpdateAction({
        updateId,
        action: mapUpdateAction(payload.action),
      });

      await finishRemoteJob({
        jobId,
        status: 'success',
        result: {
          message: result,
          agent_id: agentId,
          hostname: agent.hostname,
          update_id: updateId,
          kb: update.kb ?? null,
          title: update.title ?? null,
        },
      });

      await appendJobLog({
        jobId,
        level: 'info',
        message: 'Ação do update concluída com sucesso.',
        payload: {
          result,
        },
      });

      return NextResponse.json({
        ok: true,
        jobId,
        message: labels.successMessage,
        agent,
        update,
      });
    }

    return NextResponse.json(
      {
        ok: false,
        error: 'Ação inválida.',
      },
      { status: 400 },
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Erro interno ao executar ação de Windows Update.';

    if (createdJobId) {
      try {
        await finishRemoteJob({
          jobId: createdJobId,
          status: 'failed',
          errorMessage: message,
        });

        await appendJobLog({
          jobId: createdJobId,
          level: 'error',
          message: 'Falha ao executar ação de Windows Update.',
          payload: {
            error: message,
          },
        });
      } catch {
        // Não sobrescrever o erro principal.
      }
    }

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status: 500 },
    );
  }
}
