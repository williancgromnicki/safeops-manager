import { NextRequest, NextResponse } from 'next/server';

import { resolveCurrentCustomer } from '@/lib/data/get-current-customer';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type DeploymentLinksContext = {
  params: Promise<{
    customerId: string;
  }>;
};

type DeploymentLinksPayload = {
  trmmWindowsAgentUrl?: string | null;
  trmmLinuxAgentUrl?: string | null;
  trmmMacosAgentUrl?: string | null;
};

function cleanString(value?: string | null): string | null {
  const cleaned = value?.trim();

  return cleaned ? cleaned : null;
}

async function assertAdmin(): Promise<void> {
  const context = await resolveCurrentCustomer();

  if (!context) {
    throw new Error('Unauthorized');
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from('user_customer_access')
    .select('role')
    .eq('user_id', context.userId)
    .eq('role', 'admin')
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Erro ao validar permissão admin: ${error.message}`);
  }

  if (!data) {
    throw new Error('Forbidden');
  }
}

export async function PATCH(
  request: NextRequest,
  context: DeploymentLinksContext,
) {
  try {
    await assertAdmin();

    const { customerId } = await context.params;
    const payload = (await request.json()) as DeploymentLinksPayload;

    const supabaseAdmin = getSupabaseAdmin();

    const { error } = await supabaseAdmin
      .from('customers')
      .update({
        trmm_windows_agent_url: cleanString(payload.trmmWindowsAgentUrl),
        trmm_linux_agent_url: cleanString(payload.trmmLinuxAgentUrl),
        trmm_macos_agent_url: cleanString(payload.trmmMacosAgentUrl),
      })
      .eq('id', customerId);

    if (error) {
      throw new Error(`Erro ao atualizar links: ${error.message}`);
    }

    return NextResponse.json({
      ok: true,
      message: 'Links de instalação atualizados com sucesso.',
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Erro interno ao atualizar links.';

    if (message === 'Unauthorized') {
      return NextResponse.json(
        { ok: false, error: 'Usuário não autenticado.' },
        { status: 401 },
      );
    }

    if (message === 'Forbidden') {
      return NextResponse.json(
        { ok: false, error: 'Usuário sem permissão administrativa.' },
        { status: 403 },
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
