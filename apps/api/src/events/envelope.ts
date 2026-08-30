export const DOMAIN_EVENT_TYPES = [
  'USER_REGISTERED',
  'PARTNER_CREATED',
  'PARTNER_STATUS_CHANGED',
  'PRODUCT_CREATED',
  'PRODUCT_UPDATED',
  'PRODUCT_PUBLISHED',
  'OFFER_CREATED',
  'OFFER_UPDATED',
  'PRICE_CHANGED',
  'CATEGORY_CHANGED',
  'INVENTORY_RECEIVED',
  'INVENTORY_ADJUSTED',
  'INVENTORY_RESERVED',
  'INVENTORY_RELEASED',
  'INVENTORY_TRANSFERRED',
  'INVENTORY_QUARANTINED',
  'INVENTORY_EXPIRED',
  'CART_CREATED',
  'CART_ITEM_ADDED',
  'CART_ITEM_UPDATED',
  'CART_ITEM_REMOVED',
  'CHECKOUT_STARTED',
  'CHECKOUT_REVALIDATED',
  'CHECKOUT_EXPIRED',
  'CHECKOUT_SESSION_PAID',
  'RX_CHECKOUT_STARTED',
  'RX_HANDOFF_ELIGIBLE',
  'REFILL_REQUESTED',
  'REFILL_APPROVED',
  'REFILL_REJECTED',
  'REFILL_STATUS_CHANGED',
  'PAYMENT_INTENT_CREATED',
  'PAYMENT_REQUIRES_ACTION',
  'PAYMENT_PROCESSING',
  'PAYMENT_AUTHORIZED',
  'PAYMENT_CAPTURED',
  'PAYMENT_FAILED',
  'PAYMENT_CANCELLED',
  'PAYMENT_EXPIRED',
  'PAYMENT_UNKNOWN',
  'PAYMENT_REFUND_REQUESTED',
  'PAYMENT_REFUNDED',
  'PAYMENT_RECONCILED',
  'ORDER_CREATED',
  'ORDER_CONFIRMED',
  'ORDER_ON_HOLD',
  'ORDER_ALLOCATED',
  'ORDER_PICKING',
  'ORDER_PICKED',
  'ORDER_PACKING',
  'ORDER_PACKED',
  'ORDER_READY_FOR_SHIPMENT',
  'ORDER_CANCELLED',
  'ORDER_RETURN_REQUESTED',
  'ORDER_RETURNED',
  'ORDER_REFUND_PENDING',
  'ORDER_REFUNDED',
  'SHIPMENT_CREATED',
  'SHIPMENT_BOOKING_STARTED',
  'SHIPMENT_BOOKED',
  'SHIPMENT_LABEL_CREATED',
  'SHIPMENT_PICKUP_SCHEDULED',
  'SHIPMENT_PICKED_UP',
  'SHIPMENT_IN_TRANSIT',
  'SHIPMENT_OUT_FOR_DELIVERY',
  'SHIPMENT_DELIVERED',
  'SHIPMENT_FAILED',
  'SHIPMENT_RETURNED',
  'SHIPMENT_LOST',
  'SHIPMENT_DAMAGED',
  'CARRIER_COST_RECORDED',
  'CARRIER_RECONCILIATION_EXCEPTION',
  'LEDGER_JOURNAL_POSTED',
  'VENDOR_PAYABLE_CREATED',
  'VENDOR_PAYABLE_ADJUSTED',
  'SETTLEMENT_CREATED',
  'SETTLEMENT_APPROVED',
  'SETTLEMENT_IMPORT_RECEIVED',
  'PAYOUT_SUBMITTED',
  'PAYOUT_PAID',
  'PAYOUT_FAILED',
  'PAYOUT_UNKNOWN',
  'PAYOUT_REVERSED',
  'FINANCE_BREAK_INVESTIGATE',
  'FINANCE_BREAK_RESOLVE',
  'FINANCE_BREAK_CLOSE',
  'AFFILIATE_LIABILITY_CREATED',
  'AFFILIATE_REVERSED',
  'PROMO_COST_RECORDED',
  'REFUND_FINANCIAL_FACT_RECORDED',
  'RECONCILIATION_EXCEPTION_CREATED',
  'CONTRIBUTION_SNAPSHOT_CREATED',
  'DOCTOR_PROFILE_CREATED',
  'DOCTOR_PROFILE_UPDATED',
  'DOCTOR_CREDENTIAL_SUBMITTED',
  'DOCTOR_CREDENTIAL_REVIEWED',
  'CONSENT_GRANTED',
  'CONSENT_REVOKED',
  'CLINICAL_ACCESS_EVALUATED',
  'BREAK_GLASS_HEALTH_OPENED',
  'CARE_NAV_SESSION_STARTED',
  'CARE_NAV_TRIAGE_COMPLETED',
  'APPOINTMENT_CREATED',
  'APPOINTMENT_CONFIRMED',
  'APPOINTMENT_RESCHEDULED',
  'APPOINTMENT_CANCELLED',
  'APPOINTMENT_CHECKED_IN',
  'ENCOUNTER_STARTED',
  'ENCOUNTER_COMPLETED',
  'VIDEO_SESSION_CREATED',
  'VIDEO_SESSION_READY',
  'VIDEO_PARTICIPANT_JOINED',
  'VIDEO_PARTICIPANT_LEFT',
  'VIDEO_SESSION_STARTED',
  'VIDEO_SESSION_ENDED',
  'VIDEO_SESSION_FAILED',
  'CMS_CONTENT_CREATED',
  'CMS_CONTENT_UPDATED',
  'CMS_CONTENT_SUBMITTED',
  'CMS_CONTENT_PUBLISHED',
  'CMS_CONTENT_ARCHIVED',
  'SUPPORT_TICKET_CREATED',
  'SUPPORT_TICKET_UPDATED',
  'SUPPORT_TICKET_ASSIGNED',
  'SUPPORT_TICKET_CUSTOMER_REPLY',
  'SUPPORT_TICKET_AGENT_REPLY',
  'SUPPORT_TICKET_RESOLVED',
  'SUPPORT_TICKET_CLOSED',
  'CRM_CAMPAIGN_MESSAGE',
  'CRM_AUTOMATION_REMINDER',
  'SEARCH_INDEX_INVALIDATE',
] as const;

export type DomainEventType = (typeof DOMAIN_EVENT_TYPES)[number];

export interface EventEnvelope {
  eventId: string;
  eventName: string;
  eventVersion: number;
  occurredAt: string;
  aggregateType: string;
  aggregateId: string;
  producer: string;
  countryId: string | null;
  regionId?: string | null;
  legalEntityId?: string | null;
  organizationId?: string | null;
  correlationId: string | null;
  causationId: string | null;
  actorId: string | null;
  payload: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

const SENSITIVE_KEY =
  /password|otp|token|secret|refresh|mfa|cvv|pan|private_url|document_image|access_token|credential_number|license_number|clinical_note|prescription|lab_result|video_token|livekit/i;

export function stripSensitive(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripSensitive);
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY.test(key)) {
        continue;
      }
      out[key] = stripSensitive(nested);
    }
    return out;
  }
  return value;
}

export function sanitizePayload(payload: Record<string, unknown>): Record<string, unknown> {
  return stripSensitive(payload) as Record<string, unknown>;
}

export function sanitizeErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.replace(/\b(otp|password|token|secret|refresh)[^\s]*/gi, '[redacted]').slice(0, 500);
}

export function backoffMs(attempts: number): number {
  const base = 15_000;
  const cap = 3_600_000;
  return Math.min(cap, base * 2 ** Math.max(0, attempts - 1));
}
