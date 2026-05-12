import { NextRequest, NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { executeTrmmScript } from '@/lib/trmm/scripts';
import { fetchTrmmWindowsUpdatesByAgent } from '@/lib/trmm/windows-updates';

export const dynamic = 'force-dynamic';

type AccessRow = {
  customer_id: string;
  role: string;
};

type RemoteJobRow = {
  id: string;
  customer_id: string;
  device_id: string | null;
  job_type: string;
  status: string;
  parameters: Record<string, unknown> | null;
  created_at: string;
};

type RefreshPayload = {
  jobId?: string;
};

type UpdateToValidate = {
  update_id?: number | null;
  kb?: string | null;
  title?: string | null;
};

type ValidationResult = {
  hostname?: string;
  checked_at?: string;
  installed: Array<{
    kb: string;
    title?: string | null;
    date?: string | null;
    result?: string | null;
  }>;
  missing: Array<{
    kb: string;
    title?: string | null;
  }>;
  reboot_pending?: {
    component_based_servicing?: boolean;
    windows_update?: boolean;
    pending_file_rename?: boolean;
  };
  raw?: unknown;
};

const VALIDATION_SCRIPT_PREFIX = String.raw`
$ErrorActionPreference = "SilentlyContinue"

$KbListJson = @'
`;

const VALIDATION_SCRIPT_SUFFIX = String.raw`
'@

try {
    $KbList = $KbListJson | ConvertFrom-Json
} catch {
    $KbList = @()
}

function Convert-ResultCode {
    param([int]$Code)

    switch ($Code) {
        0 { return "Nao iniciado" }
        1 { return "Em andamento" }
        2 { return "Sucesso" }
        3 { return "Sucesso com erros" }
        4 { return "Falhou" }
        5 { return "Abortado" }
        default { return "Desconhecido" }
    }
}

$HistoryItems = @()

try {
    $Session = New-Object -ComObject Microsoft.Update.Session
    $Searcher = $Session.CreateUpdateSearcher()
    $HistoryCount = $Searcher.GetTotalHistoryCount()

    if ($HistoryCount -gt 0) {
        $HistoryItems = $Searcher.QueryHistory(0, [Math]::Min($HistoryCount, 500))
    }
} catch {
    $HistoryItems = @()
}

$Installed = @()
$Missing = @()

foreach ($Item in $KbList) {
    $Kb = [string]$Item.kb
    $Title = [string]$Item.title

    if ([string]::IsNullOrWhiteSpace($Kb)) {
        continue
    }

    $KbNumber = $Kb.Replace("KB", "")
    $Match = $null

    foreach ($History in $HistoryItems) {
        $HistoryTitle = [string]$History.Title

        if (
            $HistoryTitle -like "*$Kb*" -or
            $HistoryTitle -like "*$KbNumber*"
        ) {
            if ($History.ResultCode -eq 2 -or $History.ResultCode -eq 3) {
                $Match = $History
                break
            }
        }
    }

    if ($null -ne $Match) {
        $Installed += [ordered]@{
            kb = $Kb
            title = $Match.Title
            date = $Match.Date.ToString("o")
            result = Convert-ResultCode -Code $Match.ResultCode
        }
    } else {
        $Missing += [ordered]@{
            kb = $Kb
            title = $Title
        }
    }
}

$RebootChecks = [ordered]@{
    component_based_servicing = Test-Path "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\RebootPending"
    windows_update = Test-Path "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired"
    pending_file_rename = $false
}

try {
    $SessionManager = Get-ItemProperty "HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager" -ErrorAction SilentlyContinue
    if ($SessionManager.PendingFileRenameOperations) {
        $RebootChecks.pending_file_rename = $true
    }
} catch {}

$Result = [ordered]@{
    hostname = $env:COMPUTERNAME
    checked_at = (Get-Date).ToString("o")
    installed = $Installed
    missing = $Missing
    reboot_pending = $RebootChecks
}

Write-Output ("SAFEOPS_WU_VALIDATE_JSON=" + ($Result | ConvertTo-Json -Depth 8 -Compress))
exit 0
`;

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

async function getJob(jobId: string): Promise<RemoteJobRow | null> {
  const supabaseAdmin = getSupabaseAdmin();

  const { data, error } = await supabaseAdmin
    .from('remote_jobs')
    .select('id, customer_id, device_id, job_type, status, parameters, created_at')
    .eq('id', jobId)
    .maybeSingle();

  if (error) {
    throw new Error(`Erro ao localizar job remoto: ${error.message}`);
  }

  return data as RemoteJobRow | null;
}

function extractAgentId(parameters: Record<string, unknown> | null): string | null {
  const value = parameters?.agent_id ?? parameters?.trmm_agent_id;

  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function extractUpdatesFromParameters(
  parameters: Record<string, unknown> | null,
): UpdateToValidate[] {
  const rawUpdates = parameters?.approved_updates;

  if (!Array.isArray(rawUpdates)) {
    return [];
  }

  const updates: UpdateToValidate[] = [];

  for (const item of rawUpdates) {
    if (typeof item !== 'object' || item === null) {
      continue;
    }

    const record = item as Record<string, unknown>;
    const kb = typeof record.kb === 'string' ? record.kb.trim() : '';

    if (!kb) {
      continue;
    }

    updates.push({
      update_id:
        typeof record.update_id === 'number'
          ? record.update_id
          : typeof record.id === 'number'
            ? record.id
            : null,
      kb,
      title: typeof record.title === 'string' ? record.title : null,
    });
  }

  return updates;
}

function getKbFromTitle(title?: string | null): string | null {
  if (!title) {
    return null;
  }

  const match = title.match(/KB\d{4,}/i);

  return match?.[0]?.toUpperCase() ?? null;
}

async function getUpdatesToValidate(input: {
  agentId: string;
  parameters: Record<string, unknown> | null;
}) {
  const fromParameters = extractUpdatesFromParameters(input.parameters);

  if (fromParameters.length > 0) {
    return fromParameters;
  }

  const updates = await fetchTrmmWindowsUpdatesByAgent(input.agentId);

  return updates
    .filter((update) => String(update.action ?? '').toLowerCase() === 'approve')
    .map((update) => ({
      update_id: update.id,
      kb: update.kb ?? getKbFromTitle(update.title),
      title: update.title ?? null,
    }))
    .filter((update) => Boolean(update.kb));
}

function buildValidationScript(updates: UpdateToValidate[]) {
  const payload = JSON.stringify(
    updates.map((update) => ({
      kb: update.kb,
      title: update.title ?? null,
    })),
  );

  return `${VALIDATION_SCRIPT_PREFIX}${payload}${VALIDATION_SCRIPT_SUFFIX}`;
}

function parseValidationOutput(stdout: string): ValidationResult {
  const marker = 'SAFEOPS_WU_VALIDATE_JSON=';
  const markerIndex = stdout.lastIndexOf(marker);

  if (markerIndex < 0) {
    throw new Error('Não foi possível interpretar o retorno da validação.');
  }

  const jsonText = stdout.slice(markerIndex + marker.length).trim();
  const parsed = JSON.parse(jsonText) as ValidationResult;

  return {
    installed: [],
    missing: [],
    ...parsed,
  };
}

function hasRebootPending(result: ValidationResult): boolean {
  return Boolean(
    result.reboot_pending?.component_based_servicing ||
      result.reboot_pending?.windows_update ||
      result.reboot_pending?.pending_file_rename,
  );
}

async function updateJobResult(input: {
  jobId: string;
  status: 'running' | 'success' | 'failed';
  result: Record<string, unknown>;
  errorMessage?: string | null;
}) {
  const supabaseAdmin = getSupabaseAdmin();

  const finishedAt =
    input.status === 'success' || input.status === 'failed'
      ? new Date().toISOString()
      : null;

  const { error } = await supabaseAdmin
    .from('remote_jobs')
    .update({
      status: input.status,
      result: input.result,
      error_message: input.errorMessage ?? null,
      finished_at: finishedAt,
    })
    .eq('id', input.jobId);

  if (error) {
    throw new Error(`Erro ao atualizar job remoto: ${error.message}`);
  }
}

export async function POST(request: NextRequest) {
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

    const payload = (await request.json()) as RefreshPayload;
    const jobId = cleanString(payload.jobId);

    if (!jobId) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Informe o job.',
        },
        { status: 400 },
      );
    }

    const job = await getJob(jobId);

    if (!job) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Job remoto não encontrado.',
        },
        { status: 404 },
      );
    }

    if (job.job_type !== 'windows_update_install') {
      return NextResponse.json(
        {
          ok: false,
          error: 'Este job não é uma instalação de updates.',
        },
        { status: 400 },
      );
    }

    const accessRows = await getUserAccessRows(user.id);

    if (!canAccessCustomer({ accessRows, customerId: job.customer_id })) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Usuário sem permissão para verificar este job.',
        },
        { status: 403 },
      );
    }

    const agentId = extractAgentId(job.parameters);

    if (!agentId) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Este job não possui agente vinculado para validação.',
        },
        { status: 400 },
      );
    }

    const updatesToValidate = await getUpdatesToValidate({
      agentId,
      parameters: job.parameters,
    });

    if (updatesToValidate.length === 0) {
      await updateJobResult({
        jobId: job.id,
        status: 'success',
        result: {
          message:
            'Não há updates aprovados pendentes para validar. Job finalizado.',
          checked_at: new Date().toISOString(),
          validation: {
            installed: [],
            missing: [],
          },
        },
      });

      return NextResponse.json({
        ok: true,
        status: 'success',
        message: 'Não há updates aprovados pendentes para validar.',
      });
    }

    const execution = await executeTrmmScript({
      agentId,
      code: buildValidationScript(updatesToValidate),
      timeout: 120,
      shell: 'powershell',
      runAsUser: false,
    });

    const validation = parseValidationOutput(execution.stdout ?? '');

    const installedKbs = new Set(
      validation.installed.map((item) => item.kb.toUpperCase()),
    );

    const missing = updatesToValidate.filter(
      (update) => !installedKbs.has(String(update.kb ?? '').toUpperCase()),
    );

    const rebootPending = hasRebootPending(validation);

    if (missing.length === 0) {
      await updateJobResult({
        jobId: job.id,
        status: 'success',
        result: {
          message: rebootPending
            ? 'Instalação validada com sucesso. Reinicialização pendente.'
            : 'Instalação validada com sucesso.',
          checked_at: new Date().toISOString(),
          reboot_pending: rebootPending,
          validation: {
            installed: validation.installed,
            missing: [],
          },
        },
      });

      return NextResponse.json({
        ok: true,
        status: 'success',
        message: rebootPending
          ? 'Instalação validada com sucesso. Reinicialização pendente.'
          : 'Instalação validada com sucesso.',
      });
    }

    await updateJobResult({
      jobId: job.id,
      status: 'running',
      result: {
        message:
          'Instalação ainda aguardando validação. Alguns updates ainda não aparecem como instalados.',
        checked_at: new Date().toISOString(),
        reboot_pending: rebootPending,
        validation: {
          installed: validation.installed,
          missing,
        },
      },
    });

    return NextResponse.json({
      ok: true,
      status: 'running',
      message:
        'Instalação ainda aguardando validação. Alguns updates ainda não aparecem como instalados.',
      missing,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : 'Erro interno ao verificar job.',
      },
      { status: 500 },
    );
  }
}
