import { apiFetch } from '@world-pharma/shell-core';

export class StoreApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function scopeQuery(organizationId: string, locationId: string) {
  return `organization_id=${encodeURIComponent(organizationId)}&location_id=${encodeURIComponent(locationId)}`;
}

export function newIdempotencyKey(): string {
  return `idem-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function call<T>(path: string, token: string, init: Parameters<typeof apiFetch>[1] = {}): Promise<T> {
  const res = await apiFetch(path, { ...init, accessToken: token });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new StoreApiError((body as { detail?: string }).detail ?? 'request_failed', res.status);
  }
  return body as T;
}

export function fetchOrganizations(token: string) {
  return call<{ data: Array<{ id: string; display_name: string }> }>('api/v1/store/organizations', token);
}

export function fetchLocations(token: string, organizationId: string) {
  return call<{ data: Array<{ id: string; name: string; kind: string }> }>(
    `api/v1/store/locations?organization_id=${encodeURIComponent(organizationId)}`,
    token,
  );
}

export function fetchDashboard(token: string, organizationId: string, locationId: string) {
  return call<Record<string, unknown>>(`api/v1/store/dashboard?${scopeQuery(organizationId, locationId)}`, token);
}

export function fetchOrders(token: string, organizationId: string, locationId: string) {
  return call<{ data: Array<{ id: string; order_number: string; status: string }> }>(
    `api/v1/store/orders?${scopeQuery(organizationId, locationId)}`,
    token,
  );
}

export function fetchLots(token: string, organizationId: string, locationId: string) {
  return call<{ data: Array<{ id: string; lot_code: string; sku?: string; on_hand: number; expires_on?: string }> }>(
    `api/v1/store/lots?${scopeQuery(organizationId, locationId)}`,
    token,
  );
}

export function fetchExceptions(token: string, organizationId: string, locationId: string) {
  return call<{
    pick_tasks: Array<{ id: string; order_number: string; status: string }>;
    pack_tasks: Array<{ id: string; order_number: string; status: string; exception: string | null }>;
  }>(`api/v1/store/exceptions?${scopeQuery(organizationId, locationId)}`, token);
}

export function createGrn(
  token: string,
  organizationId: string,
  locationId: string,
  body: { idempotency_key: string; lines: Array<{ variant_id: string; lot_code: string; qty: number }> },
) {
  return call(`api/v1/store/grn?${scopeQuery(organizationId, locationId)}`, token, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function postGrn(token: string, organizationId: string, locationId: string, receiptId: string) {
  return call(`api/v1/store/grn/${receiptId}/post?${scopeQuery(organizationId, locationId)}`, token, {
    method: 'POST',
  });
}

export function adjustLot(
  token: string,
  organizationId: string,
  locationId: string,
  body: { lot_id: string; qty_delta: number; reason_code: string; idempotency_key: string },
) {
  return call(`api/v1/store/adjustments?${scopeQuery(organizationId, locationId)}`, token, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function startPick(token: string, organizationId: string, locationId: string, orderId: string) {
  return call(`api/v1/store/orders/${orderId}/pick/start?${scopeQuery(organizationId, locationId)}`, token, {
    method: 'POST',
  });
}

export function completePick(token: string, organizationId: string, locationId: string, orderId: string) {
  return call(`api/v1/store/orders/${orderId}/pick/complete?${scopeQuery(organizationId, locationId)}`, token, {
    method: 'POST',
  });
}

export function completePack(token: string, organizationId: string, locationId: string, orderId: string) {
  return call(`api/v1/store/orders/${orderId}/pack/complete?${scopeQuery(organizationId, locationId)}`, token, {
    method: 'POST',
  });
}

export function readyOrder(token: string, organizationId: string, locationId: string, orderId: string) {
  return call(`api/v1/store/orders/${orderId}/ready?${scopeQuery(organizationId, locationId)}`, token, {
    method: 'POST',
  });
}

export type DispensingCaseSummary = {
  id: string;
  status: string;
  prescription_id: string;
  version_number?: number | null;
  location_id?: string | null;
};

export type DispensingCaseDetail = DispensingCaseSummary & {
  order_id?: string | null;
  rejected_reason_code?: string | null;
  refill_request_id?: string | null;
  events?: Array<{ id: string; kind: string; meta?: { refill_request_id?: string } }>;
  lines?: Array<{
    id: string;
    line_number: number;
    clinical_concept_label: string;
    quantity_authorized: string;
    suggested_catalog_item_id?: string | null;
  }>;
  mappings?: Array<{
    prescription_line_id: string;
    catalog_item_id: string;
    catalog_variant_id: string;
    inventory_lot_id: string;
    quantity_dispensed: string;
    confirm_substitution?: boolean;
  }>;
};

export type DispensingLot = {
  id: string;
  lot_code: string;
  available: number;
  expires_on?: string | null;
};

export type MapDispenseLineInput = {
  prescription_line_id: string;
  catalog_item_id: string;
  catalog_variant_id: string;
  inventory_lot_id: string;
  quantity_dispensed: string;
  confirm_substitution?: boolean;
};

function withIdempotency(idempotencyKey: string, init: Parameters<typeof apiFetch>[1] = {}) {
  return {
    ...init,
    headers: { ...(init.headers as Record<string, string> | undefined), 'Idempotency-Key': idempotencyKey },
  };
}

export function fetchDispensingCases(token: string, organizationId: string, locationId: string) {
  return call<{ cases: DispensingCaseSummary[] }>(
    `api/v1/store/dispensing-cases?${scopeQuery(organizationId, locationId)}`,
    token,
  );
}

export function fetchDispensingCase(
  token: string,
  organizationId: string,
  locationId: string,
  caseId: string,
) {
  return call<DispensingCaseDetail>(
    `api/v1/store/dispensing-cases/${caseId}?${scopeQuery(organizationId, locationId)}`,
    token,
  );
}

export function claimDispensingCase(
  token: string,
  organizationId: string,
  locationId: string,
  caseId: string,
  idempotencyKey: string,
) {
  return call<DispensingCaseDetail>(
    `api/v1/store/dispensing-cases/${caseId}/claim?${scopeQuery(organizationId, locationId)}`,
    token,
    withIdempotency(idempotencyKey, { method: 'POST', body: '{}' }),
  );
}

export function validateDispensingCase(
  token: string,
  organizationId: string,
  locationId: string,
  caseId: string,
  idempotencyKey: string,
) {
  return call<DispensingCaseDetail>(
    `api/v1/store/dispensing-cases/${caseId}/validate?${scopeQuery(organizationId, locationId)}`,
    token,
    withIdempotency(idempotencyKey, { method: 'POST', body: '{}' }),
  );
}

export function rejectDispensingCase(
  token: string,
  organizationId: string,
  locationId: string,
  caseId: string,
  payload: { reason_code: string; idempotency_key: string },
) {
  return call<DispensingCaseDetail>(
    `api/v1/store/dispensing-cases/${caseId}/reject?${scopeQuery(organizationId, locationId)}`,
    token,
    withIdempotency(payload.idempotency_key, { method: 'POST', body: JSON.stringify(payload) }),
  );
}

export function authorizeDispensingCase(
  token: string,
  organizationId: string,
  locationId: string,
  caseId: string,
  idempotencyKey: string,
) {
  return call<DispensingCaseDetail>(
    `api/v1/store/dispensing-cases/${caseId}/authorize?${scopeQuery(organizationId, locationId)}`,
    token,
    withIdempotency(idempotencyKey, { method: 'POST', body: '{}' }),
  );
}

export function mapDispensingLines(
  token: string,
  organizationId: string,
  locationId: string,
  caseId: string,
  payload: { lines: MapDispenseLineInput[]; idempotency_key: string },
) {
  return call<DispensingCaseDetail>(
    `api/v1/store/dispensing-cases/${caseId}/map-lines?${scopeQuery(organizationId, locationId)}`,
    token,
    withIdempotency(payload.idempotency_key, { method: 'POST', body: JSON.stringify(payload) }),
  );
}

export function completeDispensingCase(
  token: string,
  organizationId: string,
  locationId: string,
  caseId: string,
  idempotencyKey: string,
) {
  return call<DispensingCaseDetail>(
    `api/v1/store/dispensing-cases/${caseId}/complete?${scopeQuery(organizationId, locationId)}`,
    token,
    withIdempotency(idempotencyKey, { method: 'POST', body: '{}' }),
  );
}

export function fetchDispensingLots(
  token: string,
  organizationId: string,
  locationId: string,
  variantId: string,
) {
  return call<{ lots: DispensingLot[] }>(
    `api/v1/store/dispensing-lots?${scopeQuery(organizationId, locationId)}&variant_id=${encodeURIComponent(variantId)}`,
    token,
  );
}

export type CatalogOffer = {
  id: string;
  variantId?: string;
  variant_id?: string;
  variant?: { id: string; sku?: string | null; item?: { title?: string | null } | null };
};

export function fetchCatalogOffers(token: string, sellerOrgId: string) {
  return call<CatalogOffer[]>(
    `api/v1/vendor/catalog/offers?seller_org_id=${encodeURIComponent(sellerOrgId)}`,
    token,
  );
}

export function catalogVariantId(offer: CatalogOffer): string {
  return offer.variant?.id ?? offer.variantId ?? offer.variant_id ?? offer.id;
}

export function catalogVariantLabel(offer: CatalogOffer): string {
  const title = offer.variant?.item?.title;
  const sku = offer.variant?.sku;
  const id = catalogVariantId(offer).slice(0, 8);
  return [title, sku, id].filter(Boolean).join(' · ');
}

export function isRefillDispensingCase(detail: DispensingCaseDetail): boolean {
  if (detail.refill_request_id) {
    return true;
  }
  return detail.events?.some((event) => Boolean(event.meta?.refill_request_id)) ?? false;
}

export type StoreSupportTicket = {
  id: string;
  subject: string;
  body: string;
  status: string;
  reference_type?: string;
  reference_id?: string;
  created_at: string;
  category?: string;
  note?: string;
};

export function fetchStoreSupportTickets(token: string) {
  return call<{ data: StoreSupportTicket[] }>('api/v1/store/support/tickets', token);
}

export function createStoreSupportTicket(
  token: string,
  body: {
    organization_id: string;
    location_id: string;
    subject: string;
    body: string;
    reference_type?: string;
    reference_id?: string;
  },
) {
  return call<StoreSupportTicket>('api/v1/store/support/tickets', token, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export type StoreInboxItem = {
  id: string;
  title: string;
  body: string;
  read: boolean;
  created_at: string;
  reference_type?: string;
};

export function fetchStoreNotificationInbox(token: string) {
  return call<{ data: StoreInboxItem[] }>('api/v1/me/notifications/inbox', token);
}

export function markStoreNotificationRead(token: string, id: string) {
  return call<{ data: StoreInboxItem[] }>(`api/v1/me/notifications/inbox/${id}/read`, token, { method: 'POST' });
}
