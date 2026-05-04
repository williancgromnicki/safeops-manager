import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const runnerUrl = process.env.SAFEOPS_SYNC_RUNNER_URL;
    const runnerToken = process.env.SAFEOPS_SYNC_RUNNER_TOKEN;

    if (!runnerUrl || !runnerToken) {
      return NextResponse.json(
        {
          ok: false,
          error: "Sync runner não configurado no ambiente."
        },
        { status: 500 }
      );
    }

    const response = await fetch(runnerUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${runnerToken}`
      },
      cache: "no-store"
    });

    const data = await response.json();

    return NextResponse.json(data, {
      status: response.ok ? 200 : response.status
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error: error?.message || "Erro ao executar refresh de inventário."
      },
      { status: 500 }
    );
  }
}
