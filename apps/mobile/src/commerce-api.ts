import { apiBaseUrl } from '@world-pharma/shell-core';
import { affiliateCodeForCheckout } from './affiliate-attribution';

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
  rx_required?: boolean;
  min_sell_minor?: string | null;
  max_discount_pct?: number | null;
  avg_rating?: number | null;
  review_count?: number;
  manufacturer?: string | null;
  composition?: string | null;
  brand?: string | null;
  category?: string | null;
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
  opts?: {
    cursor?: string;
    sort?: 'relevance' | 'price_asc' | 'price_desc' | 'rating' | 'discount';
    rx?: boolean;
    in_stock?: boolean;
    brand?: string;
    manufacturer?: string;
  },
) {
  const params = new URLSearchParams({ country, locale, q });
  for (const type of types) {
    params.append('types', type);
  }
  if (opts?.cursor) {
    params.set('cursor', opts.cursor);
  }
  if (opts?.sort) {
    params.set('sort', opts.sort);
  }
  if (opts?.rx !== undefined) {
    params.set('rx', opts.rx ? 'true' : 'false');
  }
  if (opts?.in_stock !== undefined) {
    params.set('in_stock', opts.in_stock ? 'true' : 'false');
  }
  if (opts?.brand) {
    params.set('brand', opts.brand);
  }
  if (opts?.manufacturer) {
    params.set('manufacturer', opts.manufacturer);
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

export function fetchProduct(country: string, slug: string, postalCode?: string) {
  const params = new URLSearchParams({ country });
  if (postalCode) {
    params.set('postal_code', postalCode);
  }
  return call<Record<string, unknown>>(`api/v1/catalog/items/${encodeURIComponent(slug)}?${params}`);
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

export function updateCartItem(token: string, itemId: string, qty: number, idempotencyKey: string) {
  return call(`/api/v1/me/cart/items/${itemId}`, {
    method: 'PATCH',
    token,
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({ qty }),
  });
}

export function removeCartItem(token: string, itemId: string, idempotencyKey: string) {
  return call(`/api/v1/me/cart/items/${itemId}`, {
    method: 'DELETE',
    token,
    headers: { 'Idempotency-Key': idempotencyKey },
  });
}

export function startCheckout(token: string, country: string, idempotencyKey: string) {
  const affiliate_code = affiliateCodeForCheckout(country);
  return call<CheckoutSession>(`/api/v1/me/checkout/sessions?country=${encodeURIComponent(country)}`, {
    method: 'POST',
    token,
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(affiliate_code ? { affiliate_code } : {}),
  });
}

export function attachCheckoutAddress(token: string, sessionId: string, addressId: string) {
  return call(`/api/v1/me/checkout/sessions/${sessionId}/fulfillment`, {
    method: 'POST',
    token,
    body: JSON.stringify({ address_id: addressId }),
  });
}

export function quoteCheckout(token: string, sessionId: string, idempotencyKey: string, loyaltyPoints = 0) {
  return call<CheckoutSession>(`/api/v1/me/checkout/sessions/${sessionId}/quote`, {
    method: 'POST',
    token,
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({ loyalty_points: loyaltyPoints }),
  });
}

export function applyCheckoutPromo(token: string, sessionId: string, promoCode: string) {
  return call<CheckoutSession>(`/api/v1/me/checkout/sessions/${sessionId}/promo`, {
    method: 'POST',
    token,
    body: JSON.stringify({ promo_code: promoCode }),
  });
}

export function removeCheckoutPromo(token: string, sessionId: string) {
  return call<CheckoutSession>(`/api/v1/me/checkout/sessions/${sessionId}/promo`, {
    method: 'POST',
    token,
    body: JSON.stringify({ promo_code: '' }),
  });
}

export function fetchPaymentMethods(country: string) {
  return call<{ methods: Array<{ family: string; label: string }>; message?: string }>(
    `/api/v1/payments/methods?country=${encodeURIComponent(country)}`,
  );
}

export function fetchPaymentIntent(token: string, intentId: string) {
  return call(`/api/v1/me/payments/intents/${intentId}`, { token });
}

export function completeUpiPayment(token: string, intentId: string, idempotencyKey: string) {
  return call(`/api/v1/me/payments/intents/${intentId}/complete-upi`, {
    method: 'POST',
    token,
    headers: { 'Idempotency-Key': idempotencyKey },
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
  return call<{
    data: Array<{
      id: string;
      order_number: string;
      status: string;
      total_minor: string;
      currency: string;
      payment_status?: string;
      delivery_status?: string | null;
      reorder_eligible?: boolean;
    }>;
  }>('api/v1/me/orders', { token });
}

export type BuyAgainItem = {
  offer_id: string;
  sku: string;
  title: string;
  product_title?: string;
  product_slug?: string | null;
  times_ordered: number;
  last_qty: number;
  available: boolean;
  sell_minor?: string | null;
  currency?: string | null;
};

export function fetchBuyAgain(token: string) {
  return call<{ data: BuyAgainItem[] }>('api/v1/me/orders/buy-again', { token });
}

export type LocatorStore = {
  id: string;
  name: string;
  address: string;
  city: string;
  pincode: string;
  area?: string;
};

export function fetchPublicStores(country: string) {
  return call<{ stores: LocatorStore[] }>(
    `api/v1/public/store-locator/nearby?country_code=${encodeURIComponent(country)}`,
  );
}

export type CustomerOrderDetail = {
  id: string;
  order_number: string;
  status: string;
  total_minor: string;
  currency: string;
  goods_minor?: string;
  payment_status?: string;
  delivery_status?: string | null;
  return_status?: string | null;
  seller_name?: string | null;
  reorder_eligible?: boolean;
  items?: Array<{
    id: string;
    sku: string;
    title?: string;
    qty: number;
    unit_minor: string;
    line_minor: string;
    offer_id?: string;
    rx_required?: boolean;
  }>;
  shipments?: Array<{
    id: string;
    status: string;
    tracking_number?: string | null;
    pod?: {
      delivered?: boolean;
      otp_recorded?: boolean;
      photo_attached?: boolean;
      signature_attached?: boolean;
      sandbox?: boolean;
      note?: string;
    } | null;
  }>;
  timeline?: Array<{ status: string; reason?: string | null; at: string }>;
  returns?: Array<{ id: string; status?: string; reason: string }>;
  payment?: { status?: string };
  tracking?: {
    live?: LiveTrackingPayload | null;
  };
};

export type ReturnReasonCode =
  | 'WRONG_ITEM'
  | 'DAMAGED'
  | 'DELIVERY_FAILURE'
  | 'CUSTOMER_REFUSAL'
  | 'OTHER_POLICY_ALLOWED';

export function requestOrderReturn(
  token: string,
  orderId: string,
  input: { reason: ReturnReasonCode; note?: string },
  idempotencyKey = `return-${orderId}`,
) {
  return call(`/api/v1/me/orders/${encodeURIComponent(orderId)}/returns`, {
    method: 'POST',
    token,
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(input),
  });
}

export function requestOrderRefund(token: string, orderId: string, idempotencyKey = `refund-${orderId}`) {
  return call(`/api/v1/me/orders/${encodeURIComponent(orderId)}/refund`, {
    method: 'POST',
    token,
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({}),
  });
}

export type ReorderResult = {
  order_id: string;
  order_number: string;
  added: Array<{ offer_id: string; title: string; qty: number; current_sell_minor?: string; rx_required?: boolean }>;
  unavailable: Array<{ offer_id: string; title: string; qty: number; reason_code: string; reason: string }>;
  message?: string;
};

export function reorderOrder(
  token: string,
  orderId: string,
  countryCode: string,
  idempotencyKey: string,
  postalCode?: string,
) {
  return call<ReorderResult>(`api/v1/me/orders/${encodeURIComponent(orderId)}/reorder`, {
    method: 'POST',
    token,
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({ country_code: countryCode, postal_code: postalCode }),
  });
}

export function fetchOrder(token: string, idOrNumber: string) {
  return call<CustomerOrderDetail>(`api/v1/me/orders/${encodeURIComponent(idOrNumber)}`, { token });
}

export type LiveTrackShipment = {
  shipment_id: string;
  job_id: string | null;
  job_status: string | null;
  assignee_id: string | null;
  last_lat: number | null;
  last_lng: number | null;
  last_event_type: string | null;
  last_event_at: string | null;
  pickup: {
    postal_code: string | null;
    city: string | null;
    lat: number | null;
    lng: number | null;
  } | null;
  drop: { postal_code: string | null; city: string | null } | null;
};

export type LiveTrackingPayload = {
  sandbox: true;
  shipments: LiveTrackShipment[];
  message: string;
};

export function fetchOrderLiveTracking(token: string, idOrNumber: string) {
  return call<LiveTrackingPayload>(
    `api/v1/me/orders/${encodeURIComponent(idOrNumber)}/tracking/live`,
    { token },
  );
}

export function fetchShipments(token: string) {
  return call<{ data: Array<{ id: string; status: string; tracking_number?: string }> }>('api/v1/me/shipments', {
    token,
  });
}

export type CustomerShipmentDetail = {
  id: string;
  status: string;
  tracking_number?: string | null;
  service_level?: string | null;
  message?: string;
  sandbox?: boolean;
  timeline: Array<{ status: string; at: string; description?: string | null }>;
  attempts: Array<{ attempt_no: number; status: string; reason?: string | null; at?: string | null }>;
  pod?: {
    delivered?: boolean;
    otp_recorded?: boolean;
    photo_attached?: boolean;
    signature_attached?: boolean;
    sandbox?: boolean;
    note?: string;
  } | null;
};

export function fetchShipment(token: string, id: string) {
  return call<CustomerShipmentDetail>(`api/v1/me/shipments/${id}`, { token });
}

export type CatalogCard = {
  id: string;
  slug: string;
  kind?: string;
  title: string;
  brand: string | null;
  category?: string | null;
  rx_required?: boolean;
  assets?: { url: string; alt: string }[];
  offers: {
    id: string;
    currency: string;
    pack_size?: string;
    seller_display_name?: string;
    price: { sell_minor: string; list_minor?: string | null } | null;
  }[];
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
  address?: { id?: string } | null;
  promo?: { code?: string; discount_minor?: string };
  quote?: {
    total_minor?: string;
    sell_minor?: string;
    discount_minor?: string;
    currency?: string;
    payload?: { loyalty?: { points_applied: number; discount_minor: string } };
  };
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
  best_offer_id: string | null;
  unavailable_reason: string | null;
  href: string;
  image_url: string | null;
};

export function fetchRecentlyViewed(token: string, country: string) {
  return call<{ data: RecentlyViewedProduct[] }>(
    `api/v1/me/recently-viewed?country_code=${encodeURIComponent(country)}`,
    { token },
  );
}

export type CustomerPromoHint = {
  code: string;
  kind: string;
  percent_bps: number;
  fixed_minor: string;
  min_basket_minor: string;
  expires_at: string | null;
  funding: string;
};

export function fetchAvailablePromos(token: string, country: string) {
  return call<{ data: CustomerPromoHint[]; message?: string }>(
    `api/v1/me/promo/available?country_code=${encodeURIComponent(country)}`,
    { token },
  );
}
