import {
  imagingBookingDraftError,
  imagingPaymentRetryable,
} from './imaging-api';

describe('R8-B customer RN imaging parity helpers', () => {
  it('allows sandbox payment retry only for BOOKED and PAYMENT_FAILED', () => {
    expect(imagingPaymentRetryable('BOOKED')).toBe(true);
    expect(imagingPaymentRetryable('PAYMENT_FAILED')).toBe(true);
    expect(imagingPaymentRetryable('CONFIRMED')).toBe(false);
    expect(imagingPaymentRetryable('CANCELLED')).toBe(false);
  });

  it('requires explicit location and slot selection before booking', () => {
    expect(
      imagingBookingDraftError({
        eligible: true,
        locationId: '',
        slotStartsAt: '',
        prepAcknowledged: false,
        referralRequired: false,
        referralReference: '',
      }),
    ).toBe('Select an imaging center location.');

    expect(
      imagingBookingDraftError({
        eligible: true,
        locationId: 'loc-1',
        slotStartsAt: '',
        prepAcknowledged: true,
        referralRequired: false,
        referralReference: '',
      }),
    ).toBe('Select an appointment slot.');

    expect(
      imagingBookingDraftError({
        eligible: true,
        locationId: 'loc-1',
        slotStartsAt: '2026-08-29T09:00:00.000Z',
        prepAcknowledged: true,
        referralRequired: false,
        referralReference: '',
      }),
    ).toBeNull();
  });

  it('enforces referral when pack requires it', () => {
    expect(
      imagingBookingDraftError({
        eligible: true,
        locationId: 'loc-1',
        slotStartsAt: '2026-08-29T09:00:00.000Z',
        prepAcknowledged: true,
        referralRequired: true,
        referralReference: '  ',
      }),
    ).toBe('Referral reference is required for this country pack.');
  });

  it('blocks booking when eligibility check failed', () => {
    expect(
      imagingBookingDraftError({
        eligible: false,
        locationId: 'loc-1',
        slotStartsAt: '2026-08-29T09:00:00.000Z',
        prepAcknowledged: true,
        referralRequired: false,
        referralReference: '',
      }),
    ).toBe('Not eligible for booking.');
  });
});
