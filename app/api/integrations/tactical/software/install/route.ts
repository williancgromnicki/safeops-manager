import { NextRequest, NextResponse } from "next/server";
import { installSoftwareOnAgent } from "@/lib/services/software-deployment";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const agentId = body.agent_id;
    const softwareKey = body.software;

    if (!agentId || typeof agentId !== "string") {
      return NextResponse.json(
        { ok: false, error: "agent_id é obrigatório." },
        { status: 400 }
      );
    }

    if (!softwareKey || typeof softwareKey !== "string") {
      return NextResponse.json(
        { ok: false, error: "software é obrigatório." },
        { status: 400 }
      );
    }

    const result = await installSoftwareOnAgent({
      agentId,
      softwareKey,
      requestedBy: null,
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro desconhecido ao instalar software.",
      },
      { status: 500 }
    );
  }
}
