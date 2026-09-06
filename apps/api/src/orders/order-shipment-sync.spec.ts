import { OrderStatus, ShipmentStatus } from '@prisma/client';
import { orderStatusForShipment, walkOrderToward } from './order-shipment-sync';

describe('order-shipment-sync', () => {
  it('maps shipment statuses to order statuses', () => {
    expect(orderStatusForShipment(ShipmentStatus.IN_TRANSIT)).toBe(OrderStatus.SHIPPED);
    expect(orderStatusForShipment(ShipmentStatus.OUT_FOR_DELIVERY)).toBe(OrderStatus.OUT_FOR_DELIVERY);
    expect(orderStatusForShipment(ShipmentStatus.DELIVERED)).toBe(OrderStatus.DELIVERED);
    expect(orderStatusForShipment(ShipmentStatus.DELIVERY_FAILED)).toBe(OrderStatus.FAILED);
    expect(orderStatusForShipment(ShipmentStatus.BOOKED)).toBeNull();
  });

  it('walks READY_TO_SHIP → DELIVERED through intermediate statuses', () => {
    expect(walkOrderToward(OrderStatus.READY_TO_SHIP, OrderStatus.DELIVERED)).toEqual([
      OrderStatus.SHIPPED,
      OrderStatus.OUT_FOR_DELIVERY,
      OrderStatus.DELIVERED,
    ]);
  });

  it('is idempotent when already at target', () => {
    expect(walkOrderToward(OrderStatus.DELIVERED, OrderStatus.DELIVERED)).toEqual([]);
  });

  it('walks SHIPPED → FAILED directly when allowed', () => {
    expect(walkOrderToward(OrderStatus.SHIPPED, OrderStatus.FAILED)).toEqual([OrderStatus.FAILED]);
  });
});
