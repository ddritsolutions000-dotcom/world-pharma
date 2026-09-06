import { imagingBookingNextStep, imagingBookingStatusFilter } from './imaging-booking-actions';

describe('imagingBookingStatusFilter', () => {
  it('filters confirmed bookings', () => {
    expect(imagingBookingStatusFilter('CONFIRMED', 'confirmed')).toBe(true);
    expect(imagingBookingStatusFilter('BOOKED', 'confirmed')).toBe(false);
  });

  it('filters cancelled and terminal failures', () => {
    expect(imagingBookingStatusFilter('CANCELLED', 'cancelled')).toBe(true);
    expect(imagingBookingStatusFilter('PAYMENT_FAILED', 'cancelled')).toBe(true);
  });
});

describe('imagingBookingNextStep', () => {
  it('guides operator by booking status', () => {
    expect(imagingBookingNextStep('BOOKED')).toMatch(/payment/i);
    expect(imagingBookingNextStep('CONFIRMED')).toMatch(/check-in/i);
    expect(imagingBookingNextStep('CANCELLED')).toBeNull();
  });
});
