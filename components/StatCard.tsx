import { ReactNode } from 'react';

type StatCardProps = {
  label: string;
  value: string;
  helper?: ReactNode;
};

export function StatCard({ label, value, helper }: StatCardProps) {
  return (
    <article className="card">
      <p className="text-sm text-slate-600">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-brand-900">{value}</p>
      {helper ? <div className="mt-2 text-xs text-slate-500">{helper}</div> : null}
    </article>
  );
}
