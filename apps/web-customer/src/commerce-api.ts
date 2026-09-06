import { apiBaseUrl } from '@world-pharma/shell-core';
import { affiliateCodeForCheckout } from './affiliate-attribution';

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

export function notifyCartChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event('wp-cart-changed'));
}

export function fetchCart(token: string, country: string) {
  return call(`/api/v1/me/cart?country=${encodeURIComponent(country)}`, { token });
}

export async function addCartItem(token: string, country: string, offerId: string, qty: number, idempotencyKey: string) {
  const body = await call(`/api/v1/me/cart/items?country=${encodeURIComponent(country)}`, {
    method: 'POST',
    token,
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({ offer_id: offerId, qty }),
  });
  notifyCartChanged();
  return body;
}

export async function updateCartItem(token: string, itemId: string, qty: number, idempotencyKey: string) {
  const body = await call(`/api/v1/me/cart/items/${itemId}`, {
    method: 'PATCH',
    token,
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({ qty }),
  });
  notifyCartChanged();
  return body;
}

export async function removeCartItem(token: string, itemId: string, idempotencyKey: string) {
  const body = await call(`/api/v1/me/cart/items/${itemId}`, {
    method: 'DELETE',
    token,
    headers: { 'Idempotency-Key': idempotencyKey },
  });
  notifyCartChanged();
  return body;
}

