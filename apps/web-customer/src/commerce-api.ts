import { apiBaseUrl } from '@world-pharma/shell-core';

const base = () => apiBaseUrl(typeof process === 'undefined' ? {} : process.env);

async function call(path: string, init: RequestInit & { token?: string | null } = {}) {
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
  const res = await fetch(`${base()}${path}`, { ...rest, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw Object.assign(new Error((body as { detail?: string }).detail ?? 'request_failed'), {
      status: res.status,
      code: (body as { code?: string }).code,
    });
  }
  return body;
}

export function fetchCart(token: string, country: string) {
  return call(`/api/v1/me/cart?country=${encodeURIComponent(country)}`, { token });
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
  return call(`/api/v1/me/checkout/sessions?country=${encodeURIComponent(country)}`, {
    method: 'POST',
    token,
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({}),
  });
}

export function applyCheckoutPromo(token: string, sessionId: string, promoCode: string) {
  return call(`/api/v1/me/checkout/sessions/${sessionId}/promo`, {
    method: 'POST',
    token,
    body: JSON.stringify({ promo_code: promoCode }),
  });
}

export function removeCheckoutPromo(token: string, sessionId: string) {
  return call(`/api/v1/me/checkout/sessions/${sessionId}/promo`, {
    method: 'POST',
    token,
    body: JSON.stringify({ promo_code: '' }),
  });
}

export function quoteCheckout(token: string, sessionId: string, idempotencyKey: string) {
  return call(`/api/v1/me/checkout/sessions/${sessionId}/quote`, {
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

export function fetchPaymentIntent(token: string, intentId: string) {
  return call(`/api/v1/me/payments/intents/${intentId}`, { token });
}

export function fetchPaymentMethods(country: string) {
  return call(`/api/v1/payments/methods?country=${encodeURIComponent(country)}`);
}

export function fetchOrders(token: string) {
  return call('/api/v1/me/orders', { token });
}

export function fetchShipments(token: string) {
  return call('/api/v1/me/shipments', { token });
}

export function fetchShipment(token: string, id: string) {
  return call(`/api/v1/me/shipments/${id}`, { token });
}

export function fetchOrder(token: string, idOrNumber: string) {
  return call(`/api/v1/me/orders/${idOrNumber}`, { token });
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

export function fetchWishlist(token: string, countryCode: string) {
  return call(`/api/v1/me/wishlist?country_code=${encodeURIComponent(countryCode)}`, { token }) as Promise<{
    data: WishlistItem[];
  }>;
}

export function addWishlistItem(token: string, countryCode: string, catalogOfferId: string) {
  return call(`/api/v1/me/wishlist`, {
    method: 'POST',
    token,
    headers: { 'Idempotency-Key': `wishlist-${catalogOfferId}` },
    body: JSON.stringify({ country_code: countryCode, catalog_offer_id: catalogOfferId }),
  });
}

export function removeWishlistItem(token: string, countryCode: string, catalogOfferId: string) {
  return call(
    `/api/v1/me/wishlist?country_code=${encodeURIComponent(countryCode)}&catalog_offer_id=${encodeURIComponent(catalogOfferId)}`,
    { method: 'DELETE', token },
  );
}

export function requestOrderCancel(token: string, orderId: string, idempotencyKey: string) {
  return call(`/api/v1/me/orders/${orderId}/cancel`, {
    method: 'POST',
    token,
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({}),
  });
}

export type CartItem = {
  id: string;
  title: string;
  qty: number;
  sell_minor: string | null;
  currency: string;
};

export type CustomerCart = {
  items?: CartItem[];
  seller_org_id?: string;
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
  quote?: {
    total_minor?: string;
    sell_minor?: string;
    discount_minor?: string;
    currency?: string;
    shipping_status?: string;
    tax_status?: string;
    expires_at?: string;
    promo?: { code?: string; discount_minor?: string };
  };
  payment_message?: string;
};

export type CustomerOrder = {
  id: string;
  order_number: string;
  status: string;
  currency: string;
  total_minor: string;
  prescription_id?: string | null;
  dispensing_case_id?: string | null;
  dispense_event_id?: string | null;
  rx_inventory_consumed_at_dispense?: boolean;
  payment?: { payment_intent_id?: string };
};

export type ProductReview = {
  id: string;
  rating: number;
  title: string;
  body: string;
  status?: string;
  pending_moderation?: boolean;
  published?: boolean;
  not_published?: boolean;
  responses?: Array<{ id: string; body: string; created_at: string }>;
  created_at: string;
};

export type ProductQuestion = {
  id: string;
  body: string;
  answer_body: string | null;
  status?: string;
  created_at: string;
};

export function fetchProductReviews(itemId: string, country: string) {
  return call(`/api/v1/catalog/items/${itemId}/reviews?country=${encodeURIComponent(country)}`) as Promise<{
    data: ProductReview[];
  }>;
}

export function fetchProductQuestions(itemId: string, country: string) {
  return call(`/api/v1/catalog/items/${itemId}/questions?country=${encodeURIComponent(country)}`) as Promise<{
    data: ProductQuestion[];
  }>;
}

export function fetchOwnProductReview(token: string, itemId: string, countryCode: string) {
  return call(`/api/v1/me/catalog/items/${itemId}/review?country_code=${encodeURIComponent(countryCode)}`, {
    token,
  }) as Promise<{ review: ProductReview | null }>;
}

export function submitProductReview(
  token: string,
  itemId: string,
  countryCode: string,
  input: { rating: number; title?: string; body: string },
) {
  return call(`/api/v1/catalog/items/${itemId}/reviews`, {
    method: 'POST',
    token,
    headers: { 'Idempotency-Key': `review-${itemId}` },
    body: JSON.stringify({ country_code: countryCode, ...input }),
  });
}

export function submitProductQuestion(token: string, itemId: string, countryCode: string, body: string) {
  return call(`/api/v1/catalog/items/${itemId}/questions`, {
    method: 'POST',
    token,
    headers: { 'Idempotency-Key': `question-${itemId}-${Date.now()}` },
    body: JSON.stringify({ country_code: countryCode, body }),
  });
}

export function recordProductViewed(token: string, itemId: string, countryCode: string) {
  return call('/api/v1/me/personalization/events', {
    method: 'POST',
    token,
    body: JSON.stringify({
      country_code: countryCode,
      event_kind: 'PRODUCT_VIEWED',
      source: 'pdp',
      source_key: `view-${itemId}`,
      catalog_item_id: itemId,
    }),
  });
}

export type RecommendationProduct = {
  item_id: string;
  title: string;
  slug: string;
  brand_name: string;
  category_name: string;
  in_stock: boolean;
  href: string;
};

export type ItemRecommendationsResponse = {
  country: string;
  locale: string;
  item_id: string;
  rule_version: string;
  country_enabled: boolean;
  sections: {
    related: { kind: string; data: RecommendationProduct[] };
    frequently_bought_together: { kind: string; data: RecommendationProduct[] };
  };
};

export function fetchItemRecommendations(itemId: string, country: string, locale = 'en') {
  return call(
    `/api/v1/catalog/items/${encodeURIComponent(itemId)}/recommendations?country=${encodeURIComponent(country)}&locale=${encodeURIComponent(locale)}`,
  ) as Promise<ItemRecommendationsResponse>;
}

export function fetchPersonalRecommendations(token: string, countryCode: string) {
  return call(`/api/v1/me/recommendations?country_code=${encodeURIComponent(countryCode)}`, { token });
}
