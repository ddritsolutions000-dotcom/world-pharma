import { PaymentIntentStatus } from '@prisma/client';
import {
  CHECKOUT_PAY_SUCCESS_STATUSES,
  resolveCheckoutPayGuard,
} from './checkout-pay-guard';

describe('checkout pay guard', () => {
  const t0 = new Date('2026-01-01T00:00:00.000Z');
  const t1 = new Date('2026-01-01T00:00:01.000Z');

  it('proceeds when no prior checkout payment exists', () => {
    expect(resolveCheckoutPayGuard([])).toEqual({ action: 'proceed' });
  });

  it('returns existing captured payment', () => {
    const decision = resolveCheckoutPayGuard([
      { id: 'pi-failed', status: PaymentIntentStatus.FAILED, createdAt: t0 },
      { id: 'pi-captured', status: PaymentIntentStatus.CAPTURED, createdAt: t1 },
    ]);
    expect(decision).toEqual({
      action: 'return_existing',
      intentId: 'pi-captured',
      alreadyPaid: true,
    });
  });

  it('returns existing authorized COD payment', () => {
    const decision = resolveCheckoutPayGuard([
      { id: 'pi-cod', status: PaymentIntentStatus.AUTHORIZED_COD, createdAt: t0 },
    ]);
    expect(decision).toEqual({
      action: 'return_existing',
      intentId: 'pi-cod',
      alreadyPaid: true,
    });
  });

  it('allows retry after failed checkout payment', () => {
    expect(
      resolveCheckoutPayGuard([{ id: 'pi-failed', status: PaymentIntentStatus.FAILED, createdAt: t0 }]),
    ).toEqual({ action: 'proceed' });
  });

  it('returns existing requires-action intent for client continuation', () => {
    const decision = resolveCheckoutPayGuard([
      { id: 'pi-ra', status: PaymentIntentStatus.REQUIRES_ACTION, createdAt: t0 },
    ]);
    expect(decision).toEqual({
      action: 'return_existing',
      intentId: 'pi-ra',
      alreadyPaid: false,
    });
  });

  it('rejects parallel pay while CREATED/PROCESSING is in flight', () => {
    expect(
      resolveCheckoutPayGuard([{ id: 'pi-new', status: PaymentIntentStatus.CREATED, createdAt: t0 }]),
    ).toEqual({ action: 'reject_in_flight', intentId: 'pi-new' });
    expect(
      resolveCheckoutPayGuard([{ id: 'pi-proc', status: PaymentIntentStatus.PROCESSING, createdAt: t0 }]),
    ).toEqual({ action: 'reject_in_flight', intentId: 'pi-proc' });
  });

  it('documents success statuses used by the guard', () => {
    expect(CHECKOUT_PAY_SUCCESS_STATUSES).toContain(PaymentIntentStatus.CAPTURED);
    expect(CHECKOUT_PAY_SUCCESS_STATUSES).toContain(PaymentIntentStatus.AUTHORIZED_COD);
  });
});
