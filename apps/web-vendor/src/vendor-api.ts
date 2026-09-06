import { vendorApiRoot } from './vendor-http';

const base = () => vendorApiRoot();

export class VendorApiError extends Error {
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
    throw new VendorApiError(
      (body as { detail?: string }).detail ?? 'request_failed',
      res.status,
      (body as { code?: string }).code,
    );
  }
  return body as T;
}

export type VendorOrganization = {
  id: string;
  display_name: string;
  legal_name: string;
  kind: string;
  status: string;
  country_code: string;
  role_code: string;
  role_name: string;
};

export type VendorOffer = {
  id: string;
  variant_id?: string;
  seller_org_id?: string;
  country_code?: string;
  currency?: string;
  cost_minor?: string | number;
  sell_minor?: string | number;
  status?: string;
  title?: string;
  sku?: string;
  catalog_ready?: boolean;
  inventory_ready?: boolean;
  blockers?: string[];
};

export type VendorLot = {
  id: string;
  sku?: string;
  variant_id?: string;
  location_id?: string;
  location_name?: string;
  location_kind?: string;
  lot_code: string;
  available: number;
  on_hand?: number;
  reserved?: number;
  status?: string;
  expires_on?: string | null;
};

export type VendorMovement = {
  id: string;
  lot_id: string;
  type: string;
  qty: number;
  reason_code: string;
  occurred_at?: string;
  lot_code?: string | null;
  variant_id?: string | null;
};

export type VendorGoodsReceipt = {
  id: string;
  status: string;
  location_id: string;
  owner_org_id: string;
  created_at?: string;
};

export type VendorTransfer = {
  id: string;
  status: string;
  from_location_id: string;
  to_location_id: string;
  owner_org_id: string;
};

export type VendorOrder = {
  id: string;
  order_number: string;
  status: string;
  currency?: string;
  total_minor?: string;
  goods_minor?: string;
  rx_origin?: boolean;
  rx_fulfillment_status?: string | null;
  vendor_accepted?: boolean;
  created_at?: string;
};

export type VendorOrderDetail = VendorOrder & {
  discount_minor?: string;
  tax_minor?: string;
  shipping_minor?: string;
  seller_org_id?: string;
  fulfilling_location_id?: string;
  updated_at?: string;
  prescription_id?: string | null;
  sandbox?: boolean;
  items?: Array<{
    id: string;
    sku: string;
    qty: number;
    unit_minor: string;
    line_minor: string;
  }>;
  ship_to?: {
    country_code: string;
    region?: string | null;
    city: string;
    postal_code?: string | null;
    line1: string;
    line2?: string | null;
    recipient_name: string;
    phone?: string | null;
  } | null;
  economics?: {
    customer_paid_minor: string;
    vendor_payable_est_minor: string;
    tax_minor: string;
    shipping_charged_minor: string;
  } | null;
  history?: Array<{
    from_status: string;
    to_status: string;
    reason: string;
    created_at: string;
  }>;
  fulfillment?: {
    groups: Array<{
      id: string;
      status: string;
      pick_tasks: Array<{ id: string; status: string; required_qty: number; picked_qty: number }>;
      pack_tasks: Array<{ id: string; status: string }>;
    }>;
  };
  shipments?: Array<{
    id: string;
    status: string;
    tracking_number?: string | null;
    carrier?: string;
  }>;
  returns?: Array<{ id: string; reason: string; created_at: string }>;
  payment_status?: string | null;
  after_sales_status?: string | null;
  exceptions?: string[];
  message?: string;
};

export type VendorShipment = {
  id: string;
  status: string;
  tracking_number?: string | null;
};

export type VendorShipmentDetail = VendorShipment & {
  carrier?: string;
  sandbox?: boolean;
  label?: string | null;
  quoted_cost_minor?: string | null;
  actual_cost_minor?: string | null;
  currency?: string | null;
  timeline?: Array<{ status: string; occurred_at?: string }>;
  message?: string;
  pod?: {
    delivered?: boolean;
    otp_recorded?: boolean;
    photo_attached?: boolean;
    signature_attached?: boolean;
    note?: string;
  };
};

export type VendorSettlement = {
  id: string;
  batch_id?: string;
  status: string;
  net_minor: string;
  currency?: string;
  gross_minor?: string;
  fee_minor?: string;
  refund_minor?: string;
  payable_status?: string;
  order_id?: string;
  period_starts_at?: string | null;
  period_ends_at?: string | null;
  sandbox?: boolean;
  live_payout?: boolean;
  message?: string;
};

