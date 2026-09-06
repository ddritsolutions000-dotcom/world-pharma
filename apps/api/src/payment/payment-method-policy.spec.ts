import {
  allowedPaymentFamilies,
  normalizePolicyPaymentMethod,
  paymentMethodLabel,
  policyAllowsPaymentMethod,
  resolvePaymentMethodFromInput,
} from './payment-method-policy';
import { PaymentMethodFamily } from '@prisma/client';

describe('payment-method-policy', () => {
  it('maps UPI policy token to MOBILE_PAYMENT', () => {
    expect(normalizePolicyPaymentMethod('UPI')).toBe(PaymentMethodFamily.MOBILE_PAYMENT);
    expect(policyAllowsPaymentMethod(['UPI', 'CARD', 'COD'], 'MOBILE_PAYMENT')).toBe(true);
    expect(resolvePaymentMethodFromInput('UPI', ['UPI', 'CARD', 'COD'])).toBe(PaymentMethodFamily.MOBILE_PAYMENT);
  });

  it('returns India-friendly labels', () => {
    expect(paymentMethodLabel('IN', PaymentMethodFamily.MOBILE_PAYMENT, 'Mobile payment')).toContain('UPI');
    expect(paymentMethodLabel('XX', PaymentMethodFamily.COD, 'Cash on delivery')).toBe('Cash on delivery');
  });

  it('collects allowed families from policy aliases', () => {
    expect(allowedPaymentFamilies(['UPI', 'CARD'])).toEqual([
      PaymentMethodFamily.MOBILE_PAYMENT,
      PaymentMethodFamily.CARD,
    ]);
  });
});
