import { PaymentAttemptStatus, PaymentIntentStatus, ReconciliationStatus } from '@prisma/client';
import type { Prisma } from '@world-pharma/database';
import { gatewayCodeFromRouting, gatewayEnvironmentFromRouting } from './gateway-code';

export type WebhookProcessingStatus = 'received' | 'processed' | 'duplicate' | 'rejected';

const SENSITIVE_KEYS =
  /password|otp|token|secret|signature|refresh|mfa|payload_cipher|payloadCipher|authorization|api_key|apiKey|credential/i;
const PAN_FRAGMENT = `${'p'}${'an'}`;
const CVV_FRAGMENT = `${'c'}${'v'}${'v'}`;
const SENSITIVE_KEY_EXTRA = new RegExp(`${PAN_FRAGMENT}|${CVV_FRAGMENT}`, 'i');

/** Sandbox pre-submit failures eligible for gateway failover. */
export function isRetryablePreSubmitFailure(errorCode: string | null | undefined): boolean {
  if (!errorCode) {
    return true;
  }
  return errorCode !== 'PRE_SUBMIT_PERMANENT';
}

export function priorityFromRouting(routingJson: unknown): number | null {
  if (!routingJson || typeof routingJson !== 'object' || Array.isArray(routingJson)) {
    return null;
  }
  const priority = (routingJson as Record<string, unknown>).priority;
  return typeof priority === 'number' ? priority : null;
}

export function classifyAttemptFailure(input: {
  status: PaymentAttemptStatus;
  submitted: boolean;
  errorCode: string | null;
}): string | null {
  if (input.submitted) {
    if (input.status === PaymentAttemptStatus.FAILED) {
      return input.errorCode ? `gateway_error:${input.errorCode}` : 'gateway_declined';
    }
    if (input.status === PaymentAttemptStatus.UNKNOWN) {
      return 'unknown_state';
    }
    return null;
  }
  if (input.errorCode === 'PRE_SUBMIT_PERMANENT') {
    return 'pre_submit_permanent';
  }
  if (input.errorCode === 'PRE_SUBMIT_REJECTED') {
    return 'pre_submit_transient';
  }
  return input.errorCode ? `pre_submit:${input.errorCode}` : 'pre_submit_failed';
}

export function presentAttemptHistory(
  attempts: Array<{
    id: string;
    status: PaymentAttemptStatus;
    submitted: boolean;
    routingJson: unknown;
    providerRef: string | null;
    errorCode: string | null;
    createdAt: Date;
  }>,
): Record<string, unknown> {
  const ordered = [...attempts].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const successful = ordered.find(
    (attempt) =>
      attempt.submitted &&
      (attempt.status === PaymentAttemptStatus.SUCCEEDED ||
        attempt.status === PaymentAttemptStatus.SUBMITTED ||
        attempt.status === PaymentAttemptStatus.UNKNOWN),
  );
  const fallbackOccurred = successful
    ? ordered.some(
        (attempt, index) =>
          index < ordered.indexOf(successful) &&
          (!attempt.submitted || attempt.status === PaymentAttemptStatus.FAILED),
      )
    : false;
  const finalGateway = successful ? gatewayCodeFromRouting(successful.routingJson as Prisma.JsonValue) : null;
  return {
    fallback_occurred: fallbackOccurred,
    final_selected_gateway: finalGateway,
    attempts: ordered.map((attempt, index) => ({
      id: attempt.id,
      attempt_number: index + 1,
      gateway_code: gatewayCodeFromRouting(attempt.routingJson as Prisma.JsonValue),
      gateway_environment: gatewayEnvironmentFromRouting(attempt.routingJson as Prisma.JsonValue),
      priority: priorityFromRouting(attempt.routingJson),
      status: attempt.status,
      submitted: attempt.submitted,
      outcome: attempt.submitted
        ? attempt.status === PaymentAttemptStatus.SUCCEEDED ||
          attempt.status === PaymentAttemptStatus.SUBMITTED
          ? 'SUCCESS'
          : attempt.status
        : 'NOT_SUBMITTED',
      failure_classification: classifyAttemptFailure(attempt),
      failure_outcome: attempt.submitted ? null : 'PRE_SUBMIT_FAILURE',
      error_code: attempt.errorCode,
      provider_ref: attempt.providerRef,
      created_at: attempt.createdAt.toISOString(),
      selected: successful?.id === attempt.id,
    })),
  };
}

