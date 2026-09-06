import { ShipmentStatus } from '@prisma/client';

const NEXT: Record<ShipmentStatus, ShipmentStatus[]> = {
  DRAFT: [ShipmentStatus.READY, ShipmentStatus.CANCELLED],
  READY: [ShipmentStatus.BOOKING, ShipmentStatus.CANCELLED],
  BOOKING: [ShipmentStatus.BOOKED, ShipmentStatus.BOOKING_FAILED, ShipmentStatus.BOOKING_UNKNOWN],
  BOOKED: [ShipmentStatus.LABEL_CREATED, ShipmentStatus.CANCEL_REQUESTED],
  LABEL_CREATED: [ShipmentStatus.PICKUP_SCHEDULED, ShipmentStatus.PICKED_UP, ShipmentStatus.CANCEL_REQUESTED],
  PICKUP_SCHEDULED: [ShipmentStatus.PICKED_UP, ShipmentStatus.CANCEL_REQUESTED],
  PICKED_UP: [ShipmentStatus.IN_TRANSIT, ShipmentStatus.DELIVERY_FAILED],
  IN_TRANSIT: [ShipmentStatus.OUT_FOR_DELIVERY, ShipmentStatus.DELIVERY_FAILED, ShipmentStatus.LOST, ShipmentStatus.DAMAGED],
  OUT_FOR_DELIVERY: [ShipmentStatus.DELIVERED, ShipmentStatus.DELIVERY_FAILED],
  DELIVERED: [],
  BOOKING_FAILED: [ShipmentStatus.BOOKING],
  BOOKING_UNKNOWN: [ShipmentStatus.BOOKED, ShipmentStatus.BOOKING_FAILED],
  CANCEL_REQUESTED: [ShipmentStatus.CANCELLED],
  CANCELLED: [],
  DELIVERY_FAILED: [ShipmentStatus.RETURN_TO_ORIGIN, ShipmentStatus.OUT_FOR_DELIVERY],
  RETURN_TO_ORIGIN: [ShipmentStatus.RETURNED],
  RETURNED: [],
  LOST: [],
  DAMAGED: [],
  HANDOFF_PENDING: [ShipmentStatus.READY, ShipmentStatus.BOOKING],
};

export function canTransitionShipment(from: ShipmentStatus, to: ShipmentStatus): boolean {
  return from === to || (NEXT[from]?.includes(to) ?? false);
}

export function assertShipmentTransition(from: ShipmentStatus, to: ShipmentStatus): void {
  if (!canTransitionShipment(from, to)) {
    throw Object.assign(new Error(`Illegal shipment transition ${from} → ${to}`), {
      status: 409,
      code: 'ILLEGAL_SHIPMENT_TRANSITION',
    });
  }
}

export function eventForShipment(status: ShipmentStatus): string | null {
  switch (status) {
    case ShipmentStatus.BOOKING:
      return 'SHIPMENT_BOOKING_STARTED';
    case ShipmentStatus.BOOKED:
      return 'SHIPMENT_BOOKED';
    case ShipmentStatus.LABEL_CREATED:
      return 'SHIPMENT_LABEL_CREATED';
    case ShipmentStatus.PICKUP_SCHEDULED:
      return 'SHIPMENT_PICKUP_SCHEDULED';
    case ShipmentStatus.PICKED_UP:
      return 'SHIPMENT_PICKED_UP';
    case ShipmentStatus.IN_TRANSIT:
      return 'SHIPMENT_IN_TRANSIT';
    case ShipmentStatus.OUT_FOR_DELIVERY:
      return 'SHIPMENT_OUT_FOR_DELIVERY';
    case ShipmentStatus.DELIVERED:
      return 'SHIPMENT_DELIVERED';
    case ShipmentStatus.CANCELLED:
      return 'SHIPMENT_CANCELLED';
    case ShipmentStatus.DELIVERY_FAILED:
      return 'SHIPMENT_FAILED';
    case ShipmentStatus.RETURN_TO_ORIGIN:
    case ShipmentStatus.RETURNED:
      return 'SHIPMENT_RETURNED';
    case ShipmentStatus.LOST:
      return 'SHIPMENT_LOST';
    case ShipmentStatus.DAMAGED:
      return 'SHIPMENT_DAMAGED';
    default:
      return null;
  }
}