export function startCheckout(token: string, country: string, idempotencyKey: string) {
  const affiliate_code = affiliateCodeForCheckout(country);
  return call(`/api/v1/me/checkout/sessions?country=${encodeURIComponent(country)}`, {
    method: 'POST',
    token,
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(affiliate_code ? { affiliate_code } : {}),
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

export function quoteCheckout(token: string, sessionId: string, idempotencyKey: string, loyaltyPoints = 0) {
  return call(`/api/v1/me/checkout/sessions/${sessionId}/quote`, {
    method: 'POST',
    token,
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({ loyalty_points: loyaltyPoints }),
  });
}

export function attachCheckoutAddress(token: string, sessionId: string, addressId: string) {
  return call(`/api/v1/me/checkout/sessions/${sessionId}/fulfillment`, {
    method: 'POST',
    token,
    body: JSON.stringify({ address_id: addressId }),
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

export function completeUpiPayment(token: string, intentId: string, idempotencyKey: string) {
  return call(`/api/v1/me/payments/intents/${intentId}/complete-upi`, {
    method: 'POST',
    token,
    headers: { 'Idempotency-Key': idempotencyKey },
  });
}

export function fetchPaymentMethods(country: string) {
  return call(`/api/v1/payments/methods?country=${encodeURIComponent(country)}`);
}

export function fetchOrders(token: string) {
  return call('/api/v1/me/orders', { token });
}

export function createOrderFromPayment(token: string, paymentIntentId: string, idempotencyKey: string) {
  return call('/api/v1/me/orders', {
    method: 'POST',
    token,
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({ payment_intent_id: paymentIntentId }),
  });
}

export function fetchShipments(token: string) {
  return call('/api/v1/me/shipments', { token });
}

export function fetchShipment(token: string, id: string) {
  return call(`/api/v1/me/shipments/${id}`, { token });
}

export type CustomerShipmentDetail = {
  id: string;
  status: string;
  tracking_number?: string | null;
  service_level?: string | null;
  sandbox?: boolean;
  message?: string;
  timeline: Array<{ status: string; at: string; description?: string | null }>;
  latest_event?: { status: string; at: string } | null;
  live_tracking?: boolean;
  expected_delivery?: string | null;
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

export type CustomerOrderShipment = {
  id: string;
  status: string;
  tracking_number?: string | null;
  carrier?: string;
  sandbox?: boolean;
  pod?: {
    delivered?: boolean;
    otp_recorded?: boolean;
    photo_attached?: boolean;
    signature_attached?: boolean;
    sandbox?: boolean;
    note?: string;
  } | null;
};

export function fetchOrder(token: string, idOrNumber: string) {
  return call(`/api/v1/me/orders/${idOrNumber}`, { token });
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

/** Poll while rider job is active — sandbox GPS / presence, not live carrier tiles. */
export function fetchOrderLiveTracking(token: string, idOrNumber: string) {
  return call(`/api/v1/me/orders/${encodeURIComponent(idOrNumber)}/tracking/live`, {
    token,
  }) as Promise<LiveTrackingPayload>;
}

export type ReorderResult = {
  order_id: string;
  order_number: string;
  added: Array<{
    offer_id: string;
    title: string;
    qty: number;
    current_sell_minor?: string;
    rx_required?: boolean;
  }>;
  unavailable: Array<{
    offer_id: string;
    title: string;
    qty: number;
    reason_code: string;
    reason: string;
  }>;
  cart: unknown;
  sandbox?: boolean;
  message?: string;
};

export async function reorderOrder(
  token: string,
  orderId: string,
  countryCode: string,
  idempotencyKey: string,
  postalCode?: string,
) {
  const body = await call(`/api/v1/me/orders/${orderId}/reorder`, {
    method: 'POST',
    token,
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({ country_code: countryCode, postal_code: postalCode }),
  });
  notifyCartChanged();
  return body as ReorderResult;
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
  return call(`/api/v1/me/orders/${orderId}/returns`, {
    method: 'POST',
    token,
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(input),
  });
}

export function requestOrderRefund(token: string, orderId: string, idempotencyKey = `refund-${orderId}`) {
  return call(`/api/v1/me/orders/${orderId}/refund`, {
    method: 'POST',
    token,
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({}),
  });
}

export type CartItem = {
  id: string;
  offer_id?: string;
  title: string;
  qty: number;
  sell_minor: string | null;
  currency: string;
  image_url?: string | null;
  seller_org_id?: string;
  seller_display_name?: string;
  rx_required?: boolean;
};

export type CustomerCart = {
  items?: CartItem[];
  seller_org_id?: string;
  seller_display_name?: string;
  single_seller_cart?: boolean;
  skip_inventory_hold?: boolean;
  dispensing_case_id?: string | null;
  dispense_event_id?: string | null;
};

export type CheckoutQuotePayload = {
  sell_minor?: string;
  subtotal_minor?: string;
  discount_minor?: string;
  platform_fee_minor?: string;
  packaging_fee_minor?: string;
  handling_fee_minor?: string;
  payment_convenience_fee_minor?: string;
  delivery_fee_minor?: string;
  carrier_actual_cost_minor?: string;
  delivery_subsidy_minor?: string;
  tax_minor?: string;
  shipping_minor?: string;
  total_minor?: string;
  promo?: { code?: string; discount_minor?: string };
  loyalty?: { points_applied?: number; discount_minor?: string };
  care_plan?: {
    plan_code?: string;
    name?: string;
    discount_bps?: number;
    discount_minor?: string;
    free_delivery?: boolean;
  };
};

export type CheckoutAddress = {
  id: string;
  recipient_name?: string;
  city?: string;
  line1?: string;
  line2?: string | null;
  postal_code?: string | null;
};

export type CheckoutSession = {
  id?: string;
  status?: string;
  seller_org_id?: string;
  seller_display_name?: string;
  single_seller_checkout?: boolean;
  skip_inventory_hold?: boolean;
  dispensing_case_id?: string | null;
  dispense_event_id?: string | null;
  address?: CheckoutAddress | null;
  quote?: {
    total_minor?: string;
    sell_minor?: string;
    discount_minor?: string;
    tax_minor?: string;
    shipping_minor?: string;
    currency?: string;
    shipping_status?: string;
    tax_status?: string;
    expires_at?: string;
    promo?: { code?: string; discount_minor?: string };
    payload?: CheckoutQuotePayload;
  };
  payment_message?: string;
};

export type CustomerOrder = {
  id: string;
  order_number: string;
  status: string;
  currency: string;
  goods_minor?: string;
  discount_minor?: string;
  tax_minor?: string;
  shipping_minor?: string;
  total_minor: string;
  sandbox?: boolean;
  seller_org_id?: string;
  seller_name?: string | null;
  prescription_id?: string | null;
  dispensing_case_id?: string | null;
  dispense_event_id?: string | null;
  rx_inventory_consumed_at_dispense?: boolean;
  payment?: { payment_intent_id?: string; status?: string };
  payment_intent_id?: string | null;
  payment_status?: string;
  delivery_status?: string | null;
  return_status?: string | null;
  reorder_eligible?: boolean;
  shipments?: CustomerOrderShipment[];
  returns?: Array<{
    id: string;
    status?: string;
    reason: string;
    note?: string | null;
    created_at?: string;
    createdAt?: string;
    pickup_slot_start?: string | null;
    pickup_slot_end?: string | null;
    shipment_id?: string | null;
    tracking_number?: string | null;
  }>;
  timeline?: Array<{
    status: string;
    from_status?: string | null;
    reason?: string | null;
    at: string;
  }>;
  pod?: {
    shipments: Array<{
      shipment_id: string;
      delivered?: boolean;
      otp_recorded?: boolean;
      photo_attached?: boolean;
      signature_attached?: boolean;
      sandbox?: boolean;
      note?: string;
    }>;
    sandbox?: boolean;
  } | null;
  history?: Array<{
    fromStatus?: string | null;
    toStatus: string;
    reason?: string | null;
    createdAt: string;
  }>;
  tracking?: {
    live?: LiveTrackingPayload | null;
  };
  items?: Array<{
    id: string;
    sku: string;
    title?: string;
    qty: number;
    unit_minor: string;
    line_minor: string;
    offer_id?: string;
    variant_id?: string;
    catalog_item_id?: string | null;
    product_slug?: string | null;
    rx_required?: boolean;
  }>;
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
  image_url?: string | null;
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
