import { fetchTrmmApi } from '@/lib/trmm/api';

export type TrmmScript = {
  id: number;
  name: string;
  description?: string | null;
  script_type?: string | null;
  shell?: string | null;
  args?: unknown[];
  category?: string | null;
  favorite?: boolean;
  default_timeout?: number | null;
  syntax?: string | null;
  filename?: string | null;
  hidden?: boolean;
  supported_platforms?: string[];
  run_as_user?: boolean;
  env_vars?: unknown[];
};

export type TrmmScriptDownload = {
  filename: string;
  code: string;
};

export type TrmmScriptExecutionResult = {
  stdout: string;
  stderr: string;
  retcode: number;
  execution_time: number;
  id?: number;
};

export type TrmmAgent = {
  agent_id: string;
  hostname: string;
  client?: string;
  client_name?: string;
  site_name?: string;
  site?: number;
  operating_system?: string;
  status?: string;
};

function normalize(value?: string | null): string {
  return (value ?? '').trim().toLowerCase();
}

export async function fetchTrmmScripts(): Promise<TrmmScript[]> {
  return fetchTrmmApi<TrmmScript[]>('/scripts/?showHiddenScripts=true', {
    method: 'GET',
  });
}

export async function downloadTrmmScript(
  scriptId: number,
): Promise<TrmmScriptDownload> {
  return fetchTrmmApi<TrmmScriptDownload>(
    `/scripts/${scriptId}/download/?with_snippets=true`,
    {
      method: 'GET',
    },
  );
}

export async function fetchTrmmAgents(): Promise<TrmmAgent[]> {
  return fetchTrmmApi<TrmmAgent[]>('/agents/?detail=false', {
    method: 'GET',
  });
}

export async function resolveTrmmAgent(input: {
  deviceId?: string | null;
  hostname?: string | null;
  siteName?: string | null;
}): Promise<TrmmAgent | null> {
  const agents = await fetchTrmmAgents();

  const deviceId = input.deviceId?.trim();

  if (deviceId) {
    const byId = agents.find((agent) => agent.agent_id === deviceId);

    if (byId) {
      return byId;
    }
  }

  const hostname = input.hostname?.trim();

  if (!hostname) {
    return null;
  }

  const normalizedHostname = normalize(hostname);
  const normalizedSiteName = normalize(input.siteName);

  const candidates = agents.filter(
    (agent) => normalize(agent.hostname) === normalizedHostname,
  );

  if (candidates.length === 0) {
    return null;
  }

  if (candidates.length === 1) {
    return candidates[0];
  }

  const bySite = candidates.find(
    (agent) => !normalizedSiteName || normalize(agent.site_name) === normalizedSiteName,
  );

  return bySite ?? candidates[0];
}

export async function executeTrmmScript(input: {
  agentId: string;
  code: string;
  timeout: number;
  shell: string;
  runAsUser: boolean;
  args?: unknown[];
  envVars?: unknown[];
}): Promise<TrmmScriptExecutionResult> {
  const agentId = input.agentId.trim();

  if (!agentId) {
    throw new Error('Informe o identificador operacional do agente.');
  }

  return fetchTrmmApi<TrmmScriptExecutionResult>(
    `/scripts/${encodeURIComponent(agentId)}/test/`,
    {
      method: 'POST',
      body: JSON.stringify({
        code: input.code,
        timeout: input.timeout,
        args: input.args ?? [],
        shell: input.shell,
        run_as_user: input.runAsUser,
        env_vars: input.envVars ?? [],
      }),
    },
  );
}
