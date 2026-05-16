import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type RunnerResponse = {
  ok?: boolean;
  error?: string;
  message?: string;
  [key: string]: unknown;
};

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "Erro desconhecido ao executar sincronização global.";
}

function normalizeRunnerUrl(value: string): string {
  return value.trim();
}

async function parseRunnerResponse(response: Response): Promise<RunnerResponse> {
  const text = await response.text().catch(() => "");

  if (!text) {
    return {
      ok: response.ok,
      message: response.ok
        ? "Sincronização global executada."
        : "Resposta vazia do sync runner.",
    };
  }

  try {
    return JSON.parse(text) as RunnerResponse;
  } catch {
    return {
      ok: response.ok,
      message: text,
    };
  }
}

export async function POST(request: NextRequest) {
  try {
    const runnerUrl = process.env.SAFEOPS_SYNC_RUNNER_URL;
    const runnerToken = process.env.SAFEOPS_SYNC_RUNNER_TOKEN;

    if (!runnerUrl || !runnerToken) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Sync runner não configurado. Configure SAFEOPS_SYNC_RUNNER_URL e SAFEOPS_SYNC_RUNNER_TOKEN no ambiente.",
        },
        { status: 500 },
      );
    }

    const incomingPayload = await request.json().catch(() => ({}));

    const response = await fetch(normalizeRunnerUrl(runnerUrl), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${runnerToken}`,
        "Content-Type": "application/json",
        "X-SafeOps-Refresh-Source": "safeops-manager-ui",
      },
      cache: "no-store",
      body: JSON.stringify({
        trigger: "manual-ui",
        scope: "global",
        requested_at: new Date().toISOString(),
        ...(typeof incomingPayload === "object" && incomingPayload !== null
          ? incomingPayload
          : {}),
      }),
    });

    const data = await parseRunnerResponse(response);

    if (!response.ok || data.ok === false) {
      return NextResponse.json(
        {
          ok: false,
          error:
            data.error ??
            `Falha ao executar sincronização global: HTTP ${response.status}`,
          runner: data,
        },
        { status: response.ok ? 500 : response.status },
      );
    }

    return NextResponse.json(
      {
        ok: true,
        message:
          data.message ??
          "Sincronização global SafeOps executada com sucesso.",
        runner: data,
      },
      { status: 200 },
    );
  } catch (error: unknown) {
    return NextResponse.json(
      {
        ok: false,
        error: getErrorMessage(error),
      },
      { status: 500 },
    );
  }
}
