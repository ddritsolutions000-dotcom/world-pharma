import {
  normalizeReconBreakType,
  PAYMENT_RECON_DISCREPANCY,
  type PaymentReconDiscrepancyCode,
} from './payment-reconciliation';

describe('payment-reconciliation taxonomy', () => {
  it('normalizes legacy lowercase break types', () => {
    expect(normalizeReconBreakType('amount_mismatch')).toBe(
      PAYMENT_RECON_DISCREPANCY.AMOUNT_MISMATCH,
    );
    expect(normalizeReconBreakType('currency_mismatch')).toBe(
      PAYMENT_RECON_DISCREPANCY.CURRENCY_MISMATCH,
    );
    expect(normalizeReconBreakType('none')).toBe(PAYMENT_RECON_DISCREPANCY.NONE);
  });

  it('preserves Sprint 44 codes', () => {
    const codes: PaymentReconDiscrepancyCode[] = [
      PAYMENT_RECON_DISCREPANCY.AMOUNT_MISMATCH,
      PAYMENT_RECON_DISCREPANCY.MISSING_WEBHOOK,
      PAYMENT_RECON_DISCREPANCY.STATE_MISMATCH,
      PAYMENT_RECON_DISCREPANCY.REFUND_MISMATCH,
      PAYMENT_RECON_DISCREPANCY.UNKNOWN_PROVIDER_TRANSACTION,
    ];
    for (const code of codes) {
      expect(normalizeReconBreakType(code)).toBe(code);
    }
  });
});
