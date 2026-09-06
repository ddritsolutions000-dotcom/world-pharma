import { apiBaseUrl } from '@world-pharma/shell-core';

const base = () => apiBaseUrl(typeof process === 'undefined' ? {} : process.env);

export type RecentlyViewedProduct = {
  item_id: string;
  slug: string;
  title: string;
  brand_name: string;
  category_name: string;
  viewed_at: string;
  available: boolean;
  in_stock: boolean;
  rx_required: boolean;
  sell_minor: string | null;
  currency: string;
  best_offer_id?: string | null;
  unavailable_reason: string | null;
  href: string;
  image_url: string | null;
};

export type CustomerPromoHint = {
  code: string;
  kind: string;
  percent_bps: number;
  fixed_minor: string;
  min_basket_minor: string;
  expires_at: string | null;
  funding: string;
};

export function fetchRecentlyViewed(token: string, countryCode: string) {
  return fetch(`${base()}/api/v1/me/recently-viewed?country_code=${encodeURIComponent(countryCode)}`, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
  }).then(async (res) => {
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw Object.assign(new Error((body as { detail?: string }).detail ?? 'request_failed'), {
        status: res.status,
      });
    }
    return body as { data: RecentlyViewedProduct[] };
  });
}

export function fetchAvailablePromos(token: string, countryCode: string) {
  return fetch(`${base()}/api/v1/me/promo/available?country_code=${encodeURIComponent(countryCode)}`, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
  }).then(async (res) => {
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw Object.assign(new Error((body as { detail?: string }).detail ?? 'request_failed'), {
        status: res.status,
      });
    }
    return body as { data: CustomerPromoHint[]; message?: string };
  });
}
