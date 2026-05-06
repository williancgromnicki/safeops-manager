import { NextRequest, NextResponse } from "next/server";

import { resolveCurrentCustomer } from "@/lib/data/get-current-customer";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { installSoftwareOnAgent } from "@/lib/services/software-deployment";

export const dynamic = "force-dynamic";

type SoftwareInstallRouteContext = {
  params: Promise<{
    deviceId: string;
  }>;
};

type DeviceSoftwareInstallRow = {
  id: string;
  customer_id: string;
  hostname: string;
  tactical_agent_id: string | null;
};

const allowedOperationalRoles = new Set(["admin", "client"]);

function cleanString(value?: string | null): string | null {
  const cleaned = value?.trim();

  return cleaned ? cleaned : null;
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
      message.includes("auth session missing") ||
      message.includes("session missing") ||
      message.includes("jwt")
    ) {
      return null;
    }

    throw new Error(`Erro ao validar usuário autenticado: ${error.message}`);
  }

  return user ?? null;
}

async function getRoleForCustomer(input: {
  userId: string;
  customerId: string;
}): Promise<string | null> {
  const supabaseAdmin = getSupabaseAdmin();

  const { data, error } = await supabaseAdmin
    .from("user_customer_access")
    .select("role")
    .eq("user_id", input.userId)
    .eq("customer_id", input.customerId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Erro ao validar permissão: ${error.message}`);
  }

  const role = cleanString(data?.role)?.toLowerCase() ?? null;

  if (role && allowedOperationalRoles.has(role)) {
    return role;
  }

  const { data: adminAccess, error: adminError } = await supabaseAdmin
    .from("user_customer_access")
    .select("role")
    .eq("user_id", input.userId)
    .eq("role", "admin")
    .limit(1)
    .maybeSingle();

  if (adminError) {
    throw new Error(`Erro ao validar permissão admin: ${adminError.message}`);
  }

  if (adminAccess) {
    return "admin";
  }

  return null;
}

export async function POST(
  request: NextRequest,
  context: SoftwareInstallRouteContext
) {
  try {
    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        {
          ok: false,
          error: "Usuário não autenticado.",
        },
        { status: 401 }
      );
    }

    const { deviceId } = await context.params;
    const requestedCustomerId = request.nextUrl.searchParams.get("customerId");

    const customerContext = await resolveCurrentCustomer(requestedCustomerId);

    if (!customerContext?.activeCustomer) {
      return NextResponse.json(
        {
          ok: false,
          error: "Cliente ativo não encontrado.",
        },
        { status: 403 }
      );
    }

    const activeCustomer = customerContext.activeCustomer;

    const userRole = await getRoleForCustomer({
      userId: user.id,
      customerId: activeCustomer.customerId,
    });

    if (!userRole) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Usuário sem permissão operacional para instalar software neste cliente.",
        },
        { status: 403 }
      );
    }

    const body = await request.json();
    const softwareKey = body.software;

    if (!softwareKey || typeof softwareKey !== "string") {
      return NextResponse.json(
        { ok: false, error: "software é obrigatório." },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    const { data, error } = await supabase
      .from("devices")
      .select(["id", "customer_id", "hostname", "tactical_agent_id"].join(", "))
      .eq("id", deviceId)
      .eq("customer_id", activeCustomer.customerId)
      .eq("visible_to_customer", true)
      .maybeSingle<DeviceSoftwareInstallRow>();

    if (error) {
      return NextResponse.json(
        {
          ok: false,
          error: `Erro ao localizar dispositivo: ${error.message}`,
        },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Dispositivo não encontrado ou não pertence ao cliente vinculado ao usuário.",
        },
        { status: 404 }
      );
    }

    const tacticalAgentId = cleanString(data.tactical_agent_id);

    if (!tacticalAgentId) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Dispositivo sem tactical_agent_id para instalação de software.",
        },
        { status: 409 }
      );
    }

    const result = await installSoftwareOnAgent({
      agentId: tacticalAgentId,
      softwareKey,
      requestedBy: user.id,
    });

    return NextResponse.json({
      ...result,
      device: {
        id: data.id,
        hostname: data.hostname,
        customerId: activeCustomer.customerId,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro interno ao instalar software.",
      },
      { status: 500 }
    );
  }
}
