/**
 * 1mg-like medicine return eligibility (server-authoritative).
 * Customer UI hints must match these gates.
 */
import { OrderStatus, ReturnReason, TemperatureRequirement, type OrderStatusHistory } from '@prisma/client';

export const RETURN_WINDOW_HOURS = 48;

export type ReturnEligibilityInput = {
  orderStatus: OrderStatus;
  history: Array<Pick<OrderStatusHistory, 'toStatus' | 'createdAt'>>;
  /** True when any shipment package is non-ambient. */
  hasColdChain: boolean;
  /** Rx inventory already consumed at dispense — returns still allowed for quality reasons. */
  rxInventoryConsumedAtDispense: boolean;
  openReturnExists: boolean;
  reason?: ReturnReason;
  note?: string | null;
  now?: Date;
};

export type ReturnEligibilityResult = {
  eligible: boolean;
  window_hours: number;
  delivered_at: string | null;
  hours_since_delivery: number | null;
  reasons: string[];
  allowed_reasons: ReturnReason[];
  policy: {
    delivered_only: true;
    cold_chain_blocked: true;
    duplicate_open_blocked: true;
  };
};

const QUALITY_REASONS: ReturnReason[] = [
  ReturnReason.WRONG_ITEM,
  ReturnReason.DAMAGED,
  ReturnReason.OTHER_POLICY_ALLOWED,
];

export function deliveredAtFromHistory(
  history: Array<Pick<OrderStatusHistory, 'toStatus' | 'createdAt'>>,
): Date | null {
  const hit = [...history]
    .filter((h) => h.toStatus === OrderStatus.DELIVERED)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
  return hit?.createdAt ?? null;
}

export function assessReturnEligibility(input: ReturnEligibilityInput): ReturnEligibilityResult {
  const now = input.now ?? new Date();
  const reasons: string[] = [];
  const deliveredAt = deliveredAtFromHistory(input.history);
  const hoursSince =
    deliveredAt != null ? (now.getTime() - deliveredAt.getTime()) / (1000 * 60 * 60) : null;

  if (input.orderStatus !== OrderStatus.DELIVERED) {
    reasons.push('Returns are only available after the order is delivered.');
  }
  if (input.openReturnExists) {
    reasons.push('A return request is already open for this order.');
  }
  if (input.hasColdChain) {
    reasons.push('Cold-chain medicines cannot be returned through self-serve (1mg-like policy).');
  }
  if (deliveredAt == null && input.orderStatus === OrderStatus.DELIVERED) {
    reasons.push('Delivery timestamp missing — contact support for a return.');
  }
  if (hoursSince != null && hoursSince > RETURN_WINDOW_HOURS) {
    reasons.push(`Return window is ${RETURN_WINDOW_HOURS} hours after delivery.`);
  }

  if (input.reason) {
    if (input.rxInventoryConsumedAtDispense && input.reason === ReturnReason.CUSTOMER_REFUSAL) {
      reasons.push('Prescription orders cannot use customer refusal after delivery.');
    }
    if (
      input.reason === ReturnReason.OTHER_POLICY_ALLOWED &&
      !(input.note && input.note.trim().length >= 8)
    ) {
      reasons.push('Please add a short note (8+ characters) for “Other” returns.');
    }
  }

  const eligible = reasons.length === 0;
  return {
    eligible,
    window_hours: RETURN_WINDOW_HOURS,
    delivered_at: deliveredAt?.toISOString() ?? null,
    hours_since_delivery: hoursSince != null ? Math.round(hoursSince * 10) / 10 : null,
    reasons,
    allowed_reasons: QUALITY_REASONS,
    policy: {
      delivered_only: true,
      cold_chain_blocked: true,
      duplicate_open_blocked: true,
    },
  };
}