export type VendorSettlementDetail = VendorSettlement & {
  seller_org_id?: string;
  payable_id?: string;
  take_bps_frozen?: number;
  take_flat_frozen?: string;
  hold_until?: string | null;
  payable_amount_minor?: string;
  batch_created_at?: string;
  payouts?: Array<{
    id: string;
    status: string;
    amount_minor: string;
    currency: string;
    sandbox: boolean;
    live_payout: boolean;
  }>;
};

export function fetchVendorOrganizations(token: string) {
  return call<{ data: VendorOrganization[] }>('/api/v1/vendor/organizations', token);
}

export function fetchVendorOffers(token: string, sellerOrgId: string) {
  return call<{ data: VendorOffer[] }>(
    `/api/v1/vendor/catalog/offers?seller_org_id=${encodeURIComponent(sellerOrgId)}`,
    token,
  );
}

export function fetchVendorLots(token: string, ownerOrgId: string) {
  return call<{ data: VendorLot[] }>(
    `/api/v1/vendor/inventory/lots?owner_org_id=${encodeURIComponent(ownerOrgId)}`,
    token,
  );
}

export function fetchVendorOrders(token: string, sellerOrgId: string) {
  return call<{ data: VendorOrder[] }>(
    `/api/v1/vendor/orders?seller_org_id=${encodeURIComponent(sellerOrgId)}`,
    token,
  );
}

export function fetchVendorOrder(token: string, orderId: string) {
  return call<VendorOrderDetail>(`/api/v1/vendor/orders/${encodeURIComponent(orderId)}`, token);
}

