import { apiBaseUrl } from '@world-pharma/shell-core';

const base = () => apiBaseUrl(typeof process === 'undefined' ? {} : process.env);

export class CommerceApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function call<T>(path: string, init: RequestInit & { token?: string | null } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (init.token) {
    headers.set('Authorization', `Bearer ${init.token}`);
  }
  const { token, ...rest } = init;
  void token;
  const res = await fetch(`${base()}/${path.replace(/^\//, '')}`, { ...rest, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new CommerceApiError(
      (body as { detail?: string }).detail ?? 'request_failed',
      res.status,
      (body as { code?: string }).code,
    );
  }
  return body as T;
}

export function fetchCatalog(country: string, q?: string) {
  const params = new URLSearchParams({ country });
  if (q) {
    params.set('q', q);
  }
  return call<{ country_enabled: boolean; data: CatalogCard[] }>(`api/v1/catalog/items?${params.toString()}`);
}

export function searchCatalog(country: string, q: string, locale = 'en') {
  return searchDiscovery(country, q, locale, ['commerce']).then((body) => ({
    country_enabled: body.country_enabled && body.discovery_enabled,
    data: body.data.map((row) => ({ itemId: row.id, title: row.title })),
  }));
}

export type DiscoveryType = 'commerce' | 'help' | 'doctor' | 'lab' | 'test' | 'pharmacy';

export interface DiscoveryResultItem {
  type: DiscoveryType;
  id: string;
  title: string;
  subtitle: string | null;
  slug: string | null;
  href: string | null;
  in_stock?: boolean;
  content_type?: string;
  category_slug?: string | null;
  online_capable?: boolean;
  city?: string | null;
  lab_org_id?: string | null;
}

export interface DiscoverySearchResponse {
  country: string;
  locale: string;
  country_enabled: boolean;
  discovery_enabled: boolean;
  query: string;
  types: DiscoveryType[];
  data: DiscoveryResultItem[];
  meta: {
    limit: number;
    total: number;
    next_cursor: string | null;
  };
}

export function searchDiscovery(
  country: string,
  q: string,
  locale = 'en',
  types: DiscoveryType[] = ['commerce', 'help'],
) {
  const params = new URLSearchParams({ country, locale, q });
  for (const type of types) {
    params.append('types', type);
  }
  return call<DiscoverySearchResponse>(`api/v1/discovery/search?${params.toString()}`);
}

export function suggestDiscovery(
  country: string,
  q: string,
  locale = 'en',
  types: DiscoveryType[] = ['commerce', 'help'],
) {
  const params = new URLSearchParams({ country, locale, q });
  for (const type of types) {
    params.append('types', type);
  }
  return call<DiscoverySearchResponse>(`api/v1/discovery/suggest?${params.toString()}`);
}

export function fetchProduct(country: string, slug: string) {
  return call<Record<string, unknown>>(`api/v1/catalog/items/${encodeURIComponent(slug)}?country=${country}`);
}

export function fetchCart(token: string, country: string) {
  return call<CustomerCart>(`/api/v1/me/cart?country=${encodeURIComponent(country)}`, { token });
}

export function addCartItem(token: string, country: string, offerId: string, qty: number, idempotencyKey: string) {
  return call(`/api/v1/me/cart/items?country=${encodeURIComponent(country)}`, {
    method: 'POST',
    token,
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({ offer_id: offerId, qty }),
  });
}

export function startCheckout(token: string, country: string, idempotencyKey: string) {
  return call<CheckoutSession>(`/api/v1/me/checkout/sessions?country=${encodeURIComponent(country)}`, {
    method: 'POST',
    token,
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({}),
  });
}

export function payCheckout(
  token: string,
  sessionId: string,
  idempotencyKey: string,
  method = 'CARD',
  scenario = 'success',
) {
  return call(`/api/v1/me/checkout/sessions/${sessionId}/pay`, {
    method: 'POST',
    token,
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({ method, scenario }),
  });
}

export function fetchOrders(token: string) {
  return call<{ data: Array<{ id: string; order_number: string; status: string; total_minor: string; currency: string }> }>(
    'api/v1/me/orders',
    { token },
  );
}

export function fetchShipments(token: string) {
  return call<{ data: Array<{ id: string; status: string; tracking_number?: string }> }>('api/v1/me/shipments', {
    token,
  });
}

export type CatalogCard = {
  id: string;
  slug: string;
  title: string;
  brand: string | null;
  offers: { id: string; currency: string; price: { sell_minor: string } | null }[];
};

export type CustomerCart = {
  items?: Array<{ id: string; title: string; qty: number; currency: string; sell_minor: string | null }>;
  skip_inventory_hold?: boolean;
  dispensing_case_id?: string | null;
  dispense_event_id?: string | null;
};

export type CheckoutSession = {
  id?: string;
  status?: string;
  skip_inventory_hold?: boolean;
  dispensing_case_id?: string | null;
  dispense_event_id?: string | null;
  quote?: { total_minor?: string; currency?: string };
};

export function newIdempotencyKey(prefix = 'mobile'): string {
  return `${prefix}-${Date.now()}`;
}

export type WishlistItem = {
  id: string;
  catalog_offer_id: string;
  product_slug: string;
  product_title: string;
  currency: string;
  sell_minor: string | null;
  available: boolean;
};

export function fetchWishlist(token: string, country: string) {
  return call<{ data: WishlistItem[] }>(
    `api/v1/me/wishlist?country_code=${encodeURIComponent(country)}`,
    { token },
  );
}

export function addWishlistItem(token: string, country: string, catalogOfferId: string) {
  return call(`api/v1/me/wishlist`, {
    method: 'POST',
    token,
    headers: { 'Idempotency-Key': `wishlist-${catalogOfferId}` },
    body: JSON.stringify({ country_code: country, catalog_offer_id: catalogOfferId }),
  });
}

export function removeWishlistItem(token: string, country: string, catalogOfferId: string) {
  return call(
    `api/v1/me/wishlist?country_code=${encodeURIComponent(country)}&catalog_offer_id=${encodeURIComponent(catalogOfferId)}`,
    { method: 'DELETE', token },
  );
}

export function fetchProductReviews(itemId: string, country: string) {
  return call<{ data: Array<{ id: string; rating: number; body: string; title: string }> }>(
    `api/v1/catalog/items/${itemId}/reviews?country=${encodeURIComponent(country)}`,
  );
}

export function fetchProductQuestions(itemId: string, country: string) {
  return call<{ data: Array<{ id: string; body: string; answer_body: string | null }> }>(
    `api/v1/catalog/items/${itemId}/questions?country=${encodeURIComponent(country)}`,
  );
}

export function submitProductReview(
  token: string,
  itemId: string,
  country: string,
  input: { rating: number; body: string; title?: string },
) {
  return call(`api/v1/catalog/items/${itemId}/reviews`, {
    method: 'POST',
    token,
    headers: { 'Idempotency-Key': `m-review-${itemId}` },
    body: JSON.stringify({ country_code: country, ...input }),
  });
}

export function recordProductViewed(token: string, itemId: string, country: string) {
  return call('api/v1/me/personalization/events', {
    method: 'POST',
    token,
    body: JSON.stringify({
      country_code: country,
      event_kind: 'PRODUCT_VIEWED',
      source: 'mobile_pdp',
      source_key: `view-${itemId}`,
      catalog_item_id: itemId,
    }),
  });
}
