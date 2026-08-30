import { OrderStatus } from '@prisma/client';
import { assertOrderTransition, canTransitionOrder } from './state-machine';

describe('order state machine', () => {
  it('allows CONFIRMED → ALLOCATED and ALLOCATED → PICKING', () => {
    expect(canTransitionOrder(OrderStatus.CONFIRMED, OrderStatus.ALLOCATED)).toBe(true);
    expect(canTransitionOrder(OrderStatus.ALLOCATED, OrderStatus.PICKING)).toBe(true);
  });

  it('rejects DELIVERED → ALLOCATED', () => {
    expect(canTransitionOrder(OrderStatus.DELIVERED, OrderStatus.ALLOCATED)).toBe(false);
    expect(() => assertOrderTransition(OrderStatus.DELIVERED, OrderStatus.ALLOCATED)).toThrow(
      /Illegal order transition/,
    );
  });
});