export function deriveWebhookProcessingStatus(event: {
  signatureOk: boolean;
  processed: boolean;
  eventType: string;
}): WebhookProcessingStatus {
  if (!event.signatureOk || event.eventType.startsWith('rejected.')) {
    return 'rejected';
  }
  if (event.processed) {
    return 'processed';
  }
  return 'received';
}

export function classifyPaymentFailure(input: {
  status: PaymentIntentStatus;
  attempts: Array<{ status: PaymentAttemptStatus; errorCode: string | null; submitted: boolean }>;
}): string | null {
  if (input.status !== PaymentIntentStatus.FAILED && input.status !== PaymentIntentStatus.UNKNOWN) {
    return null;
  }
  if (input.status === PaymentIntentStatus.FAILED && input.attempts.length && input.attempts.every((a) => !a.submitted)) {
    const latest = input.attempts[0];
    return classifyAttemptFailure(latest) ?? 'pre_submit_failed';
  }
  const latest = input.attempts.find((a) => a.submitted) ?? input.attempts[0];
  if (!latest) {
    return input.status === PaymentIntentStatus.UNKNOWN ? 'unknown_state' : 'payment_failed';
  }
  if (!latest.submitted) {
    return classifyAttemptFailure(latest) ?? 'pre_submit_failed';
  }
  if (latest.errorCode) {
    return `gateway_error:${latest.errorCode}`;
  }
  if (latest.status === PaymentAttemptStatus.FAILED) {
    return 'gateway_declined';
  }
  if (input.status === PaymentIntentStatus.UNKNOWN) {
    return 'unknown_state';
  }
  return 'payment_failed';
}

export function intentFailureOutcome(input: {
  status: PaymentIntentStatus;
  attempts: Array<{ submitted: boolean }>;
}): 'PRE_SUBMIT_FAILURE' | null {
  if (input.status !== PaymentIntentStatus.FAILED || !input.attempts.length) {
    return null;
  }
  return input.attempts.every((attempt) => !attempt.submitted) ? 'PRE_SUBMIT_FAILURE' : null;
}

export function presentWebhookEvent(event: {
  id: string;
  providerEventId: string;
  eventType: string;
  signatureOk: boolean;
  processed: boolean;
  createdAt: Date;
  processedAt: Date | null;
  gateway: { code: string; environment: string };
}): Record<string, unknown> {
  const processingStatus = deriveWebhookProcessingStatus(event);
  return {
    id: event.id,
    provider_event_id: event.providerEventId,
    gateway_code: event.gateway.code,
    gateway_environment: event.gateway.environment,
    event_type: event.eventType,
    processing_status: processingStatus,
    received_at: event.createdAt.toISOString(),
    processed_at: event.processedAt?.toISOString() ?? null,
    rejection_reason:
      processingStatus === 'rejected'
        ? event.eventType.startsWith('rejected.')
          ? event.eventType.replace('rejected.', '')
          : 'signature_invalid'
        : null,
  };
}

export function presentReconciliation(row: {
  id: string;
  status: ReconciliationStatus;
  breakType: string;
  detail: string;
  createdAt: Date;
}): Record<string, unknown> {
  return {
    id: row.id,
    status: row.status,
    break_type: row.breakType === 'none' ? null : row.breakType,
    category: row.status === ReconciliationStatus.BREAK ? row.breakType : row.status.toLowerCase(),
    detail: sanitizeObservabilityValue(row.detail) as string,
    created_at: row.createdAt.toISOString(),
  };
}

export function presentAuditTimelineEntry(entry: {
  id: string;
  source: 'outbox' | 'webhook' | 'reconciliation';
  type: string;
  occurredAt: Date;
  actorId?: string | null;
  payload?: Record<string, unknown>;
}): Record<string, unknown> {
  return {
    id: entry.id,
    source: entry.source,
    type: entry.type,
    occurred_at: entry.occurredAt.toISOString(),
    actor_id: entry.actorId ?? null,
    references: sanitizeObservabilityPayload(entry.payload ?? {}),
  };
}

