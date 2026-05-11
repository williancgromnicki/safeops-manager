import { fetchTrmmApi, fetchTrmmClients } from '@/lib/trmm/api';

export type TrmmWindowsUpdate = {
  id: number;
  date_installed?: string | null;
  guid?: string | null;
  kb?: string | null;
  title?: string | null;
  installed?: boolean;
  downloaded?: boolean;
  description?: string | null;
  severity?: string | null;
  categories?: string[];
  category_ids?: string[];
  kb_article_ids?: string[];
  more_info_urls?: string[];
  support_url?: string | null;
  revision_number?: number | null;
  action?: string | null;
  result?: string | null;
  agent?: number | null;
};

export type TrmmWindowsAgent = {
  agent_id: string;
  hostname: string;
  site_name?: string | null;
  client_name?: string | null;
  monitoring_type?: string | null;
  description?: string | null;
  needs_reboot?: boolean;
  pending_actions_count?: number;
  status?: string | null;
  last_seen?: string | null;
  logged_username?: string | null;
  plat?: string | null;
  has_patches_pending?: boolean;
  operating_system?: string | null;
};

export type TrmmWindowsUpdateAction =
  | 'approve'
  | 'ignore'
  | 'decline'
  | 'nothing';

export type WindowsUpdatesDeviceSummary = {
  agent_id: string;
  hostname: string;
  client_name: string | null;
  site_name: string | null;
  monitoring_type: string | null;
  status: string | null;
  last_seen: string | null;
  logged_username: string | null;
  needs_reboot: boolean;
  has_patches_pending: boolean;
  operating_system: string | null;
  updates_total: number;
  updates_pending: number;
  updates_approved: number;
  updates_critical: number;
  updates_security: number;
  updates_definition: number;
  updates_downloaded: number;
  updates: TrmmWindowsUpdate[];
};

function normalize(value?: string | null): string {
  return (value ?? '').trim().toLowerCase();
}

function isWindowsAgent(agent: TrmmWindowsAgent): boolean {
  const platform = normalize(agent.plat);
  const os = normalize(agent.operating_system);

  return platform === 'windows' || os.includes('windows');
}

function isCritical(update: TrmmWindowsUpdate): boolean {
  return normalize(update.severity) === 'critical';
}

function hasCategory(update: TrmmWindowsUpdate, text: string): boolean {
  return (update.categories ?? []).some((category) =>
    normalize(category).includes(text),
  );
}

function isSecurity(update: TrmmWindowsUpdate): boolean {
  return (
    hasCategory(update, 'security') ||
    normalize(update.title).includes('security')
  );
}

function isDefinition(update: TrmmWindowsUpdate): boolean {
  return (
    hasCategory(update, 'definition') ||
    normalize(update.title).includes('defender') ||
    normalize(update.title).includes('intelligence')
  );
}

function isApproved(update: TrmmWindowsUpdate): boolean {
  return normalize(update.action) === 'approve';
}

function isPending(update: TrmmWindowsUpdate): boolean {
  return update.installed !== true;
}

export async function fetchTrmmAgentsByClient(
  tacticalClientId: number,
): Promise<TrmmWindowsAgent[]> {
  return fetchTrmmApi<TrmmWindowsAgent[]>(
    `/agents/?client=${encodeURIComponent(String(tacticalClientId))}`,
    {
      method: 'GET',
    },
  );
}

export async function fetchTrmmWindowsUpdatesByAgent(
  agentId: string,
): Promise<TrmmWindowsUpdate[]> {
  return fetchTrmmApi<TrmmWindowsUpdate[]>(
    `/winupdate/${encodeURIComponent(agentId)}/`,
    {
      method: 'GET',
    },
  );
}

export async function updateTrmmWindowsUpdateAction(input: {
  updateId: number;
  action: TrmmWindowsUpdateAction;
}): Promise<string> {
  return fetchTrmmApi<string>(
    `/winupdate/${encodeURIComponent(String(input.updateId))}/`,
    {
      method: 'PUT',
      body: JSON.stringify({
        action: input.action,
      }),
      parseAsText: false,
    },
  );
}

export async function triggerTrmmWindowsUpdateInstall(
  agentId: string,
): Promise<string> {
  return fetchTrmmApi<string>(
    `/winupdate/${encodeURIComponent(agentId)}/install/`,
    {
      method: 'POST',
      parseAsText: false,
    },
  );
}

export async function triggerTrmmWindowsUpdateScan(
  agentId: string,
): Promise<string> {
  return fetchTrmmApi<string>(
    `/winupdate/${encodeURIComponent(agentId)}/scan/`,
    {
      method: 'POST',
      parseAsText: false,
    },
  );
}

export async function findTrmmClientIdByName(
  customerName: string,
): Promise<number | null> {
  const clients = await fetchTrmmClients();
  const wanted = normalize(customerName);

  const exact = clients.find((client) => normalize(client.name) === wanted);

  return exact?.id ?? null;
}

export function summarizeWindowsUpdates(input: {
  agent: TrmmWindowsAgent;
  updates: TrmmWindowsUpdate[];
}): WindowsUpdatesDeviceSummary {
  const updates = input.updates.filter(isPending);

  return {
    agent_id: input.agent.agent_id,
    hostname: input.agent.hostname,
    client_name: input.agent.client_name ?? null,
    site_name: input.agent.site_name ?? null,
    monitoring_type: input.agent.monitoring_type ?? null,
    status: input.agent.status ?? null,
    last_seen: input.agent.last_seen ?? null,
    logged_username: input.agent.logged_username ?? null,
    needs_reboot: input.agent.needs_reboot === true,
    has_patches_pending: input.agent.has_patches_pending === true,
    operating_system: input.agent.operating_system ?? null,
    updates_total: updates.length,
    updates_pending: updates.filter(isPending).length,
    updates_approved: updates.filter(isApproved).length,
    updates_critical: updates.filter(isCritical).length,
    updates_security: updates.filter(isSecurity).length,
    updates_definition: updates.filter(isDefinition).length,
    updates_downloaded: updates.filter((update) => update.downloaded === true)
      .length,
    updates,
  };
}

export async function fetchWindowsUpdateSummariesByClient(
  tacticalClientId: number,
): Promise<WindowsUpdatesDeviceSummary[]> {
  const agents = (await fetchTrmmAgentsByClient(tacticalClientId)).filter(
    isWindowsAgent,
  );

  const summaries = await Promise.all(
    agents.map(async (agent) => {
      try {
        const updates = await fetchTrmmWindowsUpdatesByAgent(agent.agent_id);

        return summarizeWindowsUpdates({
          agent,
          updates,
        });
      } catch (error) {
        return summarizeWindowsUpdates({
          agent,
          updates: [],
        });
      }
    }),
  );

  return summaries.sort((a, b) => {
    if (b.updates_critical !== a.updates_critical) {
      return b.updates_critical - a.updates_critical;
    }

    if (b.updates_total !== a.updates_total) {
      return b.updates_total - a.updates_total;
    }

    return a.hostname.localeCompare(b.hostname);
  });
}
