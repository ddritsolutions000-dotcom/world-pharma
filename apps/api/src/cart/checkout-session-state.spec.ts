import { CheckoutStatus } from '@prisma/client';
import {
  applyCheckoutSessionPaymentOutcome,
  isCheckoutSessionPayable,
  resolveCheckoutSessionPaymentTarget,
} from './checkout-session-state';

describe('checkout session state', () => {
  const outbox = { enqueue: jest.fn().mockResolvedValue(undefined) };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('marks payable sessions for pay including PAID replay', () => {
    expect(isCheckoutSessionPayable(CheckoutStatus.READY_FOR_PAYMENT)).toBe(true);
    expect(isCheckoutSessionPayable(CheckoutStatus.FAILED)).toBe(true);
    expect(isCheckoutSessionPayable(CheckoutStatus.PAID)).toBe(true);
    expect(isCheckoutSessionPayable(CheckoutStatus.EXPIRED)).toBe(false);
  });

  it('maps capture to PAID without regressing PAID', () => {
    expect(resolveCheckoutSessionPaymentTarget(CheckoutStatus.READY_FOR_PAYMENT, 'paid')).toBe(
      CheckoutStatus.PAID,
    );
    expect(resolveCheckoutSessionPaymentTarget(CheckoutStatus.FAILED, 'paid')).toBe(CheckoutStatus.PAID);
    expect(resolveCheckoutSessionPaymentTarget(CheckoutStatus.PAID, 'paid')).toBeNull();
  });

  it('maps pre-submit failure to FAILED without regressing PAID', () => {
    expect(resolveCheckoutSessionPaymentTarget(CheckoutStatus.READY_FOR_PAYMENT, 'pre_submit_failed')).toBe(
      CheckoutStatus.FAILED,
    );
    expect(resolveCheckoutSessionPaymentTarget(CheckoutStatus.PAID, 'pre_submit_failed')).toBeNull();
    expect(resolveCheckoutSessionPaymentTarget(CheckoutStatus.FAILED, 'pre_submit_failed')).toBeNull();
  });

  it('does not change in-flight checkout on pre-submit failure mapping when already FAILED', async () => {
    const tx = {
      checkoutSession: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'sess-1',
          customerPersonId: 'person-a',
          countryId: 'country-a',
          status: CheckoutStatus.FAILED,
        }),
        update: jest.fn(),
      },
    };
    const result = await applyCheckoutSessionPaymentOutcome(tx as never, outbox as never, {
      checkoutSessionId: 'sess-1',
      customerPersonId: 'person-a',
      countryId: 'country-a',
      paymentIntentId: 'pi-1',
      outcome: 'pre_submit_failed',
    });
    expect(result.changed).toBe(false);
    expect(tx.checkoutSession.update).not.toHaveBeenCalled();
  });

  it('transitions to PAID and emits checkout paid event once', async () => {
    const tx = {
      checkoutSession: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'sess-1',
          customerPersonId: 'person-a',
          countryId: 'country-a',
          status: CheckoutStatus.READY_FOR_PAYMENT,
        }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const result = await applyCheckoutSessionPaymentOutcome(tx as never, outbox as never, {
      checkoutSessionId: 'sess-1',
      customerPersonId: 'person-a',
      countryId: 'country-a',
      paymentIntentId: 'pi-1',
      outcome: 'paid',
    });
    expect(result.status).toBe(CheckoutStatus.PAID);
    expect(result.changed).toBe(true);
    expect(outbox.enqueue).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ type: 'CHECKOUT_SESSION_PAID', aggregateId: 'sess-1' }),
    );
  });

  it('rejects cross-customer checkout state update', async () => {
    const tx = {
      checkoutSession: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'sess-1',
          customerPersonId: 'person-a',
          countryId: 'country-a',
          status: CheckoutStatus.READY_FOR_PAYMENT,
        }),
      },
    };
    await expect(
      applyCheckoutSessionPaymentOutcome(tx as never, outbox as never, {
        checkoutSessionId: 'sess-1',
        customerPersonId: 'person-b',
        countryId: 'country-a',
        paymentIntentId: 'pi-1',
        outcome: 'paid',
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('rejects cross-country checkout state update', async () => {
    const tx = {
      checkoutSession: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'sess-1',
          customerPersonId: 'person-a',
          countryId: 'country-a',
          status: CheckoutStatus.READY_FOR_PAYMENT,
        }),
      },
    };
    await expect(
      applyCheckoutSessionPaymentOutcome(tx as never, outbox as never, {
        checkoutSessionId: 'sess-1',
        customerPersonId: 'person-a',
        countryId: 'country-b',
        paymentIntentId: 'pi-1',
        outcome: 'paid',
      }),
    ).rejects.toMatchObject({ status: 403 });
  });
});
