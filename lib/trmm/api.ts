type TrmmRequestOptions = RequestInit & {
  parseAsText?: boolean;
};

export type TrmmSite = {
  id: number;
  name: string;
  client: number;
  client_name?: string;
  agent_count?: number;
  server_policy?: number | null;
  workstation_policy?: number | null;
  alert_template?: number | null;
  block_policy_inheritance?: boolean;
  maintenance_mode?: boolean;
  failing_checks?: {
    error: boolean;
    warning: boolean;
  };
  custom_fields?: unknown[];
};

export type TrmmClient = {
  id: number;
  name: string;
  sites: TrmmSite[];
  agent_count?: number;
  server_policy?: number | null;
  workstation_policy?: number | null;
  alert_template?: number | null;
  block_policy_inheritance?: boolean;
  maintenance_mode?: boolean;
  failing_checks?: {
    error: boolean;
    warning: boolean;
  };
  custom_fields?: unknown[];
};

function getTrmmConfig() {
  const baseUrl = process.env.TRMM_API_URL;
  const apiKey = process.env.TRMM_API_KEY;

  if (!baseUrl || !apiKey) {
    throw new Error(
      'Integração TRMM não configurada. Configure TRMM_API_URL e TRMM_API_KEY no ambiente.',
    );
  }

  return {
    baseUrl: baseUrl.replace(/\/$/, ''),
    apiKey,
  };
}

async function readResponseBody(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return '';
  }
}

export async function fetchTrmmApi<T>(
  path: string,
  options: TrmmRequestOptions = {},
): Promise<T> {
  const { baseUrl, apiKey } = getTrmmConfig();
  const cleanPath = path.replace(/^\//, '');
  const url = `${baseUrl}/${cleanPath}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      'X-API-Key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(options.headers ?? {}),
    },
    cache: 'no-store',
  });

  const bodyText = await readResponseBody(response);

  if (!response.ok) {
    throw new Error(
      `TRMM API ${response.status}: ${bodyText || response.statusText}`,
    );
  }

  if (response.status === 204 || !bodyText) {
    return null as T;
  }

  if (options.parseAsText) {
    return bodyText as T;
  }

  try {
    return JSON.parse(bodyText) as T;
  } catch {
    return bodyText as T;
  }
}

export async function fetchTrmmClients(): Promise<TrmmClient[]> {
  const clients = await fetchTrmmApi<TrmmClient[]>('/clients/', {
    method: 'GET',
  });

  return clients.map((client) => ({
    ...client,
    sites: (client.sites ?? []).map((site) => ({
      ...site,
      client: site.client ?? client.id,
      client_name: site.client_name ?? client.name,
    })),
  }));
}

export async function createTrmmClientWithSite(input: {
  clientName: string;
  siteName: string;
}): Promise<{ clientId: number; siteId: number }> {
  const clientName = input.clientName.trim();
  const siteName = input.siteName.trim();

  if (!clientName) {
    throw new Error('Informe o nome do cliente.');
  }

  if (!siteName) {
    throw new Error(
      'Todo cliente precisa ter pelo menos um grupo inicial para organizar seus dispositivos.',
    );
  }

  await fetchTrmmApi<string>('/clients/', {
    method: 'POST',
    parseAsText: true,
    body: JSON.stringify({
      client: {
        name: clientName,
      },
      site: {
        name: siteName,
      },
      custom_fields: [],
    }),
  });

  await new Promise((resolve) => setTimeout(resolve, 800));

  const clients = await fetchTrmmClients();
  const createdClient = clients.find((client) => client.name === clientName);

  if (!createdClient) {
    throw new Error(
      `Cliente criado no TRMM, mas não foi possível localizar o ID do cliente "${clientName}".`,
    );
  }

  const createdSite = createdClient.sites.find((site) => site.name === siteName);

  if (!createdSite) {
    throw new Error(
      `Cliente criado no TRMM, mas não foi possível localizar o ID do grupo "${siteName}".`,
    );
  }

  return {
    clientId: createdClient.id,
    siteId: createdSite.id,
  };
}

export async function createTrmmSite(input: {
  clientId: number;
  siteName: string;
}): Promise<{ siteId: number }> {
  const siteName = input.siteName.trim();

  if (!Number.isFinite(input.clientId)) {
    throw new Error('ID do cliente TRMM inválido.');
  }

  if (!siteName) {
    throw new Error('Informe o nome do grupo.');
  }

  await fetchTrmmApi<string>('/clients/sites/', {
    method: 'POST',
    parseAsText: true,
    body: JSON.stringify({
      site: {
        client: input.clientId,
        name: siteName,
      },
      custom_fields: [],
    }),
  });

  await new Promise((resolve) => setTimeout(resolve, 800));

  const clients = await fetchTrmmClients();
  const client = clients.find((item) => item.id === input.clientId);

  if (!client) {
    throw new Error(
      `Grupo criado no TRMM, mas não foi possível localizar o cliente ${input.clientId}.`,
    );
  }

  const createdSite = client.sites.find((site) => site.name === siteName);

  if (!createdSite) {
    throw new Error(
      `Grupo criado no TRMM, mas não foi possível localizar o ID do grupo "${siteName}".`,
    );
  }

  return {
    siteId: createdSite.id,
  };
}

export async function updateTrmmClientName(input: {
  clientId: number;
  clientName: string;
}) {
  const clientName = input.clientName.trim();

  if (!Number.isFinite(input.clientId)) {
    throw new Error('ID do cliente TRMM inválido.');
  }

  if (!clientName) {
    throw new Error('Informe o nome do cliente.');
  }

  const clients = await fetchTrmmClients();
  const currentClient = clients.find((client) => client.id === input.clientId);

  if (!currentClient) {
    throw new Error(`Cliente TRMM ${input.clientId} não encontrado.`);
  }

  await fetchTrmmApi<string>(`/clients/${input.clientId}/`, {
    method: 'PUT',
    parseAsText: true,
    body: JSON.stringify({
      client: {
        ...currentClient,
        name: clientName,
        sites: [],
      },
      site: {
        name: '',
      },
      custom_fields: currentClient.custom_fields ?? [],
    }),
  });
}

export async function deleteTrmmClient(input: { clientId: number }) {
  if (!Number.isFinite(input.clientId)) {
    throw new Error('ID do cliente TRMM inválido.');
  }

  await fetchTrmmApi<string>(`/clients/${input.clientId}/`, {
    method: 'DELETE',
    parseAsText: true,
  });
}
