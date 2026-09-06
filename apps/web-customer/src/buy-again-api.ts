import { apiBaseUrl } from '@world-pharma/shell-core';

const base = () => apiBaseUrl(typeof process === 'undefined' ? {} : process.env);

async function call(path: string, init: RequestInit & { token?: string | null } = {}) {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.token) {
    headers.set('Authorization', `Bearer ${init.token}`);
  }
  const { token, ...rest } = init;
  void token;
  const res = await fetch(`${base()}${path}`, { ...rest, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw Object.assign(new Error((body as { detail?: string }).detail ?? 'request_failed'), {
      status: res.status,
    });
  }
  return body;
}

export type BuyAgainItem = {
  offer_id: string;
  variant_id: string;
  sku: string;
  title: string;
  product_title?: string;
  product_slug?: string | null;
  times_ordered: number;
  last_qty: number;
  last_ordered_at: string;
  available: boolean;
  currency?: string | null;
  sell_minor?: string | null;
  list_minor?: string | null;
  image_url?: string | null;
  rx_required?: boolean;
};

export function fetchBuyAgain(token: string) {
  return call('/api/v1/me/orders/buy-again', { token }) as Promise<{ data: BuyAgainItem[] }>;
}

export type LocatorStore = {
  id: string;
  name: string;
  store_type?: string;
  address: string;
  city: string;
  area?: string;
  pincode: string;
  latitude?: number;
  longitude?: number;
  distance?: number;
  organization_name?: string;
  services?: string[];
  is_24_7?: boolean;
};

export function fetchPublicStores(params: {
  country: string;
  city?: string;
  pincode?: string;
}) {
  const search = new URLSearchParams({ country_code: params.country });
  if (params.city) search.set('city', params.city);
  if (params.pincode) search.set('pincode', params.pincode);
  return call(`/api/v1/public/store-locator/nearby?${search.toString()}`) as Promise<{
    stores: LocatorStore[];
    total: number;
  }>;
}
