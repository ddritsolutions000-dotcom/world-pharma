import { ShipmentStatus } from '@prisma/client';
import { canTransitionShipment, assertShipmentTransition } from './state';

describe('shipment state machine', () => {
  it('allows the happy path and forbids delivered downgrade', () => {
    expect(canTransitionShipment(ShipmentStatus.READY, ShipmentStatus.BOOKING)).toBe(true);
    expect(canTransitionShipment(ShipmentStatus.BOOKING, ShipmentStatus.BOOKING_UNKNOWN)).toBe(true);
    expect(canTransitionShipment(ShipmentStatus.DELIVERED, ShipmentStatus.IN_TRANSIT)).toBe(false);
    expect(() => assertShipmentTransition(ShipmentStatus.DELIVERED, ShipmentStatus.IN_TRANSIT)).toThrow();
  });

  it('allows failover only after confirmed booking failure', () => {
    expect(canTransitionShipment(ShipmentStatus.BOOKING_UNKNOWN, ShipmentStatus.BOOKING)).toBe(false);
    expect(canTransitionShipment(ShipmentStatus.BOOKING_FAILED, ShipmentStatus.BOOKING)).toBe(true);
  });
});
