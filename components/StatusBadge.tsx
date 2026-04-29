import { ReactNode } from 'react';

type OperationalStatus = 'Saudável' | 'Atenção' | 'Crítico';

const STATUS_STYLES: Record<OperationalStatus, string> = {
  Saudável: 'bg-emerald-100 text-emerald-700',
  Atenção: 'bg-amber-100 text-amber-700',
  Crítico: 'bg-rose-100 text-rose-700',
};

type StatusBadgeProps = {
  status: OperationalStatus;
  children?: ReactNode;
};

export function StatusBadge({ status, children }: StatusBadgeProps) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLES[status]}`}>
      {children ?? status}
    </span>
  );
}
