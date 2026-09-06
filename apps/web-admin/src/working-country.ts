export const MARKET_COUNTRY_CODES = ['IN', 'AE', 'US'] as const;

export type MarketCountryCode = (typeof MARKET_COUNTRY_CODES)[number];

const ADMIN_COUNTRY_STORAGE_KEY = 'wp_admin_country';

/** Validates a market country code. Never silently defaults to India. */
export function resolveMarketCountry(countryCode: string | null | undefined): MarketCountryCode | null {
  const code = countryCode?.trim().toUpperCase();
  if (code && (MARKET_COUNTRY_CODES as readonly string[]).includes(code)) {
    return code as MarketCountryCode;
  }
  return null;
}

/** Country code for API/query params — empty string when scope is unknown (caller must validate). */
export function workingCountry(countryCode: string | null | undefined): string {
  return resolveMarketCountry(countryCode) ?? '';
}

/** UI picker value: session country when valid, otherwise empty (user must choose). */
export function marketCountryPickerValue(countryCode: string | null | undefined): string {
  return workingCountry(countryCode);
}

export function scopeLabel(countryCode: string | null | undefined): string {
  const code = resolveMarketCountry(countryCode);
  if (!code) {
    return 'Select country';
  }
  return code;
}

export function requireMarketCountry(countryCode: string | null | undefined): MarketCountryCode {
  const code = resolveMarketCountry(countryCode);
  if (!code) {
    throw new Error('Country scope is required');
  }
  return code;
}

export function readStoredAdminCountry(): string {
  if (typeof window === 'undefined') {
    return '';
  }
  return workingCountry(window.localStorage.getItem(ADMIN_COUNTRY_STORAGE_KEY));
}

export function persistAdminCountry(countryCode: string | null | undefined): string {
  const next = workingCountry(countryCode);
  if (typeof window !== 'undefined') {
    if (next) {
      window.localStorage.setItem(ADMIN_COUNTRY_STORAGE_KEY, next);
    } else {
      window.localStorage.removeItem(ADMIN_COUNTRY_STORAGE_KEY);
    }
  }
  return next;
}

/**
 * Resolve admin working country without silent India default:
 * URL ?country= → localStorage → session → empty (caller must gate API).
 */
export function resolveAdminWorkingCountry(opts: {
  urlCountry?: string | null;
  sessionCountry?: string | null;
}): string {
  const fromUrl = workingCountry(opts.urlCountry);
  if (fromUrl) {
    return persistAdminCountry(fromUrl);
  }
  const stored = readStoredAdminCountry();
  if (stored) {
    return stored;
  }
  return persistAdminCountry(opts.sessionCountry);
}
