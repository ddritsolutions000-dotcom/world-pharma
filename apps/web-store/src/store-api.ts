import { apiBaseUrl } from '@world-pharma/shell-core';

const base = () => apiBaseUrl(typeof process === 'undefined' ? {} : process.env);

export class StoreApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function call<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  headers.set('Authorization', `Bearer ${token}`);
  const res = await fetch(`${base()}${path}`, { ...init, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new StoreApiError(
      (body as { detail?: string }).detail ?? 'request_failed',
      res.status,
      (body as { code?: string }).code,
    );
  }
  return body as T;
}

function scopeQuery(organizationId: string, locationId: string) {
  return `organization_id=${encodeURIComponent(organizationId)}&location_id=${encodeURIComponent(locationId)}`;
}

export function newIdempotencyKey(): string {
  return globalThis.crypto?.randomUUID?.() ?? `idem-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export type StoreOrganization = { id: string; display_name: string; legal_name: string };
export type StoreLocation = { id: string; name: string; kind: string; organization_id: string };
export type StoreLot = {
  id: string;
  lot_code: string;
  sku?: string;
  expires_on?: string | null;
  on_hand: number;
  available: number;
  status: string;
};
export type StoreOrder = {
  id: string;
  order_number: string;
  status: string;
  item_count: number;
  shipment_status: string | null;
  dispensing_case_id?: string | null;
};
export type StoreException = {
  pick_tasks: Array<{
    id: string;
    order_id: string;
    order_number: string;
    status: string;
    required_qty: number;
    picked_qty: number;
  }>;
  pack_tasks: Array<{
    id: string;
    order_id: string;
    order_number: string;
    status: string;
    exception: string | null;
  }>;
};

export function fetchStoreOrganizations(token: string) {
  return call<{ data: StoreOrganization[] }>('/api/v1/store/organizations', token);
}

export function fetchStoreLocations(token: string, organizationId: string) {
  return call<{ data: StoreLocation[] }>(
    `/api/v1/store/locations?organization_id=${encodeURIComponent(organizationId)}`,
    token,
  );
}

export function fetchStoreDashboard(token: string, organizationId: string, locationId: string) {
  return call<Record<string, unknown>>(
    `/api/v1/store/dashboard?${scopeQuery(organizationId, locationId)}`,
    token,
  );
}

export function fetchStoreOrders(token: string, organizationId: string, locationId: string) {
  return call<{ data: StoreOrder[] }>(`/api/v1/store/orders?${scopeQuery(organizationId, locationId)}`, token);
}

export function fetchStoreLots(token: string, organizationId: string, locationId: string) {
  return call<{ data: StoreLot[] }>(`/api/v1/store/lots?${scopeQuery(organizationId, locationId)}`, token);
}

export function fetchStoreExceptions(token: string, organizationId: string, locationId: string) {
  return call<StoreException>(`/api/v1/store/exceptions?${scopeQuery(organizationId, locationId)}`, token);
}

export function createStoreGrn(
  token: string,
  organizationId: string,
  locationId: string,
  payload: {
    idempotency_key: string;
    lines: Array<{ variant_id: string; lot_code: string; qty: number; expires_on?: string }>;
  },
) {
  return call(`/api/v1/store/grn?${scopeQuery(organizationId, locationId)}`, token, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function receiveStoreGrn(token: string, organizationId: string, locationId: string, receiptId: string) {
  return call(`/api/v1/store/grn/${receiptId}/receive?${scopeQuery(organizationId, locationId)}`, token, {
    method: 'POST',
  });
}

export function postStoreGrn(token: string, organizationId: string, locationId: string, receiptId: string) {
  return call(`/api/v1/store/grn/${receiptId}/post?${scopeQuery(organizationId, locationId)}`, token, {
    method: 'POST',
  });
}

export function adjustStoreLot(
  token: string,
  organizationId: string,
  locationId: string,
  payload: { lot_id: string; qty_delta: number; reason_code: string; idempotency_key: string },
) {
  return call(`/api/v1/store/adjustments?${scopeQuery(organizationId, locationId)}`, token, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function startStorePick(token: string, organizationId: string, locationId: string, orderId: string) {
  return call(`/api/v1/store/orders/${orderId}/pick/start?${scopeQuery(organizationId, locationId)}`, token, {
    method: 'POST',
  });
}

export function completeStorePick(token: string, organizationId: string, locationId: string, orderId: string) {
  return call(`/api/v1/store/orders/${orderId}/pick/complete?${scopeQuery(organizationId, locationId)}`, token, {
    method: 'POST',
  });
}

export function completeStorePack(token: string, organizationId: string, locationId: string, orderId: string) {
  return call(`/api/v1/store/orders/${orderId}/pack/complete?${scopeQuery(organizationId, locationId)}`, token, {
    method: 'POST',
  });
}

export function readyStoreOrder(token: string, organizationId: string, locationId: string, orderId: string) {
  return call(`/api/v1/store/orders/${orderId}/ready?${scopeQuery(organizationId, locationId)}`, token, {
    method: 'POST',
  });
}

export type DispensingCaseSummary = {
  id: string;
  status: string;
  prescription_id: string;
  prescription_status?: string | null;
  prescription_version_id: string;
  version_number?: number | null;
  patient_person_id?: string | null;
  encounter_id?: string | null;
  organization_id?: string | null;
  location_id?: string | null;
  created_at: string;
  updated_at: string;
};

export type DispensingCaseLine = {
  id: string;
  line_number: number;
  clinical_concept_code: string;
  clinical_concept_label: string;
  dosage_instructions: string;
  quantity_authorized: string;
  quantity_unit?: string | null;
  substitution_allowed?: boolean;
  suggested_catalog_item_id?: string | null;
};

export type DispensingCaseDetail = DispensingCaseSummary & {
  rejected_reason_code?: string | null;
  lines?: DispensingCaseLine[];
  mappings?: Array<{
    prescription_line_id: string;
    catalog_item_id: string;
    catalog_variant_id: string;
    inventory_lot_id: string;
    quantity_dispensed: string;
    confirm_substitution?: boolean;
  }>;
  events?: Array<{ id: string; kind: string; reason_code?: string | null; created_at: string; meta?: { refill_request_id?: string } }>;
  /** Present when patient completed Order-from-Rx handoff (optional / future). */
  order_id?: string | null;
  /** Present when case was queued from an approved refill request. */
  refill_request_id?: string | null;
  note?: string;
};

export type DispensingLot = {
  id: string;
  lot_code: string;
  variant_id: string;
  expires_on?: string | null;
  available: number;
  status: string;
};

export type MapDispenseLineInput = {
  prescription_line_id: string;
  catalog_item_id: string;
  catalog_variant_id: string;
  inventory_lot_id: string;
  quantity_dispensed: string;
  confirm_substitution?: boolean;
};

function withIdempotencyHeader(idempotencyKey: string, init: RequestInit = {}): RequestInit {
  const headers = new Headers(init.headers);
  headers.set('Idempotency-Key', idempotencyKey);
  return { ...init, headers };
}

export function fetchDispensingCases(token: string, organizationId: string, locationId: string) {
  return call<{ cases: DispensingCaseSummary[] }>(
    `/api/v1/store/dispensing-cases?${scopeQuery(organizationId, locationId)}`,
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
    `/api/v1/store/dispensing-cases/${caseId}?${scopeQuery(organizationId, locationId)}`,
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
    `/api/v1/store/dispensing-cases/${caseId}/claim?${scopeQuery(organizationId, locationId)}`,
    token,
    withIdempotencyHeader(idempotencyKey, { method: 'POST', body: '{}' }),
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
    `/api/v1/store/dispensing-cases/${caseId}/validate?${scopeQuery(organizationId, locationId)}`,
    token,
    withIdempotencyHeader(idempotencyKey, { method: 'POST', body: '{}' }),
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
    `/api/v1/store/dispensing-cases/${caseId}/reject?${scopeQuery(organizationId, locationId)}`,
    token,
    withIdempotencyHeader(payload.idempotency_key, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
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
    `/api/v1/store/dispensing-cases/${caseId}/authorize?${scopeQuery(organizationId, locationId)}`,
    token,
    withIdempotencyHeader(idempotencyKey, { method: 'POST', body: '{}' }),
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
    `/api/v1/store/dispensing-cases/${caseId}/map-lines?${scopeQuery(organizationId, locationId)}`,
    token,
    withIdempotencyHeader(payload.idempotency_key, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
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
    `/api/v1/store/dispensing-cases/${caseId}/complete?${scopeQuery(organizationId, locationId)}`,
    token,
    withIdempotencyHeader(idempotencyKey, { method: 'POST', body: '{}' }),
  );
}

export function fetchDispensingLots(
  token: string,
  organizationId: string,
  locationId: string,
  variantId: string,
) {
  return call<{ lots: DispensingLot[] }>(
    `/api/v1/store/dispensing-lots?${scopeQuery(organizationId, locationId)}&variant_id=${encodeURIComponent(variantId)}`,
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
    `/api/v1/vendor/catalog/offers?seller_org_id=${encodeURIComponent(sellerOrgId)}`,
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
  return (
    detail.events?.some((event) => Boolean(event.meta?.refill_request_id)) ?? false
  );
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
  return call<{ data: StoreSupportTicket[] }>('/api/v1/store/support/tickets', token);
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
  return call<StoreSupportTicket>('/api/v1/store/support/tickets', token, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export type StoreInboxItem = {
  id: string;
  channel: string;
  title: string;
  body: string;
  read: boolean;
  created_at: string;
  reference_type?: string;
  reference_id?: string;
};

export function fetchStoreNotificationInbox(token: string) {
  return call<{ data: StoreInboxItem[] }>('/api/v1/me/notifications/inbox', token);
}

export function markStoreNotificationRead(token: string, id: string) {
  return call<{ data: StoreInboxItem[] }>(`/api/v1/me/notifications/inbox/${id}/read`, token, { method: 'POST' });
}