export function vendorOrderAccept(token: string, orderId: string) {
  return call<VendorOrderDetail>(`/api/v1/vendor/orders/${encodeURIComponent(orderId)}/accept`, token, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export function vendorOrderReject(token: string, orderId: string, reason: string, idempotencyKey: string) {
  return call<VendorOrderDetail>(`/api/v1/vendor/orders/${encodeURIComponent(orderId)}/reject`, token, {
    method: 'POST',
    body: JSON.stringify({ reason, idempotency_key: idempotencyKey }),
  });
}

export function vendorOrderFulfill(
  token: string,
  orderId: string,
  action: 'pick/start' | 'pick/complete' | 'pack/start' | 'pack/complete' | 'ready',
) {
  return call<VendorOrderDetail>(
    `/api/v1/vendor/orders/${encodeURIComponent(orderId)}/${action}`,
    token,
    { method: 'POST', body: JSON.stringify({}) },
  );
}

export function fetchVendorShipments(token: string, sellerOrgId: string) {
  return call<{ data: VendorShipment[] }>(
    `/api/v1/vendor/shipments?seller_org_id=${encodeURIComponent(sellerOrgId)}`,
    token,
  );
}

export function fetchVendorShipment(token: string, shipmentId: string) {
  return call<VendorShipmentDetail>(`/api/v1/vendor/shipments/${encodeURIComponent(shipmentId)}`, token);
}

export function fetchVendorSettlements(token: string, sellerOrgId: string) {
  return call<{ data: VendorSettlement[] }>(
    `/api/v1/vendor/settlements?seller_org_id=${encodeURIComponent(sellerOrgId)}`,
    token,
  );
}

export function fetchVendorSettlement(token: string, lineId: string) {
  return call<VendorSettlementDetail>(`/api/v1/vendor/settlements/${encodeURIComponent(lineId)}`, token);
}

export type VendorPayable = {
  id: string;
  order_id: string;
  order_number: string;
  order_date: string;
  order_status: string;
  gross_minor: string;
  fee_minor: string;
  refund_minor: string;
  payable_minor: string;
  currency: string;
  status: string;
  settlement_line_id?: string | null;
  settlement_batch_id?: string | null;
  settlement_status?: string | null;
  sandbox?: boolean;
  live_payout?: boolean;
};

export type VendorFinanceSummary = {
  currency: string;
  total_payable_minor: string;
  pending_payable_minor: string;
  settled_payable_minor: string;
  settlement_line_count: number;
  settlement_batched_minor: string;
  sandbox: boolean;
  live_payout: boolean;
  message?: string;
};

export function fetchVendorPayables(token: string, sellerOrgId: string) {
  return call<{ data: VendorPayable[] }>(
    `/api/v1/vendor/payables?seller_org_id=${encodeURIComponent(sellerOrgId)}`,
    token,
  );
}

export function fetchVendorFinanceSummary(token: string, sellerOrgId: string) {
  return call<VendorFinanceSummary>(
    `/api/v1/vendor/finance/summary?seller_org_id=${encodeURIComponent(sellerOrgId)}`,
    token,
  );
}

export type VendorTeamMember = {
  id: string;
  person_id: string;
  display_name: string;
  role_code: string;
  role_name: string;
  permissions: string[];
  status: string;
  created_at: string;
  is_self: boolean;
};

export function fetchVendorTeamMembers(token: string, sellerOrgId: string) {
  return call<{ data: VendorTeamMember[] }>(
    `/api/v1/vendor/team/members?seller_org_id=${encodeURIComponent(sellerOrgId)}`,
    token,
  );
}

export function inviteVendorTeamMember(
  token: string,
  body: { seller_org_id: string; role_code: string; country_code: string; email?: string },
) {
  return call<{ invitation_id: string; invite_token: string; intended_role_code: string }>(
    '/api/v1/vendor/team/invitations',
    token,
    { method: 'POST', body: JSON.stringify(body) },
  );
}

export function removeVendorTeamMember(token: string, sellerOrgId: string, membershipId: string) {
  return call<{ removed: boolean }>(
    `/api/v1/vendor/team/members/${encodeURIComponent(membershipId)}?seller_org_id=${encodeURIComponent(sellerOrgId)}`,
    token,
    { method: 'DELETE' },
  );
}

export type VendorReturnRow = {
  id: string;
  order_id: string;
  order_number: string;
  order_status: string;
  reason: string;
  status: string;
  note?: string | null;
  created_at: string;
  currency: string;
  total_minor: string;
  payment_status?: string | null;
  refund_status?: string | null;
  vendor_action_required: boolean;
  pickup_slot_start?: string | null;
  pickup_slot_end?: string | null;
  shipment_id?: string | null;
  tracking_number?: string | null;
};

export function fetchVendorReturns(token: string, sellerOrgId: string, status?: string) {
  const query = new URLSearchParams({ seller_org_id: sellerOrgId });
  if (status) {
    query.set('status', status);
  }
  return call<{ data: VendorReturnRow[] }>(`/api/v1/vendor/returns?${query.toString()}`, token);
}

export function approveVendorReturn(token: string, orderId: string, returnId: string) {
  return call<VendorOrderDetail>(
    `/api/v1/vendor/returns/${encodeURIComponent(orderId)}/${encodeURIComponent(returnId)}/approve`,
    token,
    { method: 'POST', body: JSON.stringify({}) },
  );
}

export function receiveVendorReturn(token: string, orderId: string, returnId: string) {
  return call<VendorOrderDetail>(
    `/api/v1/vendor/returns/${encodeURIComponent(orderId)}/${encodeURIComponent(returnId)}/receive`,
    token,
    { method: 'POST', body: JSON.stringify({}) },
  );
}

export function rejectVendorReturn(token: string, orderId: string, returnId: string, reason: string) {
  return call<VendorOrderDetail>(
    `/api/v1/vendor/returns/${encodeURIComponent(orderId)}/${encodeURIComponent(returnId)}/reject`,
    token,
    { method: 'POST', body: JSON.stringify({ reason }) },
  );
}

export type VendorSupportTicket = {
  id: string;
  subject: string;
  body: string;
  status: string;
  reference_type?: string;
  reference_id?: string;
  created_at: string;
  seller_org_id?: string;
  note?: string;
};

export function fetchVendorSupportTickets(token: string) {
  return call<{ data: VendorSupportTicket[] }>('/api/v1/vendor/support/tickets', token);
}

export function createVendorSupportTicket(
  token: string,
  body: {
    seller_org_id: string;
    subject: string;
    body: string;
    reference_type?: string;
    reference_id?: string;
  },
) {
  return call<VendorSupportTicket>('/api/v1/vendor/support/tickets', token, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export type VendorNotificationPreferences = {
  email_enabled: boolean;
  push_enabled: boolean;
  sms_enabled: boolean;
  order_updates: boolean;
  appointment_updates: boolean;
  delivery_updates: boolean;
  settlement_updates: boolean;
  support_updates: boolean;
  marketing: boolean;
};

export type VendorInboxItem = {
  id: string;
  channel: string;
  title: string;
  body: string;
  read: boolean;
  created_at: string;
  reference_type?: string;
  reference_id?: string;
};

export function fetchVendorNotificationPreferences(token: string) {
  return call<VendorNotificationPreferences>('/api/v1/me/notifications/preferences', token);
}

export function updateVendorNotificationPreferences(
  token: string,
  patch: Partial<VendorNotificationPreferences>,
) {
  return call<VendorNotificationPreferences>('/api/v1/me/notifications/preferences', token, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export function fetchVendorNotificationInbox(token: string) {
  return call<{ data: VendorInboxItem[] }>('/api/v1/me/notifications/inbox', token);
}

export function markVendorNotificationRead(token: string, inboxId: string) {
  return call<{ data: VendorInboxItem }>(
    `/api/v1/me/notifications/inbox/${encodeURIComponent(inboxId)}/read`,
    token,
    { method: 'POST', body: JSON.stringify({}) },
  );
}

export type SupportTicketMessage = {
  id: string;
  body: string;
  author_person_id: string;
  created_at: string;
};

export type SupportTicketDetail = VendorSupportTicket & {
  messages: SupportTicketMessage[];
};

export function fetchSupportTicket(token: string, ticketId: string) {
  return call<SupportTicketDetail>(`/api/v1/support/tickets/${encodeURIComponent(ticketId)}`, token);
}

export function replySupportTicket(token: string, ticketId: string, body: string) {
  return call<SupportTicketDetail>(`/api/v1/support/tickets/${encodeURIComponent(ticketId)}/messages`, token, {
    method: 'POST',
    body: JSON.stringify({ body }),
  });
}

export function closeSupportTicket(token: string, ticketId: string) {
  return call<SupportTicketDetail>(`/api/v1/support/tickets/${encodeURIComponent(ticketId)}/close`, token, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export type MarketplaceEligibility = {
  seller_org_id: string;
  country_code: string | null;
  state: 'ELIGIBLE' | 'PENDING' | 'BLOCKED' | 'REQUIRES_ATTESTATION' | 'DISABLED';
  acceptance: string;
  attestation_code_required: string;
  attested: boolean;
  attested_at: string | null;
  pack: {
    published: boolean;
    marketplace_enabled: boolean;
    vendor_partner_type_enabled: boolean;
  };
  organization_status: string | null;
  gates: {
    country: boolean;
    seller_organization: boolean;
    marketplace_participation: boolean;
    vendor_partner_type: boolean;
    finance_settlement_visibility: boolean;
    support_notification: boolean;
    catalog_write: boolean;
  };
  blocked_reason: string | null;
  next_action: string | null;
  sandbox_note: string;
  live_payout: false;
};

export type VendorActivityItem = {
  id: string;
  type: string;
  outcome: string;
  created_at: string;
  metadata: Record<string, unknown> | null;
};

export function fetchMarketplaceEligibility(token: string, sellerOrgId: string) {
  return call<MarketplaceEligibility>(
    `/api/v1/vendor/marketplace/eligibility?seller_org_id=${encodeURIComponent(sellerOrgId)}`,
    token,
  );
}

export function attestMarketplaceSeller(token: string, sellerOrgId: string, attestationCode: string) {
  return call<MarketplaceEligibility>('/api/v1/vendor/marketplace/attest', token, {
    method: 'POST',
    body: JSON.stringify({ seller_org_id: sellerOrgId, attestation_code: attestationCode }),
  });
}

export function fetchVendorMarketplaceActivity(token: string, sellerOrgId: string) {
  return call<{ data: VendorActivityItem[]; note?: string }>(
    `/api/v1/vendor/marketplace/activity?seller_org_id=${encodeURIComponent(sellerOrgId)}`,
    token,
  );
}

export type VendorLocation = {
  id: string;
  name: string;
  kind: string;
  organization_id?: string;
  is_active?: boolean;
};

export function fetchVendorLocations(token: string, organizationId: string) {
  return call<{ data: VendorLocation[] }>(
    `/api/v1/vendor/inventory/locations?organization_id=${encodeURIComponent(organizationId)}`,
    token,
  );
}

export function createVendorLocation(
  token: string,
  body: { organization_id: string; name: string; fulfillment_capable?: boolean },
) {
  return call<VendorLocation>('/api/v1/vendor/inventory/locations', token, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function fetchVendorMovements(token: string, ownerOrgId: string, lotId?: string) {
  const qs = new URLSearchParams({ owner_org_id: ownerOrgId });
  if (lotId) {
    qs.set('lot_id', lotId);
  }
  return call<{ data: VendorMovement[] }>(`/api/v1/vendor/inventory/movements?${qs}`, token);
}

export function fetchVendorReceipts(token: string, ownerOrgId: string) {
  return call<{ data: VendorGoodsReceipt[] }>(
    `/api/v1/vendor/inventory/grn?owner_org_id=${encodeURIComponent(ownerOrgId)}`,
    token,
  );
}

export function createVendorGrn(
  token: string,
  body: {
    location_id: string;
    owner_org_id: string;
    idempotency_key: string;
    lines: Array<{
      variant_id: string;
      lot_code?: string;
      expires_on?: string;
      qty: number;
      qty_accepted?: number;
    }>;
  },
) {
  return call<{ id: string; status?: string }>('/api/v1/vendor/inventory/grn', token, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function receiveVendorGrn(token: string, grnId: string) {
  return call<{ id?: string; status?: string }>(
    `/api/v1/vendor/inventory/grn/${encodeURIComponent(grnId)}/receive`,
    token,
    { method: 'POST', body: JSON.stringify({}) },
  );
}

export function postVendorGrn(token: string, grnId: string) {
  return call<{ id?: string; status?: string }>(
    `/api/v1/vendor/inventory/grn/${encodeURIComponent(grnId)}/post`,
    token,
    { method: 'POST', body: JSON.stringify({}) },
  );
}

export function adjustVendorLot(
  token: string,
  body: { lot_id: string; qty_delta: number; reason_code: string; idempotency_key: string },
) {
  return call<VendorLot>('/api/v1/vendor/inventory/adjustments', token, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function fetchVendorTransfers(token: string, ownerOrgId: string) {
  return call<{ data: VendorTransfer[] }>(
    `/api/v1/vendor/inventory/transfers?owner_org_id=${encodeURIComponent(ownerOrgId)}`,
    token,
  );
}

export function createVendorTransfer(
  token: string,
  body: {
    from_location_id: string;
    to_location_id: string;
    owner_org_id: string;
    idempotency_key: string;
    lines: Array<{ variant_id: string; source_lot_id: string; qty: number }>;
  },
) {
  return call<{ id: string; status?: string }>('/api/v1/vendor/inventory/transfers', token, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function advanceVendorTransfer(
  token: string,
  transferId: string,
  action: 'reserve' | 'dispatch' | 'receive',
) {
  return call<{ id?: string; status?: string }>(
    `/api/v1/vendor/inventory/transfers/${encodeURIComponent(transferId)}/${action}`,
    token,
    { method: 'POST', body: JSON.stringify({}) },
  );
}

function idemKey(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export { idemKey as vendorIdempotencyKey };

export type VendorCommercialRule = {
  id: string;
  country_code: string | null;
  seller_org_id: string | null;
  channel: string | null;
  take_bps: number;
  take_flat_minor: string;
  priority: number;
  valid_from: string;
  valid_to: string | null;
  scope: string;
};

export function fetchVendorCommercialRules(token: string, sellerOrgId: string) {
  return call<{ data: VendorCommercialRule[]; note?: string; country_code?: string }>(
    `/api/v1/vendor/catalog/commercial-rules?seller_org_id=${encodeURIComponent(sellerOrgId)}`,
    token,
  );
}

export function createVendorItem(
  token: string,
  body: {
    slug: string;
    kind: string;
    seller_org_id: string;
    title: string;
    description?: string;
    countries: Array<{ country_code: string; available?: boolean; rx_required?: boolean }>;
  },
) {
  return call<{ id: string; slug?: string; status?: string }>('/api/v1/vendor/catalog/items', token, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function createVendorVariant(
  token: string,
  itemId: string,
  body: { sku_code: string; pack_size: string; strength?: string; uom?: string },
) {
  return call<{ id: string; skuCode?: string; sku_code?: string }>(
    `/api/v1/vendor/catalog/items/${encodeURIComponent(itemId)}/variants`,
    token,
    { method: 'POST', body: JSON.stringify(body) },
  );
}

export function createVendorOffer(
  token: string,
  body: {
    variant_id: string;
    seller_org_id: string;
    country_code: string;
    ownership: 'VENDOR_OWNED' | 'MARKETPLACE';
    currency: string;
    cost_minor: string;
    sell_minor: string;
    list_minor?: string | null;
  },
) {
  return call<{ id: string; status?: string; sellerOrgId?: string }>('/api/v1/vendor/catalog/offers', token, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function publishVendorOffer(token: string, offerId: string) {
  return call<{ id?: string; status?: string }>(
    `/api/v1/vendor/catalog/offers/${encodeURIComponent(offerId)}/publish`,
    token,
    { method: 'POST', body: JSON.stringify({}) },
  );
}

export function replaceVendorOfferPrice(
  token: string,
  offerId: string,
  body: { cost_minor: string; sell_minor: string; list_minor?: string | null },
) {
  return call<{ id?: string; version?: number }>(
    `/api/v1/vendor/catalog/offers/${encodeURIComponent(offerId)}/prices`,
    token,
    { method: 'POST', body: JSON.stringify(body) },
  );
}
