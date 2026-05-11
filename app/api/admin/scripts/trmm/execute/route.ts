import { NextRequest, NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import {
  downloadTrmmScript,
  executeTrmmScript,
  resolveTrmmAgent,
} from '@/lib/trmm/scripts';

export const dynamic = 'force-dynamic';

type AccessRow = {
  customer_id: string;
  role: string;
};

type ExecutePayload = {
  customerId?: string;
  deviceId?: string;
  scriptSource?: 'library' | 'local';
  scriptId?: number | string;
  scriptName?: string;
  shell?: string;
  timeout?: number;
  runAsUser?: boolean;
};

type DeviceRow = {
  id: string;
  customer_id: string;
  hostname: string;
  site: string | null;
};

type LocalScriptRow = {
  id: string;
  customer_id: string | null;
  scope: string;
  name: string;
  description: string | null;
  shell: string;
  script_body: string;
  status: string;
};

type PreparedScript = {
  code: string;
  filename: string | null;
  name: string;
  shell: string;
  source: 'library' | 'local';
  args: unknown[];
  envVars: unknown[];
};

function cleanString(value?: string | null): string | null {
  const cleaned = value?.trim();

  return cleaned ? cleaned : null;
}

function normalizeRole(role?: string | null): string {
  return cleanString(role)?.toLowerCase() ?? '';
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

async function getDevice(input: {
  customerId: string;
  deviceId: string;
}): Promise<DeviceRow | null> {
  const supabaseAdmin = getSupabaseAdmin();

  const { data, error } = await supabaseAdmin
    .from('devices')
    .select('id, customer_id, hostname, site')
    .eq('customer_id', input.customerId)
    .eq('id', input.deviceId)
    .maybeSingle();

  if (error) {
    throw new Error(`Erro ao localizar dispositivo: ${error.message}`);
  }

  return data as DeviceRow | null;
}

async function prepareLocalScript(input: {
  scriptId: string;
  customerId: string;
  isAdmin: boolean;
}): Promise<PreparedScript> {
  const supabaseAdmin = getSupabaseAdmin();

  const { data, error } = await supabaseAdmin
    .from('remote_scripts')
    .select('id, customer_id, scope, name, description, shell, script_body, status')
    .eq('id', input.scriptId)
    .maybeSingle();

  if (error) {
    throw new Error(`Erro ao carregar script local: ${error.message}`);
  }

  if (!data) {
    throw new Error('Script local não encontrado.');
  }

  const script = data as LocalScriptRow;

  const canUseScript =
    script.scope === 'safesys' ||
    script.customer_id === input.customerId ||
    input.isAdmin;

  if (!canUseScript) {
    throw new Error('Este script local não pertence ao cliente selecionado.');
  }

  if (script.status !== 'approved' && !input.isAdmin) {
    throw new Error('Este script ainda está pendente de revisão e não pode ser executado.');
  }

  return {
    code: script.script_body,
    filename: null,
    name: script.name,
    shell: script.shell || 'powershell',
    source: 'local',
    args: [],
    envVars: [],
  };
}

async function prepareLibraryScript(input: {
  scriptId: number;
  scriptName?: string | null;
  shell?: string | null;
}): Promise<PreparedScript> {
  const downloadedScript = await downloadTrmmScript(input.scriptId);

  return {
    code: downloadedScript.code,
    filename: downloadedScript.filename,
    name:
      cleanString(input.scriptName) ??
      downloadedScript.filename ??
      `Script ${input.scriptId}`,
    shell: cleanString(input.shell) ?? 'powershell',
    source: 'library',
    args: [],
    envVars: [],
  };
}

async function createRemoteJob(input: {
  customerId: string;
  deviceId: string;
  requestedByEmail: string | null;
  requestedByRole: string | null;
  commandKey: string;
  commandLabel: string;
  parameters: Record<string, unknown>;
}) {
  const supabaseAdmin = getSupabaseAdmin();

  const { data, error } = await supabaseAdmin
    .from('remote_jobs')
    .insert({
      customer_id: input.customerId,
      device_id: input.deviceId,
      job_type: 'script_execution',
      status: 'running',
      requested_by_email: input.requestedByEmail,
      requested_by_role: input.requestedByRole,
      command_key: input.commandKey,
      command_label: input.commandLabel,
      parameters: input.parameters,
      started_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`Erro ao criar job remoto: ${error.message}`);
  }

  return data.id as string;
}

async function finishRemoteJob(input: {
  jobId: string;
  status: 'success' | 'failed';
  result?: Record<string, unknown>;
  errorMessage?: string | null;
}) {
  const supabaseAdmin = getSupabaseAdmin();

  const { error } = await supabaseAdmin
    .from('remote_jobs')
    .update({
      status: input.status,
      result: input.result ?? null,
      error_message: input.errorMessage ?? null,
      finished_at: new Date().toISOString(),
    })
    .eq('id', input.jobId);

  if (error) {
    throw new Error(`Erro ao atualizar job remoto: ${error.message}`);
  }
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

    const payload = (await request.json()) as ExecutePayload;

    const customerId = cleanString(payload.customerId);
    const deviceId = cleanString(payload.deviceId);
    const scriptSource = payload.scriptSource === 'local' ? 'local' : 'library';
    const timeout = Number(payload.timeout ?? 90);
    const runAsUser = payload.runAsUser === true;

    if (!customerId || !deviceId) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Informe cliente e dispositivo.',
        },
        { status: 400 },
      );
    }

    if (!payload.scriptId) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Informe um script válido.',
        },
        { status: 400 },
      );
    }

    if (!Number.isFinite(timeout) || timeout < 5 || timeout > 3600) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Timeout inválido. Use um valor entre 5 e 3600 segundos.',
        },
        { status: 400 },
      );
    }

    const accessRows = await getUserAccessRows(user.id);
    const isAdmin = isSafesysAdmin(accessRows);

    if (!canAccessCustomer({ accessRows, customerId })) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Usuário sem permissão para executar scripts neste cliente.',
        },
        { status: 403 },
      );
    }

    const role =
      accessRows.find((row) => row.customer_id === customerId)?.role ??
      (isAdmin ? 'admin' : null);

    const device = await getDevice({
      customerId,
      deviceId,
    });

    if (!device) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Dispositivo não encontrado no SafeOps.',
        },
        { status: 404 },
      );
    }

    const preparedScript =
      scriptSource === 'local'
        ? await prepareLocalScript({
            scriptId: String(payload.scriptId),
            customerId,
            isAdmin,
          })
        : await prepareLibraryScript({
            scriptId: Number(payload.scriptId),
            scriptName: cleanString(payload.scriptName),
            shell: cleanString(payload.shell),
          });

    const trmmAgent = await resolveTrmmAgent({
      deviceId: device.id,
      hostname: device.hostname,
      siteName: device.site,
    });

    if (!trmmAgent) {
      throw new Error(
        `Não foi possível localizar o agent_id real do TRMM para o dispositivo ${device.hostname}. Sincronize o inventário ou valide o hostname no TRMM.`,
      );
    }

    createdJobId = await createRemoteJob({
      customerId,
      deviceId,
      requestedByEmail: user.email ?? null,
      requestedByRole: role,
      commandKey: `${preparedScript.source}_script_${payload.scriptId}`,
      commandLabel: preparedScript.name,
      parameters: {
        source: preparedScript.source,
        script_id: payload.scriptId,
        script_name: preparedScript.name,
        filename: preparedScript.filename,
        shell: preparedScript.shell,
        timeout,
        run_as_user: runAsUser,
        hostname: device.hostname,
        site: device.site,
        trmm_agent_id: trmmAgent.agent_id,
      },
    });

    const result = await executeTrmmScript({
      agentId: trmmAgent.agent_id,
      code: preparedScript.code,
      timeout,
      shell: preparedScript.shell,
      runAsUser,
      args: preparedScript.args,
      envVars: preparedScript.envVars,
    });

    const status = result.retcode === 0 ? 'success' : 'failed';

    await finishRemoteJob({
      jobId: createdJobId,
      status,
      result: {
        stdout: result.stdout,
        stderr: result.stderr,
        retcode: result.retcode,
        execution_time: result.execution_time,
        trmm_result_id: result.id,
        trmm_agent_id: trmmAgent.agent_id,
      },
      errorMessage:
        status === 'failed'
          ? result.stderr || `Script finalizado com retcode ${result.retcode}.`
          : null,
    });

    return NextResponse.json({
      ok: true,
      jobId: createdJobId,
      result,
      message:
        status === 'success'
          ? 'Script executado com sucesso.'
          : 'Script executado, mas retornou erro.',
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Erro interno ao executar script.';

    if (createdJobId) {
      try {
        await finishRemoteJob({
          jobId: createdJobId,
          status: 'failed',
          errorMessage: message,
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
