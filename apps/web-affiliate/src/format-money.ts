/** Format minor currency units using ISO 4217 codes. */
export function formatMoney(minor: string | number | null | undefined, currency = 'XXX'): string {
  if (minor === null || minor === undefined || minor === '') {
    return '—';
  }
  const value = typeof minor === 'string' ? Number(minor) : minor;
  if (!Number.isFinite(value)) {
    return '—';
  }
  const major = value / 100;
  const code = currency.toUpperCase();
  if (code === 'XXX') {
    return major.toLocaleString(undefined, {
      minimumFractionDigits: major % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    });
  }
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: code,
      minimumFractionDigits: major % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(major);
  } catch {
    return `${code} ${major.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
}
