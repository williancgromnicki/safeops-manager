export type NormalizedSeverity = 'CRIT' | 'WARN' | 'INFO';
export type NormalizedStatus = 'open' | 'closed';

export function normalizeSeverity(value?: string | null): NormalizedSeverity {
  const normalized = (value ?? '').trim().toUpperCase();

  if (['CRIT', 'CRITICAL', 'ERROR', 'ERRO'].includes(normalized)) {
    return 'CRIT';
  }

  if (['WARN', 'WARNING', 'ALERTA'].includes(normalized)) {
    return 'WARN';
  }

  return 'INFO';
}

export function normalizeStatus(value?: string | null): NormalizedStatus {
  const normalized = (value ?? '').trim().toLowerCase();

  if (['resolvido', 'ok', 'recovered', 'closed'].includes(normalized)) {
    return 'closed';
  }

  return 'open';
}

export function isAvailabilityCheck(checkType?: string | null): boolean {
  const normalized = (checkType ?? '').trim().toLowerCase();
  return normalized === 'availability' || normalized === 'ping';
}

export function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}
