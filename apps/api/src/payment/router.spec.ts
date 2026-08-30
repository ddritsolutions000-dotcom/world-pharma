import { ProblemException } from '../common/problem';
import { PaymentRouter } from './router';

describe('PaymentRouter', () => {
  it('queries only sandbox gateways by default', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = { paymentRoutingRule: { findMany: jest.fn().mockResolvedValue([]) }, paymentGateway: { findMany } };
    const router = new PaymentRouter(prisma as never);
    await router.candidates({
      countryId: 'c1',
      countryIso2: 'XX',
      currency: 'XXX',
      method: 'CARD',
      amountMinor: 100n,
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ environment: 'sandbox' }),
      }),
    );
  });

  it('fail-closes production candidate query without prerequisites', async () => {
    const prisma = { paymentRoutingRule: { findMany: jest.fn() }, paymentGateway: { findMany: jest.fn() } };
    const router = new PaymentRouter(prisma as never);
    delete process.env['PAYMENT_LIVE_ENABLED'];
    await expect(
      router.candidates(
        { countryId: 'c1', countryIso2: 'US', currency: 'USD', method: 'CARD', amountMinor: 100n },
        'production',
      ),
    ).rejects.toThrow(ProblemException);
  });
});
