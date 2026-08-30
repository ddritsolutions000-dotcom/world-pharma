import { PaymentIntentStatus } from '@prisma/client';
import { canTransitionIntent } from './state-machine';

export type GatewayStatusToken = 'captured' | 'failed' | 'authorized' | 'unknown' | 'voided' | 'requires_action';

/** Maps sandbox webhook type strings to gateway status tokens. */
export function mapWebhookType(type: string | undefined): GatewayStatusToken | null {
  if (!type || type === 'unknown') {
    return null;
  }
  if (type.includes('captur') || type === 'payment.captured') {
    return 'captured';
  }
  if (type.includes('fail') || type === 'payment.failed') {
    return 'failed';
  }
  if (type.includes('author')) {
    return 'authorized';
  }
  return null;
}

export function mapGatewayStatus(current: PaymentIntentStatus, gw: string): PaymentIntentStatus {
  if (gw === 'requires_action') {
    return PaymentIntentStatus.REQUIRES_ACTION;
  }
  if (gw === 'authorized') {
    return PaymentIntentStatus.AUTHORIZED;
  }
  if (gw === 'captured') {
    return PaymentIntentStatus.CAPTURED;
  }
  if (gw === 'failed') {
    return PaymentIntentStatus.FAILED;
  }
  if (gw === 'unknown') {
    return PaymentIntentStatus.UNKNOWN;
  }
  if (gw === 'voided') {
    return PaymentIntentStatus.CANCELLED;
  }
  return current;
}

/** True when webhook-derived status may be applied without regressing payment state. */
export function shouldApplyGatewayStatus(current: PaymentIntentStatus, gwStatus: string): boolean {
  const mapped = mapGatewayStatus(current, gwStatus);
  if (current === mapped) {
    return false;
  }
  return canTransitionIntent(current, mapped);
}

export function paymentEventName(status: PaymentIntentStatus): string {
  switch (status) {
    case PaymentIntentStatus.REQUIRES_ACTION:
      return 'PAYMENT_REQUIRES_ACTION';
    case PaymentIntentStatus.PROCESSING:
      return 'PAYMENT_PROCESSING';
    case PaymentIntentStatus.AUTHORIZED:
    case PaymentIntentStatus.AUTHORIZED_COD:
      return 'PAYMENT_AUTHORIZED';
    case PaymentIntentStatus.CAPTURED:
      return 'PAYMENT_CAPTURED';
    case PaymentIntentStatus.FAILED:
      return 'PAYMENT_FAILED';
    case PaymentIntentStatus.CANCELLED:
      return 'PAYMENT_CANCELLED';
    case PaymentIntentStatus.EXPIRED:
      return 'PAYMENT_EXPIRED';
    case PaymentIntentStatus.UNKNOWN:
      return 'PAYMENT_UNKNOWN';
    default:
      return 'PAYMENT_INTENT_CREATED';
  }
}

export function captureTransactionKind(status: PaymentIntentStatus): 'capture' | 'authorization' | null {
  if (status === PaymentIntentStatus.CAPTURED) {
    return 'capture';
  }
  if (status === PaymentIntentStatus.AUTHORIZED) {
    return 'authorization';
  }
  return null;
}
