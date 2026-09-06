import {
  checkoutPayButtonLabel,
  checkoutSuccessCopy,
  isUpiCollectPending,
  paymentMethodHint,
  upiCollectVpa,
} from './checkout-payment-ui';

describe('checkout-payment-ui UPI helpers', () => {
  it('detects pending UPI collect intent', () => {
    expect(
      isUpiCollectPending(
        { status: 'REQUIRES_ACTION', next_action: { type: 'upi_collect', vpa: 'shop@upi' } },
        'MOBILE_PAYMENT',
      ),
    ).toBe(true);
  });

  it('ignores non-UPI methods', () => {
    expect(
      isUpiCollectPending({ status: 'REQUIRES_ACTION', next_action: { type: 'upi_collect' } }, 'CARD'),
    ).toBe(false);
  });

  it('falls back to default VPA', () => {
    expect(upiCollectVpa(undefined)).toBe('worldpharma@upi');
    expect(upiCollectVpa({ type: 'upi_collect', vpa: 'custom@upi' })).toBe('custom@upi');
  });

  it('uses UPI label only for India mobile payment', () => {
    expect(checkoutPayButtonLabel('MOBILE_PAYMENT', true, undefined, 'IN')).toBe('Pay with UPI');
    expect(checkoutPayButtonLabel('MOBILE_PAYMENT', true, undefined, 'AE')).toBe('Pay with mobile payment');
    expect(checkoutPayButtonLabel('MOBILE_PAYMENT', true, undefined, 'US')).toBe('Pay with mobile payment');
  });

  it('scopes UPI success copy to India', () => {
    expect(checkoutSuccessCopy('MOBILE_PAYMENT', 'IN').description).toMatch(/UPI/);
    expect(checkoutSuccessCopy('MOBILE_PAYMENT', 'AE').description).not.toMatch(/UPI/);
  });

  it('keeps UPI payment hints India-only', () => {
    expect(paymentMethodHint('MOBILE_PAYMENT', 'IN')).toMatch(/UPI/);
    expect(paymentMethodHint('MOBILE_PAYMENT', 'AE')).not.toMatch(/UPI/);
  });
});
