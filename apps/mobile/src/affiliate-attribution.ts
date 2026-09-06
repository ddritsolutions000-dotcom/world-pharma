/** In-memory affiliate attribution for mobile checkout — no PHI. */
export type AffiliateAttribution = {
  referral_code: string;
  click_id: string;
  link_id?: string | null;
  country_code: string;
  recorded_at: string;
};

let memoryAttribution: AffiliateAttribution | null = null;

export function readAffiliateAttribution(): AffiliateAttribution | null {
  return memoryAttribution;
}

export function writeAffiliateAttribution(value: AffiliateAttribution): void {
  memoryAttribution = value;
}

export function clearAffiliateAttribution(): void {
  memoryAttribution = null;
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
  return `click-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function parseReferralCodeFromUrl(url: string): string | null {
  const match = url.match(/\/r\/([^/?#]+)/i);
  const code = match?.[1];
  return code ? decodeURIComponent(code) : null;
}
