import { NextRequest, NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type RemoteJobPayload = {
  customerId?: string;
  deviceId?: string | null;
  jobType?: string;
  commandKey?: string;
  commandLabel?: string;
  parameters?: Record<string, unknown>;
};

type UserAccessRow = {
  customer_id: string;
  role: string;
};

type DeviceRow = {
  id: string;
  customer_id: string;
  hostname: string;
};

type RemoteJobRow = {
  id: string;
  customer_id: string;
  device_id: string | null;
  job_type: string;
  status: string;
  requested_by_email: string | null;
  requested_by_role: string | null;
  command_key: string | null;
  command_label: string | null;
  parameters: Record<string, unknown> | null;
  result: Record<string, unknown> | null;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  devices:
    | {
        hostname: string;
      }
    | {
        hostname: string;
      }[]
    | null;
  customers:
    | {
        name: string;
      }
    | {
        name: string;
      }[]
    | null;
};

const allowedJobTypes = new Set(['software_install', 'remote_background']);

const allowedOperationalRoles = new Set(['admin', 'client']);

function cleanString(value?: string | null): string | null {
  const cleaned = value?.trim();

  return cleaned ? cleaned : null;
}

function normalizeRole(role?: string | null): string {
  return cleanString(role)?.toLowerCase() ?? '';
}

function normalizeJobType(jobType?: string | null): string | null {
  const normalized = cleanString(jobType)?.toLowerCase();

  if (!normalized) {
    return null;
  }

  return normalized;
}

function normalizeParameters(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function normalizeRelatedName(
  value:
    | {
        name: string;
      }
    | {
        name: string;
      }[]
    | null,
): string {
  if (Array.isArray(value)) {
    return value[0]?.name ?? '—';
  }

  return value?.name ?? '—';
}

function normalizeDeviceHostname(
  value:
    | {
        hostname: string;
      }
    | {
        hostname: string;
      }[]
    | null,
): string {
  if (Array.isArray(value)) {
    return value[0]?.hostname ?? '—';
  }

  return value?.hostname ?? '—';
}

async function getAuthenticatedUser() {
  const supabase = await createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    throw new Error(`Erro ao validar usuário autenticado: ${error.message}`);
  }

  if (!user) {
    return null;
  }

  return user;
}

async function getUserAccessRows(userId: string): Promise<UserAccessRow[]> {
  const supabaseAdmin = getSupabaseAdmin();

  const { data, error } = await supabaseAdmin
    .from('user_customer_access')
    .select('customer_id, role')
    .eq('user_id', userId);

  if (error) {
    throw new Error(`Erro ao buscar permissões do usuário: ${error.message}`);
  }

  return ((data ?? []) as unknown as UserAccessRow[]).map((row) => ({
    customer_id: row.customer_id,
    role: normalizeRole(row.role),
  }));
}

function isSafesysAdmin(accessRows: UserAccessRow[]): boolean {
  return accessRows.some((row) => row.role === 'admin');
}

function findOperationalRoleForCustomer(
  accessRows: UserAccessRow[],
  customerId: string,
): string | null {
  const admin = isSafesysAdmin(accessRows);

  if (admin) {
    return 'admin';
  }

  const customerAccess = accessRows.find(
    (row) => row.customer_id === customerId,
  );

  if (!customerAccess) {
    return null;
  }

  if (!allowedOperationalRoles.has(customerAccess.role)) {
    return null;
  }

  return customerAccess.role;
}

async function validateDeviceAccess(input: {
  customerId: string;
  deviceId: string | null;
  userAccessRows: UserAccessRow[];
}): Promise<{
  allowedRole: string;
  device: DeviceRow | null;
}> {
  const { customerId, deviceId, userAccessRows } = input;

  const allowedRole = findOperationalRoleForCustomer(
    userAccessRows,
    customerId,
  );

  if (!allowedRole) {
    throw new Error('Forbidden');
  }

  if (!deviceId) {
    return {
      allowedRole,
      device: null,
    };
  }

  const supabaseAdmin = getSupabaseAdmin();

  const { data, error } = await supabaseAdmin
    .from('devices')
    .select('id, customer_id, hostname')
    .eq('id', deviceId)
    .eq('customer_id', customerId)
    .eq('visible_to_customer', true)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Erro ao validar dispositivo: ${error.message}`);
  }

  if (!data) {
    throw new Error('DeviceNotFound');
  }

  return {
    allowedRole,
    device: data as DeviceRow,
  };
}

function validateJobPayload(payload: RemoteJobPayload) {
  const customerId = cleanString(payload.customerId);
  const deviceId = cleanString(payload.deviceId);
  const jobType = normalizeJobType(payload.jobType);
  const commandKey = cleanString(payload.commandKey);
  const commandLabel = cleanString(payload.commandLabel);
  const parameters = normalizeParameters(payload.parameters);

  if (!customerId) {
    return {
      ok: false as const,
      error: 'Informe o customerId.',
    };
  }

  if (!jobType || !allowedJobTypes.has(jobType)) {
    return {
      ok: false as const,
      error: 'Tipo de job inválido. Use software_install ou remote_background.',
    };
  }

  if (!commandKey) {
    return {
      ok: false as const,
      error: 'Informe o commandKey.',
    };
  }

  if (jobType === 'software_install') {
    const packageId =
      typeof parameters.package_id === 'string'
        ? parameters.package_id.trim()
        : '';

    if (!deviceId) {
      return {
        ok: false as const,
        error: 'Instalação de software exige deviceId.',
      };
    }

    if (!packageId) {
      return {
        ok: false as const,
        error: 'Instalação de software exige parameters.package_id.',
      };
    }
  }

  if (jobType === 'remote_background') {
    const action =
      typeof parameters.action === 'string' ? parameters.action.trim() : '';

    if (!deviceId) {
      return {
        ok: false as const,
        error: 'Remote background exige deviceId.',
      };
    }

    if (!action) {
      return {
        ok: false as const,
        error: 'Remote background exige parameters.action.',
      };
    }
  }

  return {
    ok: true as const,
    customerId,
    deviceId,
    jobType,
    commandKey,
    commandLabel,
    parameters,
  };
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

    const payload = (await request.json()) as RemoteJobPayload;
    const validation = validateJobPayload(payload);

    if (!validation.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: validation.error,
        },
        { status: 400 },
      );
    }

    const userAccessRows = await getUserAccessRows(user.id);

    const { allowedRole, device } = await validateDeviceAccess({
      customerId: validation.customerId,
      deviceId: validation.deviceId,
      userAccessRows,
    });

    const supabaseAdmin = getSupabaseAdmin();

    const { data: createdJob, error: insertError } = await supabaseAdmin
      .from('remote_jobs')
      .insert({
        customer_id: validation.customerId,
        device_id: validation.deviceId,
        job_type: validation.jobType,
        status: 'queued',
        requested_by: user.id,
        requested_by_email: user.email ?? null,
        requested_by_role: allowedRole,
        command_key: validation.commandKey,
        command_label: validation.commandLabel ?? validation.commandKey,
        parameters: validation.parameters,
        approval_required: false,
      })
      .select('id')
      .single();

    if (insertError) {
      throw new Error(`Erro ao criar job remoto: ${insertError.message}`);
    }

    const jobId = createdJob.id as string;

    const { error: logError } = await supabaseAdmin
      .from('remote_job_logs')
      .insert({
        job_id: jobId,
        level: 'info',
        message: 'Job remoto criado no SafeOps Manager.',
        payload: {
          device_hostname: device?.hostname ?? null,
          job_type: validation.jobType,
          command_key: validation.commandKey,
          requested_by_email: user.email ?? null,
          requested_by_role: allowedRole,
        },
      });

    if (logError) {
      throw new Error(`Job criado, mas falhou ao criar log: ${logError.message}`);
    }

    return NextResponse.json({
      ok: true,
      job_id: jobId,
      status: 'queued',
      message: 'Job remoto criado com sucesso.',
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Erro interno ao criar job.';

    if (message === 'Forbidden') {
      return NextResponse.json(
        {
          ok: false,
          error:
            'Usuário sem permissão operacional para executar ações neste cliente.',
        },
        { status: 403 },
      );
    }

    if (message === 'DeviceNotFound') {
      return NextResponse.json(
        {
          ok: false,
          error:
            'Dispositivo não encontrado ou não pertence ao cliente informado.',
        },
        { status: 404 },
      );
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

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Usuário não autenticado.',
          jobs: [],
        },
        { status: 401 },
      );
    }

    const userAccessRows = await getUserAccessRows(user.id);
    const admin = isSafesysAdmin(userAccessRows);

    const requestedCustomerId =
      request.nextUrl.searchParams.get('customerId')?.trim() ?? null;
    const requestedDeviceId =
      request.nextUrl.searchParams.get('deviceId')?.trim() ?? null;

    const supabaseAdmin = getSupabaseAdmin();

    let query = supabaseAdmin
      .from('remote_jobs')
      .select(
        [
          'id',
          'customer_id',
          'device_id',
          'job_type',
          'status',
          'requested_by_email',
          'requested_by_role',
          'command_key',
          'command_label',
          'parameters',
          'result',
          'error_message',
          'created_at',
          'started_at',
          'finished_at',
          'devices:devices(hostname)',
          'customers:customers(name)',
        ].join(', '),
      )
      .order('created_at', { ascending: false })
      .limit(100);

    if (requestedDeviceId) {
      query = query.eq('device_id', requestedDeviceId);
    }

    if (requestedCustomerId) {
      if (!admin) {
        const allowed = userAccessRows.some(
          (row) => row.customer_id === requestedCustomerId,
        );

        if (!allowed) {
          return NextResponse.json(
            {
              ok: false,
              error: 'Usuário sem acesso ao cliente informado.',
              jobs: [],
            },
            { status: 403 },
          );
        }
      }

      query = query.eq('customer_id', requestedCustomerId);
    } else if (!admin) {
      const allowedCustomerIds = userAccessRows.map((row) => row.customer_id);

      if (allowedCustomerIds.length === 0) {
        return NextResponse.json({
          ok: true,
          jobs: [],
        });
      }

      query = query.in('customer_id', allowedCustomerIds);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Erro ao listar jobs remotos: ${error.message}`);
    }

    const rows = (data ?? []) as unknown as RemoteJobRow[];

    const jobs = rows.map((job) => ({
      id: job.id,
      customerId: job.customer_id,
      customerName: normalizeRelatedName(job.customers),
      deviceId: job.device_id,
      hostname: normalizeDeviceHostname(job.devices),
      jobType: job.job_type,
      status: job.status,
      requestedByEmail: job.requested_by_email,
      requestedByRole: job.requested_by_role,
      commandKey: job.command_key,
      commandLabel: job.command_label,
      parameters: job.parameters,
      result: job.result,
      errorMessage: job.error_message,
      createdAt: job.created_at,
      startedAt: job.started_at,
      finishedAt: job.finished_at,
    }));

    return NextResponse.json({
      ok: true,
      jobs,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : 'Erro interno ao listar jobs.',
        jobs: [],
      },
      { status: 500 },
    );
  }
}
