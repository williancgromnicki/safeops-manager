import type { Severity } from '@/lib/demo-data';

const SEVERITY_STYLES: Record<Severity, string> = {
  INFO: 'bg-sky-100 text-sky-700',
  WARN: 'bg-amber-100 text-amber-700',
  CRIT: 'bg-rose-100 text-rose-700',
};

type SeverityBadgeProps = {
  severity: Severity;
};

export function SeverityBadge({ severity }: SeverityBadgeProps) {
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${SEVERITY_STYLES[severity]}`}>{severity}</span>;
}
