import { canRequestRefund, canRequestReturn, canReviewOrder, returnReasonLabel } from './order-after-sales';

describe('order after-sales eligibility', () => {
  it('allows return only on delivered orders', () => {
    expect(canRequestReturn('DELIVERED')).toBe(true);
    expect(canRequestReturn('SHIPPED')).toBe(false);
    expect(canRequestReturn('CONFIRMED')).toBe(false);
  });

  it('allows refund when not already refunded', () => {
    expect(canRequestRefund('DELIVERED')).toBe(true);
    expect(canRequestRefund('REFUNDED')).toBe(false);
    expect(canRequestRefund('REFUND_PENDING')).toBe(false);
  });

  it('allows product review only after delivery', () => {
    expect(canReviewOrder('DELIVERED')).toBe(true);
    expect(canReviewOrder('SHIPPED')).toBe(false);
    expect(canReviewOrder('ALLOCATED')).toBe(false);
  });

  it('labels return reasons for customers', () => {
    expect(returnReasonLabel('DAMAGED')).toMatch(/damaged/i);
  });
});
