import { vendorApiRoot } from './vendor-http';

export type VendorCmsCopy = { title: string; summary: string; body: string };

/** Published join-home CMS copy (same slug as join portal / company pages desk). */
export async function fetchVendorMarketingCopy(countryCode = 'IN'): Promise<VendorCmsCopy | null> {
  const base =
    typeof window === 'undefined'
      ? (process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:4000').replace(/\/$/, '')
      : vendorApiRoot();
  try {
    const res = await fetch(
      `${base}/api/v1/help/articles/join-home?country_code=${encodeURIComponent(countryCode)}&locale=en`,
      { headers: { Accept: 'application/json' }, next: { revalidate: 60 } },
    );
    if (!res.ok) {
      return null;
    }
    return (await res.json()) as VendorCmsCopy;
  } catch {
    return null;
  }
}
