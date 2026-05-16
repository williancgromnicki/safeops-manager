"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type RefreshDevicesButtonProps = {
  iconOnly?: boolean;
  label?: string;
  title?: string;
};

type RefreshResponse = {
  ok?: boolean;
  error?: string;
  message?: string;
  trigger?: string;
  status?: string;
  payload?: unknown;
};

function RefreshIcon({ spinning = false }: { spinning?: boolean }) {
  return (
    <svg
      className={`h-4 w-4 ${spinning ? "animate-spin" : ""}`}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M20 11a8.1 8.1 0 0 0-15.5-2M4 5v4h4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4 13a8.1 8.1 0 0 0 15.5 2M20 19v-4h-4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "Erro desconhecido ao sincronizar dados.";
}

function getSuccessMessage(data: RefreshResponse): string {
  return (
    data.message ??
    "Sincronização global solicitada com sucesso. Aguarde alguns segundos e a tela será atualizada."
  );
}

export function RefreshDevicesButton({
  iconOnly = false,
  label = "Atualizar agora",
  title = "Executar sincronização global SafeOps",
}: RefreshDevicesButtonProps) {
  const router = useRouter();

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [hasError, setHasError] = useState(false);

  async function handleRefresh() {
    try {
      setIsRefreshing(true);
      setMessage(null);
      setHasError(false);

      const response = await fetch("/api/refresh", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
        body: JSON.stringify({
          source: "safeops-ui",
          scope: "global",
        }),
      });

      const data = (await response.json().catch(() => null)) as
        | RefreshResponse
        | null;

      if (!response.ok || !data?.ok) {
        throw new Error(
          data?.error || "Não foi possível executar a sincronização global.",
        );
      }

      setLastRefresh(new Date());
      setMessage(getSuccessMessage(data));

      // O runner atualiza o banco de forma síncrona. Este pequeno intervalo evita
      // recarregar a tela antes do Supabase refletir os novos dados.
      window.setTimeout(() => {
        router.refresh();
      }, 1200);
    } catch (error: unknown) {
      setHasError(true);
      setMessage(getErrorMessage(error));
    } finally {
      setIsRefreshing(false);
    }
  }

  return (
    <div className="relative flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleRefresh}
        disabled={isRefreshing}
        title={title}
        aria-label={title}
        className={[
          "inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60",
          iconOnly ? "h-10 w-10 px-0 py-0" : "px-3 py-2",
        ].join(" ")}
      >
        <RefreshIcon spinning={isRefreshing} />

        {iconOnly ? null : isRefreshing ? "Sincronizando..." : label}
      </button>

      {message ? (
        <span
          className={[
            "text-xs",
            iconOnly
              ? "absolute right-0 top-12 z-20 w-72 rounded-lg border bg-white px-3 py-2 shadow-lg"
              : "",
            hasError
              ? "border-rose-200 text-rose-700"
              : "border-emerald-200 text-emerald-700",
          ].join(" ")}
        >
          {message}
        </span>
      ) : null}

      {lastRefresh && !hasError && !iconOnly ? (
        <span className="text-xs text-slate-500">
          Última sincronização manual às{" "}
          {lastRefresh.toLocaleTimeString("pt-BR", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          })}
        </span>
      ) : null}
    </div>
  );
}
