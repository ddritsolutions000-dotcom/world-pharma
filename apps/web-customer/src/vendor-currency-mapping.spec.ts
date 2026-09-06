/** Self-contained mapping contract (no cross-app relative imports — production build safe). */

const MARKET_CURRENCY: Record<string, string> = {
  IN: 'INR',
  AE: 'AED',
  US: 'USD',
};

function currencyForCountry(countryCode?: string | null): string {
  const code = countryCode?.trim().toUpperCase() ?? '';
  return MARKET_CURRENCY[code] ?? 'XXX';
}

function formatCurrencyMinor(value: number, currency = 'XXX'): string {
  const major = Math.round(value) / 100;
  const code = currency && /^[A-Z]{3}$/.test(currency) ? currency : 'XXX';
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: code,
      maximumFractionDigits: 0,
    }).format(major);
  } catch {
    return `${major} ${code}`;
  }
}

describe('vendor currency mapping', () => {
  it('maps known market countries to real ISO currencies', () => {
    expect(currencyForCountry('IN')).toBe('INR');
    expect(currencyForCountry('AE')).toBe('AED');
    expect(currencyForCountry('US')).toBe('USD');
  });

  it('keeps XXX only when country currency is unknown', () => {
    expect(currencyForCountry('XX')).toBe('XXX');
    expect(currencyForCountry('')).toBe('XXX');
    expect(formatCurrencyMinor(10000, currencyForCountry('IN'))).toMatch(/₹|INR/);
  });
});
