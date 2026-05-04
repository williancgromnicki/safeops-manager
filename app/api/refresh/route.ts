import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "Erro desconhecido ao executar refresh de inventário.";
}

export async function POST() {
  try {
    const runnerUrl = process.env.SAFEOPS_SYNC_RUNNER_URL;
    const runnerToken = process.env.SAFEOPS_SYNC_RUNNER_TOKEN;

    if (!runnerUrl || !runnerToken) {
      return NextResponse.json(
        {
          ok: false,
          error: "Sync runner não configurado no ambiente.",
        },
        { status: 500 }
      );
    }

    const response = await fetch(runnerUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${runnerToken}`,
      },
      cache: "no-store",
    });

    let data: unknown;

    try {
      data = await response.json();
    } catch {
      data = {
        ok: false,
        error: "Resposta inválida do sync runner.",
      };
    }

    return NextResponse.json(data, {
      status: response.ok ? 200 : response.status,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        ok: false,
        error: getErrorMessage(error),
      },
      { status: 500 }
    );
  }
}
