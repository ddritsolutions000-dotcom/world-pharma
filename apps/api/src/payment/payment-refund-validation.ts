import { Errors } from '../common/problem';

export type RefundAmountValidation =
  | { ok: true; amountMinor: bigint }
  | { ok: false; code: string; title: string; detail: string };

/** Validates refund amount against captured/refunded balances — provider-neutral. */
export function validateRefundAmount(input: {
  amountMinor?: bigint;
  capturedMinor: bigint;
  refundedMinor: bigint;
}): RefundAmountValidation {
  const remaining = input.capturedMinor - input.refundedMinor;
  const amt = input.amountMinor ?? remaining;
  if (amt <= 0n) {
    return {
      ok: false,
      code: 'INVALID_REFUND_AMOUNT',
      title: 'Invalid refund amount',
      detail: 'Refund amount must be greater than zero.',
    };
  }
  if (amt > remaining) {
    return {
      ok: false,
      code: 'OVER_REFUND',
      title: 'Over refund',
      detail: 'Refund exceeds captured remainder.',
    };
  }
  return { ok: true, amountMinor: amt };
}

export function assertRefundAmount(input: {
  amountMinor?: bigint;
  capturedMinor: bigint;
  refundedMinor: bigint;
}): bigint {
  const result = validateRefundAmount(input);
  if (!result.ok) {
    throw Errors.problem(409, result.code, result.title, result.detail);
  }
  return result.amountMinor;
}
