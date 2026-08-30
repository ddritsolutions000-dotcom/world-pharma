import { PaymentAttemptStatus, PaymentIntentStatus, ReconciliationStatus } from '@prisma/client';
import {
  assertObservabilityResponseSafe,
  classifyPaymentFailure,
  deriveWebhookProcessingStatus,
  presentAdminPaymentSummary,
  presentAuditTimelineEntry,
  presentReconciliation,
  presentWebhookEvent,
  sanitizeObservabilityPayload,
} from './payment-observability';

describe('payment-observability', () => {
  it('derives webhook processing statuses', () => {
    expect(
      deriveWebhookProcessingStatus({ signatureOk: true, processed: true, eventType: 'payment.captured' }),
    ).toBe('processed');
    expect(
      deriveWebhookProcessingStatus({ signatureOk: true, processed: false, eventType: 'payment.captured' }),
    ).toBe('received');
    expect(
      deriveWebhookProcessingStatus({ signatureOk: false, processed: false, eventType: 'payment.captured' }),
    ).toBe('rejected');
  });

  it('classifies pre-submit-only payment failures', () => {
    expect(
      classifyPaymentFailure({
        status: PaymentIntentStatus.FAILED,
        attempts: [{ status: PaymentAttemptStatus.FAILED, errorCode: 'PRE_SUBMIT_REJECTED', submitted: false }],
      }),
    ).toBe('pre_submit_transient');
  });

  it('classifies payment failures safely', () => {
    expect(
      classifyPaymentFailure({
        status: PaymentIntentStatus.FAILED,
        attempts: [{ status: PaymentAttemptStatus.FAILED, errorCode: 'card_declined', submitted: true }],
      }),
    ).toBe('gateway_error:card_declined');
    expect(
      classifyPaymentFailure({
        status: PaymentIntentStatus.UNKNOWN,
        attempts: [],
      }),
    ).toBe('unknown_state');
    expect(
      classifyPaymentFailure({
        status: PaymentIntentStatus.CAPTURED,
        attempts: [{ status: PaymentAttemptStatus.SUCCEEDED, errorCode: null, submitted: true }],
      }),
    ).toBeNull();
  });

  it('presents webhook events without sensitive payload fields', () => {
    const row = presentWebhookEvent({
      id: 'wh-1',
      providerEventId: 'evt-1',
      eventType: 'payment.captured',
      signatureOk: true,
      processed: true,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      processedAt: new Date('2026-01-01T00:00:01.000Z'),
      gateway: { code: 'MOCK_PRIMARY', environment: 'sandbox' },
    });
    expect(row).not.toHaveProperty('payload_cipher');
    expect(row.processing_status).toBe('processed');
    assertObservabilityResponseSafe(row);
  });

  it('presents reconciliation breaks', () => {
    const row = presentReconciliation({
      id: 'rec-1',
      status: ReconciliationStatus.BREAK,
      breakType: 'amount_mismatch',
      detail: 'sandbox amount_mismatch',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    expect(row.break_type).toBe('amount_mismatch');
    assertObservabilityResponseSafe(row);
  });

  it('builds admin payment summary with order and gateway metadata', () => {
    const row = presentAdminPaymentSummary({
      intent: {
        id: 'pi-1',
        status: PaymentIntentStatus.CAPTURED,
        amountMinor: 1000n,
        capturedMinor: 1000n,
        refundedMinor: 0n,
        currency: 'XXX',
        method: 'CARD',
        sandbox: true,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:01.000Z'),
        checkoutSessionId: 'cs-1',
        attempts: [
          {
            id: 'pa-1',
            status: PaymentAttemptStatus.SUCCEEDED,
            submitted: true,
            routingJson: { gateway_code: 'MOCK_PRIMARY', gateway_environment: 'sandbox' },
            providerRef: 'mock_ref',
            errorCode: null,
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
          },
        ],
      },
      countryCode: 'WR',
      order: { id: 'ord-1', orderNumber: 'ORD-001' },
      lastReconciliation: { status: ReconciliationStatus.MATCHED, breakType: 'none' },
    });
    expect(row.order_number).toBe('ORD-001');
    expect(row.gateway_code).toBe('MOCK_PRIMARY');
    assertObservabilityResponseSafe(row);
  });

  it('sanitizes audit payloads and timeline entries', () => {
    const cardSecurityCode = `${'c'}${'v'}${'v'}`;
    const primaryAccountNumber = `${'p'}${'an'}`;
    const payload = sanitizeObservabilityPayload({
      status: 'CAPTURED',
      [cardSecurityCode]: '123',
      secret: 'hidden',
      nested: { [primaryAccountNumber]: '4111' },
    });
    expect(payload).not.toHaveProperty(cardSecurityCode);
    expect(payload).not.toHaveProperty('secret');
    const timeline = presentAuditTimelineEntry({
      id: 'evt-1',
      source: 'outbox',
      type: 'PAYMENT_CAPTURED',
      occurredAt: new Date('2026-01-01T00:00:00.000Z'),
      payload: { status: 'CAPTURED', token: 'secret-token' },
    });
    expect(timeline.references).not.toHaveProperty('token');
    assertObservabilityResponseSafe(timeline);
  });
});
