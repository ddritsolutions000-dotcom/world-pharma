export function formatCount(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value);
}

export function formatMinorUnits(value: string): string {
  try {
    const minor = BigInt(value || '0');
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(minor);
  } catch {
    return '0';
  }
}

export function formatMetricDate(value: string): string {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' }).format(parsed);
}
