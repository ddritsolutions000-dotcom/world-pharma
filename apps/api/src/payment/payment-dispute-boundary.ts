/**
 * Future production capability boundary — no dispute/chargeback states are fabricated in Sprint 28.
 * Payment reversals today flow through refund orchestration and finance sync only.
 */
export const PAYMENT_DISPUTE_BOUNDARY = {
  implemented: false,
  chargeback_platform: 'future',
  dispute_states: 'not_in_schema',
  current_reversal_path: 'refund_via_payment_intent_refundedMinor',
  notes: [
    'Chargebacks and PSP disputes require a production PSP adapter and dispute webhook ingestion.',
    'Financial adjustments for disputes should reuse FinanceService sync paths — not a second ledger.',
  ],
} as const;
