import { CheckoutStatus, InventoryReservationStatus } from '@prisma/client';
import { releaseCheckoutReservationsForPaymentFailure } from './checkout-reservation-release';

describe('checkout reservation release', () => {
  const releaseReservation = jest.fn().mockResolvedValue(undefined);
  const outbox = { enqueue: jest.fn().mockResolvedValue(undefined) };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('releases open checkout reservations and clears session holds', async () => {
    const tx = {
      checkoutSession: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'sess-1',
          customerPersonId: 'person-a',
          countryId: 'country-a',
          skipInventoryHold: false,
          reservationIds: ['res-1'],
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      inventoryReservation: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'res-1',
          status: InventoryReservationStatus.OPEN,
          lotId: 'lot-1',
          qty: 1,
          ownerOrgId: 'org-1',
          locationId: 'loc-1',
          variantId: 'var-1',
        }),
      },
    };

    const result = await releaseCheckoutReservationsForPaymentFailure(
      tx as never,
      outbox as never,
      releaseReservation,
      {
        checkoutSessionId: 'sess-1',
        customerPersonId: 'person-a',
        countryId: 'country-a',
        paymentIntentId: 'pi-1',
      },
    );

    expect(result.status).toBe('released');
    expect(result.released_reservation_ids).toEqual(['res-1']);
    expect(releaseReservation).toHaveBeenCalledTimes(1);
    expect(tx.checkoutSession.update).toHaveBeenCalledWith({
      where: { id: 'sess-1' },
      data: { reservationIds: [] },
    });
    expect(outbox.enqueue).toHaveBeenCalled();
  });

  it('is idempotent when reservations are already released', async () => {
    const tx = {
      checkoutSession: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'sess-1',
          customerPersonId: 'person-a',
          countryId: 'country-a',
          skipInventoryHold: false,
          reservationIds: ['res-1'],
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      inventoryReservation: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'res-1',
          status: InventoryReservationStatus.RELEASED,
          lotId: 'lot-1',
          qty: 1,
          ownerOrgId: 'org-1',
          locationId: 'loc-1',
          variantId: 'var-1',
        }),
      },
    };

    const result = await releaseCheckoutReservationsForPaymentFailure(
      tx as never,
      outbox as never,
      releaseReservation,
      {
        checkoutSessionId: 'sess-1',
        customerPersonId: 'person-a',
        countryId: 'country-a',
        paymentIntentId: 'pi-1',
      },
    );

    expect(result.status).toBe('already_released');
    expect(releaseReservation).not.toHaveBeenCalled();
  });

  it('rejects cross-country release', async () => {
    const tx = {
      checkoutSession: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'sess-1',
          customerPersonId: 'person-a',
          countryId: 'country-a',
          skipInventoryHold: false,
          reservationIds: ['res-1'],
        }),
      },
    };

    await expect(
      releaseCheckoutReservationsForPaymentFailure(tx as never, outbox as never, releaseReservation, {
        checkoutSessionId: 'sess-1',
        customerPersonId: 'person-a',
        countryId: 'country-b',
        paymentIntentId: 'pi-1',
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('rejects cross-customer release', async () => {
    const tx = {
      checkoutSession: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'sess-1',
          customerPersonId: 'person-a',
          countryId: 'country-a',
          skipInventoryHold: false,
          reservationIds: ['res-1'],
        }),
      },
    };

    await expect(
      releaseCheckoutReservationsForPaymentFailure(tx as never, outbox as never, releaseReservation, {
        checkoutSessionId: 'sess-1',
        customerPersonId: 'person-b',
        countryId: 'country-a',
        paymentIntentId: 'pi-1',
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('skips release when checkout uses skipInventoryHold', async () => {
    const tx = {
      checkoutSession: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'sess-1',
          customerPersonId: 'person-a',
          countryId: 'country-a',
          skipInventoryHold: true,
          reservationIds: [],
          status: CheckoutStatus.READY_FOR_PAYMENT,
        }),
      },
    };

    const result = await releaseCheckoutReservationsForPaymentFailure(
      tx as never,
      outbox as never,
      releaseReservation,
      {
        checkoutSessionId: 'sess-1',
        customerPersonId: 'person-a',
        countryId: 'country-a',
        paymentIntentId: 'pi-1',
      },
    );

    expect(result.status).toBe('already_released');
    expect(releaseReservation).not.toHaveBeenCalled();
  });
});
