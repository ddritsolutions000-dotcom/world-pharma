import { validateRefundAmount } from './payment-refund-validation';

describe('payment-refund-validation', () => {
  it('accepts full remaining refund', () => {
    const result = validateRefundAmount({ capturedMinor: 1000n, refundedMinor: 0n });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.amountMinor).toBe(1000n);
    }
  });

  it('rejects over-refund', () => {
    const result = validateRefundAmount({
      amountMinor: 600n,
      capturedMinor: 1000n,
      refundedMinor: 500n,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('OVER_REFUND');
    }
  });

  it('rejects zero refund', () => {
    const result = validateRefundAmount({
      amountMinor: 0n,
      capturedMinor: 1000n,
      refundedMinor: 0n,
    });
    expect(result.ok).toBe(false);
  });
});
