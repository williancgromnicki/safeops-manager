"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";

type RefreshDevicesButtonProps = {
  onRefreshFinished?: () => void;
};

export function RefreshDevicesButton({
  onRefreshFinished,
}: RefreshDevicesButtonProps) {
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
        throw new Error(data.error || "Não foi possível atualizar o inventário.");
      }

      setLastRefresh(new Date());
      setMessage("Inventário atualizado com sucesso.");

      if (onRefreshFinished) {
        onRefreshFinished();
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Erro desconhecido ao atualizar inventário.";

      setHasError(true);
      setMessage(errorMessage);
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
        <RefreshCw
          className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`}
        />

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
