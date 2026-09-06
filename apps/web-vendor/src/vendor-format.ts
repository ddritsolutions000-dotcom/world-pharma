export function formatCount(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value);
}

export function parseMinorToNumber(value: string | number | undefined | null): number {
  if (value == null) {
    return 0;
  }
  try {
    const n = typeof value === 'string' ? BigInt(value) : BigInt(Math.round(value));
    return Number(n / 100n);
  } catch {
    return 0;
  }
}

export function formatCurrencyMinor(
  value: string | number | undefined | null,
  currency = 'XXX',
): string {
  const major = parseMinorToNumber(value);
  const code = currency && /^[A-Z]{3}$/.test(currency) ? currency : 'XXX';
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: code, maximumFractionDigits: 0 }).format(major);
  } catch {
    return `${major} ${code}`;
  }
}

/** Display currency must come from offer/org/country config — never a silent INR default. */
const MARKET_CURRENCY: Record<string, string> = {
  IN: 'INR',
  AE: 'AED',
  US: 'USD',
};

export function currencyForCountry(countryCode?: string | null): string {
  const code = countryCode?.trim().toUpperCase() ?? '';
  return MARKET_CURRENCY[code] ?? 'XXX';
}

export function statusBadgeClass(status: string): string {
  const s = status.toUpperCase();
  if (['PAID', 'SUCCEEDED', 'COMPLETED', 'DELIVERED', 'SETTLED', 'PAID_OUT', 'READY_TO_SHIP'].includes(s)) {
    return 'wp-badge wp-badge--success';
  }
  if (['ALLOCATED', 'PICKING', 'PACKING', 'PROCESSING', 'IN_TRANSIT', 'PENDING'].includes(s)) {
    return 'wp-badge wp-badge--info';
  }
  if (['READY', 'PACKED', 'PICKED', 'SHIPPED'].includes(s)) {
    return 'wp-badge wp-badge--warning';
  }
  if (['CANCELLED', 'FAILED', 'REJECTED', 'RETURNED', 'BLOCKED'].includes(s)) {
    return 'wp-badge wp-badge--danger';
  }
  return 'wp-badge';
}
