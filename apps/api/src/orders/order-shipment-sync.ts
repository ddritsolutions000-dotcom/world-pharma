import { OrderStatus, ShipmentStatus } from '@prisma/client';
import { canTransitionOrder } from './state-machine';

/**
 * Map shipment logistics status → customer OrderStatus.
 */
export function orderStatusForShipment(shipmentStatus: ShipmentStatus): OrderStatus | null {
  switch (shipmentStatus) {
    case ShipmentStatus.PICKED_UP:
    case ShipmentStatus.IN_TRANSIT:
      return OrderStatus.SHIPPED;
    case ShipmentStatus.OUT_FOR_DELIVERY:
      return OrderStatus.OUT_FOR_DELIVERY;
    case ShipmentStatus.DELIVERED:
      return OrderStatus.DELIVERED;
    case ShipmentStatus.DELIVERY_FAILED:
    case ShipmentStatus.RETURN_TO_ORIGIN:
    case ShipmentStatus.RETURNED:
      return OrderStatus.FAILED;
    default:
      return null;
  }
}

/**
 * Returns ordered OrderStatus steps to apply from `from` toward `target`.
 * Empty when already at target or no safe path exists.
 */
export function walkOrderToward(from: OrderStatus, target: OrderStatus): OrderStatus[] {
  if (from === target) {
    return [];
  }
  if (canTransitionOrder(from, target)) {
    return [target];
  }

  const steps: OrderStatus[] = [];
  let cursor = from;
  const advance = (next: OrderStatus) => {
    if (cursor === next) {
      return true;
    }
    if (!canTransitionOrder(cursor, next)) {
      return false;
    }
    steps.push(next);
    cursor = next;
    return true;
  };

  if (target === OrderStatus.FAILED) {
    // Prefer failing from OFD/SHIPPED; if still READY_TO_SHIP move to SHIPPED first when needed.
    if (cursor === OrderStatus.READY_TO_SHIP) {
      advance(OrderStatus.SHIPPED);
    }
    if (cursor === OrderStatus.SHIPPED) {
      // FAILED is allowed from SHIPPED
      advance(OrderStatus.FAILED);
      return steps;
    }
    if (cursor === OrderStatus.OUT_FOR_DELIVERY) {
      advance(OrderStatus.FAILED);
      return steps;
    }
    return steps;
  }

  if (target === OrderStatus.SHIPPED || target === OrderStatus.OUT_FOR_DELIVERY || target === OrderStatus.DELIVERED) {
    if (cursor === OrderStatus.READY_TO_SHIP || cursor === OrderStatus.PACKED) {
      if (cursor === OrderStatus.PACKED) {
        advance(OrderStatus.READY_TO_SHIP);
      }
      advance(OrderStatus.SHIPPED);
    }
    if (
      (target === OrderStatus.OUT_FOR_DELIVERY || target === OrderStatus.DELIVERED) &&
      cursor === OrderStatus.SHIPPED
    ) {
      advance(OrderStatus.OUT_FOR_DELIVERY);
    }
    if (target === OrderStatus.DELIVERED && cursor === OrderStatus.OUT_FOR_DELIVERY) {
      advance(OrderStatus.DELIVERED);
    }
  }

  return steps;
}
