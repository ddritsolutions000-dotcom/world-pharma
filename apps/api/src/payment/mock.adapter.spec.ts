import { PaymentMethodFamily } from '@prisma/client';
import { MockPaymentGatewayAdapter } from './mock.adapter';

describe('MockPaymentGatewayAdapter', () => {
  const adapter = new MockPaymentGatewayAdapter();

  it('returns upi_collect next action for UPI sandbox scenario', async () => {
    const result = await adapter.submit({
      attemptId: 'att-1',
      intentId: 'int-1',
      amountMinor: 8900n,
      currency: 'INR',
      method: PaymentMethodFamily.MOBILE_PAYMENT,
      countryIso2: 'IN',
      scenario: 'upi_collect',
      paymentMethodRef: 'tok_sandbox',
    });
    expect(result.submitted).toBe(true);
    expect(result.status).toBe('requires_action');
    expect(result.nextAction?.type).toBe('upi_collect');
    expect(result.nextAction?.vpa).toBe('worldpharma@upi');
  });

  it('captures after resolveMockStatus for pending UPI collect', async () => {
    const submitted = await adapter.submit({
      attemptId: 'att-2',
      intentId: 'int-2',
      amountMinor: 5000n,
      currency: 'INR',
      method: PaymentMethodFamily.MOBILE_PAYMENT,
      countryIso2: 'IN',
      scenario: 'upi_collect',
      paymentMethodRef: 'tok_sandbox',
    });
    adapter.resolve(submitted.providerRef!, 'captured', 5000n, 'INR');
    const status = await adapter.status(submitted.providerRef!);
    expect(status.status).toBe('captured');
  });
});
