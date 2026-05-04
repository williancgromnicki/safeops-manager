"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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

  return "Erro desconhecido ao atualizar inventário.";
}

export function RefreshDevicesButton() {
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
        cache: "no-store",
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(
          data?.error || "Não foi possível atualizar o inventário.",
        );
      }

      setLastRefresh(new Date());
      setMessage("Inventário atualizado com sucesso.");

      router.refresh();
    } catch (error: unknown) {
      setHasError(true);
      setMessage(getErrorMessage(error));
    } finally {
      setIsRefreshing(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleRefresh}
        disabled={isRefreshing}
        className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <RefreshIcon spinning={isRefreshing} />

        {isRefreshing ? "Atualizando..." : "Atualizar agora"}
      </button>

      {message && (
        <span
          className={`text-xs ${
            hasError ? "text-red-600" : "text-emerald-600"
          }`}
        >
          {message}
        </span>
      )}

      {lastRefresh && !hasError && (
        <span className="text-xs text-slate-500">
          Última atualização manual às{" "}
          {lastRefresh.toLocaleTimeString("pt-BR", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          })}
        </span>
      )}
    </div>
  );
}
