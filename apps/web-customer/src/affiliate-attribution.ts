/** Client-side affiliate attribution storage — no PHI, code + click_id only. */
export type AffiliateAttribution = {
  referral_code: string;
  click_id: string;
  link_id?: string | null;
  country_code: string;
  recorded_at: string;
};

const STORAGE_KEY = 'wp_affiliate_attribution';

export function readAffiliateAttribution(): AffiliateAttribution | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as AffiliateAttribution;
    if (!parsed.referral_code || !parsed.click_id) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeAffiliateAttribution(value: AffiliateAttribution): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}

export function clearAffiliateAttribution(): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.removeItem(STORAGE_KEY);
}

export function affiliateCodeForCheckout(country: string): string | undefined {
  const stored = readAffiliateAttribution();
  if (!stored) {
    return undefined;
  }
  if (stored.country_code && stored.country_code !== country) {
    return undefined;
  }
  return stored.referral_code;
}

export function newClickId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `click-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function fullCustomerReferralUrl(relativePath: string): string {
  const base =
    (typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_CUSTOMER_URL : undefined) ??
    'http://localhost:3002';
  const path = relativePath.startsWith('/') ? relativePath : `/${relativePath}`;
  return `${base.replace(/\/$/, '')}${path}`;
}
