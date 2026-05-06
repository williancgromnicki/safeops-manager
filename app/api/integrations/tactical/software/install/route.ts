import { NextRequest, NextResponse } from "next/server";
import { getSoftwareByKey } from "@/lib/software-whitelist";

const TRMM_API_URL = process.env.TRMM_API_URL;
const TRMM_API_KEY = process.env.TRMM_API_KEY;

function classifyInstallResult(output: string) {
  const normalized = output.toLowerCase();

  if (
    normalized.includes("installed 1/1 packages") ||
    normalized.includes("the install of") && normalized.includes("was successful")
  ) {
    return "success";
  }

  if (normalized.includes("already installed")) {
    return "already_installed";
  }

  if (
    normalized.includes("not installed") ||
    normalized.includes("failed") ||
    normalized.includes("error")
  ) {
    return "failed";
  }

  return "unknown";
}

async function runTrmmCommand(agentId: string, cmd: string, timeout: number) {
  if (!TRMM_API_URL || !TRMM_API_KEY) {
    throw new Error("TRMM_API_URL ou TRMM_API_KEY não configurados.");
  }

  const response = await fetch(`${TRMM_API_URL}/agents/${agentId}/cmd/`, {
    method: "POST",
    headers: {
      "X-API-KEY": TRMM_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      shell: "cmd",
      cmd,
      timeout,
      custom_shell: null,
      run_as_user: false,
    }),
  });

  const text = await response.text();

  let output = text;
  try {
    output = JSON.parse(text);
  } catch {
    // mantém texto bruto
  }

  return {
    ok: response.ok,
    status: response.status,
    output: String(output),
  };
}

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

    const software = getSoftwareByKey(softwareKey);

    if (!software) {
      return NextResponse.json(
        { ok: false, error: "Software não permitido na whitelist." },
        { status: 403 }
      );
    }

    const installResult = await runTrmmCommand(
      agentId,
      software.installCmd,
      software.timeout
    );

    const installStatus = classifyInstallResult(installResult.output);

    let validationResult = null;

    if (software.validateCmd) {
      validationResult = await runTrmmCommand(
        agentId,
        software.validateCmd,
        60
      );
    }

    const validationOutput = validationResult?.output?.toLowerCase() ?? "";

    const finalStatus =
      validationOutput.includes("installed") ||
      installStatus === "success" ||
      installStatus === "already_installed"
        ? installStatus === "already_installed"
          ? "already_installed"
          : "success"
        : installStatus;

    return NextResponse.json({
      ok: finalStatus === "success" || finalStatus === "already_installed",
      status: finalStatus,
      software: {
        key: software.key,
        label: software.label,
        packageName: software.packageName,
      },
      install: installResult,
      validation: validationResult,
    });
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
