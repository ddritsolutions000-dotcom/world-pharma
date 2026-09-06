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

  it('allows pickup through delivered', () => {
    expect(canTransitionShipment(ShipmentStatus.PICKED_UP, ShipmentStatus.IN_TRANSIT)).toBe(true);
    expect(canTransitionShipment(ShipmentStatus.IN_TRANSIT, ShipmentStatus.OUT_FOR_DELIVERY)).toBe(true);
    expect(canTransitionShipment(ShipmentStatus.OUT_FOR_DELIVERY, ShipmentStatus.DELIVERED)).toBe(true);
  });

  it('allows failed delivery retry and RTO', () => {
    expect(canTransitionShipment(ShipmentStatus.OUT_FOR_DELIVERY, ShipmentStatus.DELIVERY_FAILED)).toBe(true);
    expect(canTransitionShipment(ShipmentStatus.DELIVERY_FAILED, ShipmentStatus.OUT_FOR_DELIVERY)).toBe(true);
    expect(canTransitionShipment(ShipmentStatus.DELIVERY_FAILED, ShipmentStatus.RETURN_TO_ORIGIN)).toBe(true);
    expect(canTransitionShipment(ShipmentStatus.RETURN_TO_ORIGIN, ShipmentStatus.RETURNED)).toBe(true);
  });

  it('allows cancel from created/ready/label states and forbids cancel from in-transit', () => {
    expect(canTransitionShipment(ShipmentStatus.DRAFT, ShipmentStatus.CANCELLED)).toBe(true);
    expect(canTransitionShipment(ShipmentStatus.READY, ShipmentStatus.CANCELLED)).toBe(true);
    expect(canTransitionShipment(ShipmentStatus.LABEL_CREATED, ShipmentStatus.CANCEL_REQUESTED)).toBe(true);
    expect(canTransitionShipment(ShipmentStatus.IN_TRANSIT, ShipmentStatus.CANCELLED)).toBe(false);
    expect(() => assertShipmentTransition(ShipmentStatus.OUT_FOR_DELIVERY, ShipmentStatus.CANCELLED)).toThrow();
  });

  it('treats same-status as idempotent', () => {
    expect(canTransitionShipment(ShipmentStatus.DELIVERED, ShipmentStatus.DELIVERED)).toBe(true);
    expect(canTransitionShipment(ShipmentStatus.RETURNED, ShipmentStatus.RETURNED)).toBe(true);
  });
});
