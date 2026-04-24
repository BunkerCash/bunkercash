const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 366;

export function isValidDateString(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined) return false;
  const d = new Date(Date.UTC(year, month - 1, day));
  return (
    d.getUTCFullYear() === year &&
    d.getUTCMonth() === month - 1 &&
    d.getUTCDate() === day
  );
}

export function validateDateRange(from: string, to: string): string | null {
  if (!isValidDateString(from)) return `Invalid 'from' date: ${from}`;
  if (!isValidDateString(to)) return `Invalid 'to' date: ${to}`;
  if (from > to) return `'from' (${from}) must not be after 'to' (${to})`;

  const fromMs = Date.parse(from + "T00:00:00Z");
  const toMs = Date.parse(to + "T00:00:00Z");
  const days = Math.round((toMs - fromMs) / 86_400_000);
  if (days > MAX_RANGE_DAYS) {
    return `Range exceeds maximum of ${MAX_RANGE_DAYS} days (requested ${days})`;
  }

  return null;
}

export function previousUtcDate(now: Date = new Date()): string {
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
