/**
 * Sprint 44 — Payment reconciliation discrepancy taxonomy.
 * Stored in PaymentReconciliation.breakType (existing string column).
 * Do not silently auto-fix mismatches.
 */

export const PAYMENT_RECON_DISCREPANCY = {
  NONE: 'none',
  MATCHED: 'MATCHED',
  PENDING: 'PENDING',
  AMOUNT_MISMATCH: 'AMOUNT_MISMATCH',
  CURRENCY_MISMATCH: 'CURRENCY_MISMATCH',
  UNKNOWN_PROVIDER_TRANSACTION: 'UNKNOWN_PROVIDER_TRANSACTION',
  MISSING_WEBHOOK: 'MISSING_WEBHOOK',
  STATE_MISMATCH: 'STATE_MISMATCH',
  REFUND_MISMATCH: 'REFUND_MISMATCH',
  MISSING_TRANSACTION: 'MISSING_TRANSACTION',
} as const;

export type PaymentReconDiscrepancyCode =
  (typeof PAYMENT_RECON_DISCREPANCY)[keyof typeof PAYMENT_RECON_DISCREPANCY];

/** Map legacy lowercase break types to Sprint 44 codes. */
export function normalizeReconBreakType(raw: string): PaymentReconDiscrepancyCode {
  const upper = raw.trim().toUpperCase();
  if (upper === 'NONE' || upper === '') return PAYMENT_RECON_DISCREPANCY.NONE;
  if (upper === 'AMOUNT_MISMATCH') return PAYMENT_RECON_DISCREPANCY.AMOUNT_MISMATCH;
  if (upper === 'CURRENCY_MISMATCH') return PAYMENT_RECON_DISCREPANCY.CURRENCY_MISMATCH;
  if (upper === 'MISSING_TRANSACTION') return PAYMENT_RECON_DISCREPANCY.MISSING_TRANSACTION;
  if (upper === 'STATE_MISMATCH') return PAYMENT_RECON_DISCREPANCY.STATE_MISMATCH;
  if (upper === 'MISSING_WEBHOOK') return PAYMENT_RECON_DISCREPANCY.MISSING_WEBHOOK;
  if (upper === 'UNKNOWN_PROVIDER_TRANSACTION') {
    return PAYMENT_RECON_DISCREPANCY.UNKNOWN_PROVIDER_TRANSACTION;
  }
  if (upper === 'REFUND_MISMATCH') return PAYMENT_RECON_DISCREPANCY.REFUND_MISMATCH;
  if (upper === 'PENDING') return PAYMENT_RECON_DISCREPANCY.PENDING;
  if (upper === 'MATCHED') return PAYMENT_RECON_DISCREPANCY.MATCHED;
  // legacy
  if (raw === 'amount_mismatch') return PAYMENT_RECON_DISCREPANCY.AMOUNT_MISMATCH;
  if (raw === 'currency_mismatch') return PAYMENT_RECON_DISCREPANCY.CURRENCY_MISMATCH;
  if (raw === 'missing_transaction') return PAYMENT_RECON_DISCREPANCY.MISSING_TRANSACTION;
  if (raw === 'none') return PAYMENT_RECON_DISCREPANCY.NONE;
  return upper as PaymentReconDiscrepancyCode;
}

export type PaymentReconReviewRow = {
  reconciliation_id: string;
  intent_id: string | null;
  order_id: string | null;
  provider_ref: string | null;
  internal_status: string | null;
  provider_status: string | null;
  expected_amount_minor: string | null;
  provider_amount_minor: string | null;
  expected_currency: string | null;
  provider_currency: string | null;
  webhook_state: string | null;
  discrepancy: PaymentReconDiscrepancyCode;
  reconciliation_status: string;
  detail: string;
  created_at: string;
  reviewable: true;
};
