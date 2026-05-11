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
    throw new Error('Informe o agent_id do TRMM.');
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
