import type { APIRequestContext } from '@playwright/test';
import { apiBase } from './auth';

type Json = Record<string, unknown>;

async function jsonOrThrow(res: { ok: () => boolean; status: () => number; json: () => Promise<unknown> }, label: string) {
  const body = await res.json();
  if (!res.ok()) {
    throw new Error(`${label} failed (${res.status()}): ${JSON.stringify(body)}`);
  }
  return body as Json;
}

export async function apiGet(
  request: APIRequestContext,
  path: string,
  token?: string,
): Promise<Json> {
  const res = await request.get(`${apiBase()}${path.startsWith('/') ? path : `/${path}`}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  return jsonOrThrow(res, `GET ${path}`);
}

export async function apiPost(
  request: APIRequestContext,
  path: string,
  data: unknown,
  token?: string,
  headers?: Record<string, string>,
): Promise<Json> {
  const res = await request.post(`${apiBase()}${path.startsWith('/') ? path : `/${path}`}`, {
    data,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });
  return jsonOrThrow(res, `POST ${path}`);
}

export async function createCustomerAddress(
  request: APIRequestContext,
  token: string,
  country: string,
  postal: string,
): Promise<string> {
  const body = await apiPost(
    request,
    '/api/v1/me/addresses',
    {
      country_code: country,
      recipient_name: 'Browser Acceptance Customer',
      phone: country === 'US' ? '+15125550100' : country === 'AE' ? '+971500000000' : '+919999999999',
      city: country === 'US' ? 'Austin' : country === 'AE' ? 'Dubai' : 'Mumbai',
      postal_code: postal,
      line1: '12 Browser Test Lane',
      is_default: true,
    },
    token,
  );
  const id = typeof body.id === 'string' ? body.id : null;
  if (!id) {
    throw new Error(`Address create missing id: ${JSON.stringify(body)}`);
  }
  return id;
}

type CatalogOffer = { id: string };
type CatalogProductResponse = { offers?: CatalogOffer[]; data?: { offers?: CatalogOffer[] } };

export async function fetchPrimaryOfferId(
  request: APIRequestContext,
  slug: string,
  country: string,
): Promise<string> {
  const body = (await apiGet(
    request,
    `/api/v1/catalog/items/${encodeURIComponent(slug)}?country=${encodeURIComponent(country)}`,
  )) as CatalogProductResponse;
  const product = body.data ?? body;
  const offerId = product.offers?.[0]?.id;
  if (!offerId) {
    throw new Error(`No offer for ${slug} in ${country}: ${JSON.stringify(body)}`);
  }
  return offerId;
}

export async function addCartItemApi(
  request: APIRequestContext,
  token: string,
  country: string,
  offerId: string,
): Promise<void> {
  await apiPost(
    request,
    `/api/v1/me/cart/items?country=${encodeURIComponent(country)}`,
    { offer_id: offerId, qty: 1 },
    token,
    { 'Idempotency-Key': `browser-cart-${Date.now()}` },
  );
}
