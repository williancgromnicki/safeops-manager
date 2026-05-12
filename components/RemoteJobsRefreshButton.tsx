'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

const buttonClassName =
  'inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60';

type RemoteJobsRefreshButtonProps = {
  customerId: string;
};

type RemoteJobApiRow = {
  id: string;
  jobType: string;
  status: string;
};

type RemoteJobsApiResponse = {
  ok: boolean;
  error?: string;
  jobs?: RemoteJobApiRow[];
};

function isPendingWindowsUpdateInstall(job: RemoteJobApiRow) {
  const type = job.jobType?.toLowerCase();
  const status = job.status?.toLowerCase();

  return (
    type === 'windows_update_install' &&
    (status === 'running' || status === 'queued')
  );
}

export function RemoteJobsRefreshButton({
  customerId,
}: RemoteJobsRefreshButtonProps) {
  const router = useRouter();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function refreshJobs() {
    try {
      setIsRefreshing(true);
      setMessage(null);

      const jobsResponse = await fetch(
        `/api/remote-jobs?customerId=${encodeURIComponent(customerId)}`,
        {
          method: 'GET',
          cache: 'no-store',
        },
      );

      const jobsData = (await jobsResponse.json()) as RemoteJobsApiResponse;

      if (!jobsResponse.ok || !jobsData.ok) {
        throw new Error(jobsData.error ?? 'Não foi possível carregar os jobs.');
      }

      const jobsToValidate = (jobsData.jobs ?? []).filter(
        isPendingWindowsUpdateInstall,
      );

      if (jobsToValidate.length > 0) {
        const results = await Promise.allSettled(
          jobsToValidate.map((job) =>
            fetch('/api/admin/windows-updates/jobs/refresh', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              cache: 'no-store',
              body: JSON.stringify({
                jobId: job.id,
              }),
            }).then(async (response) => {
              const payload = (await response.json().catch(() => null)) as
                | {
                    ok?: boolean;
                    error?: string;
                    message?: string;
                  }
                | null;

              if (!response.ok || !payload?.ok) {
                throw new Error(
                  payload?.error ?? 'Não foi possível verificar um job.',
                );
              }

              return payload;
            }),
          ),
        );

        const failures = results.filter(
          (result) => result.status === 'rejected',
        ).length;

        if (failures > 0) {
          setMessage(
            `${jobsToValidate.length - failures}/${jobsToValidate.length} jobs verificados. ${failures} com erro.`,
          );
        } else {
          setMessage(`${jobsToValidate.length} job(s) verificado(s).`);
        }
      } else {
        setMessage('Nenhum job de instalação pendente para validar.');
      }

      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Não foi possível atualizar o status.',
      );
    } finally {
      setIsRefreshing(false);
    }
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        className={buttonClassName}
        disabled={isRefreshing}
        onClick={refreshJobs}
      >
        {isRefreshing ? 'Atualizando...' : 'Atualizar status'}
      </button>

      {message ? (
        <p className="max-w-xs text-xs text-slate-500">{message}</p>
      ) : null}
    </div>
  );
}
