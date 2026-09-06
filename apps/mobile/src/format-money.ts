/** Format minor currency units using ISO 4217 codes (global). */
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
    const locale =
      code === 'INR' ? 'en-IN' : code === 'USD' ? 'en-US' : code === 'AED' ? 'en-AE' : undefined;
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: code,
      minimumFractionDigits: major % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(major);
  } catch {
    return `${code} ${major.toFixed(2)}`;
  }
}

export function discountPercent(sellMinor: string, listMinor: string | null | undefined): number | null {
  if (!listMinor) {
    return null;
  }
  const sell = Number(sellMinor);
  const list = Number(listMinor);
  if (!Number.isFinite(sell) || !Number.isFinite(list) || list <= sell) {
    return null;
  }
  return Math.round(((list - sell) / list) * 100);
}
