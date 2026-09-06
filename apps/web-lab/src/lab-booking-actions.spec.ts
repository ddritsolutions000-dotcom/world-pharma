import { labBookingNextStep, labBookingStatusFilter } from './lab-booking-actions';

describe('labBookingStatusFilter', () => {
  it('filters confirmed bookings', () => {
    expect(labBookingStatusFilter('CONFIRMED', 'confirmed')).toBe(true);
    expect(labBookingStatusFilter('BOOKED', 'confirmed')).toBe(false);
  });

  it('filters cancelled and terminal failures', () => {
    expect(labBookingStatusFilter('CANCELLED', 'cancelled')).toBe(true);
    expect(labBookingStatusFilter('PAYMENT_FAILED', 'cancelled')).toBe(true);
    expect(labBookingStatusFilter('CONFIRMED', 'cancelled')).toBe(false);
  });

  it('active includes booked and confirmed', () => {
    expect(labBookingStatusFilter('BOOKED', 'active')).toBe(true);
    expect(labBookingStatusFilter('CONFIRMED', 'active')).toBe(true);
    expect(labBookingStatusFilter('CANCELLED', 'active')).toBe(false);
  });
});

describe('labBookingNextStep', () => {
  it('guides operator by booking status', () => {
    expect(labBookingNextStep('BOOKED')).toMatch(/payment/i);
    expect(labBookingNextStep('CONFIRMED')).toMatch(/collection/i);
    expect(labBookingNextStep('CANCELLED')).toBeNull();
  });
});