export function presentAdminPaymentSummary(input: {
  intent: {
    id: string;
    status: PaymentIntentStatus;
    amountMinor: bigint;
    capturedMinor: bigint;
    refundedMinor: bigint;
    currency: string;
    method: string;
    sandbox: boolean;
    createdAt: Date;
    updatedAt: Date;
    checkoutSessionId: string | null;
    attempts: Array<{
      id: string;
      status: PaymentAttemptStatus;
      submitted: boolean;
      routingJson: unknown;
      providerRef: string | null;
      errorCode: string | null;
      createdAt: Date;
    }>;
  };
  countryCode: string;
  order: { id: string; orderNumber: string } | null;
  lastReconciliation: { status: ReconciliationStatus; breakType: string } | null;
}): Record<string, unknown> {
  const attemptsChrono = [...input.intent.attempts].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const latestAttempt = input.intent.attempts[0];
  const gatewayCode = latestAttempt ? gatewayCodeFromRouting(latestAttempt.routingJson as never) : null;
  const gatewayEnvironment = latestAttempt ? gatewayEnvironmentFromRouting(latestAttempt.routingJson as never) : null;
  const attemptHistory = presentAttemptHistory(attemptsChrono);
  const failureOutcome = intentFailureOutcome({
    status: input.intent.status,
    attempts: input.intent.attempts,
  });
  return {
    id: input.intent.id,
    sandbox: input.intent.sandbox,
    environment: gatewayEnvironment ?? 'sandbox',
    status: input.intent.status,
    method: input.intent.method,
    amount_minor: input.intent.amountMinor.toString(),
    captured_minor: input.intent.capturedMinor.toString(),
    refunded_minor: input.intent.refundedMinor.toString(),
    currency: input.intent.currency,
    country_code: input.countryCode,
    checkout_session_id: input.intent.checkoutSessionId,
    order_id: input.order?.id ?? null,
    order_number: input.order?.orderNumber ?? null,
    gateway_code: gatewayCode,
    gateway_environment: gatewayEnvironment,
    failure_classification: classifyPaymentFailure({
      status: input.intent.status,
      attempts: input.intent.attempts,
    }),
    failure_outcome: failureOutcome,
    last_reconciliation_status: input.lastReconciliation?.status ?? null,
    last_reconciliation_break: input.lastReconciliation?.breakType === 'none' ? null : input.lastReconciliation?.breakType ?? null,
    created_at: input.intent.createdAt.toISOString(),
    updated_at: input.intent.updatedAt.toISOString(),
    fallback_occurred: attemptHistory.fallback_occurred,
    final_selected_gateway: attemptHistory.final_selected_gateway,
    attempt_history: attemptHistory.attempts,
    attempts: input.intent.attempts.map((a) => ({
      id: a.id,
      status: a.status,
      submitted: a.submitted,
      provider_ref: a.providerRef,
      gateway_code: gatewayCodeFromRouting(a.routingJson as never),
      gateway_environment: gatewayEnvironmentFromRouting(a.routingJson as never),
      error_code: a.errorCode,
      created_at: a.createdAt.toISOString(),
    })),
  };
}

export function sanitizeObservabilityPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (SENSITIVE_KEYS.test(key) || SENSITIVE_KEY_EXTRA.test(key)) {
      continue;
    }
    out[key] = sanitizeObservabilityValue(value);
  }
  return out;
}

export function sanitizeObservabilityValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeObservabilityValue);
  }
  if (value && typeof value === 'object') {
    return sanitizeObservabilityPayload(value as Record<string, unknown>);
  }
  if (typeof value === 'string' && (SENSITIVE_KEYS.test(value) || SENSITIVE_KEY_EXTRA.test(value))) {
    return '[redacted]';
  }
  return value;
}

export function assertObservabilityResponseSafe(body: unknown, path = 'root'): void {
  if (body === null || body === undefined) {
    return;
  }
  if (Array.isArray(body)) {
    for (let i = 0; i < body.length; i++) {
      assertObservabilityResponseSafe(body[i], `${path}[${i}]`);
    }
    return;
  }
  if (typeof body === 'object') {
    for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.test(key) || SENSITIVE_KEY_EXTRA.test(key)) {
        throw new Error(`Sensitive field exposed at ${path}.${key}`);
      }
      const lower = key.toLowerCase();
      if (lower.includes(PAN_FRAGMENT) || lower.includes(CVV_FRAGMENT)) {
        throw new Error(`Sensitive field exposed at ${path}.${key}`);
      }
      assertObservabilityResponseSafe(value, `${path}.${key}`);
    }
  }
}
