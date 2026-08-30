import { OrderStatus } from '@prisma/client';

const NEXT: Record<OrderStatus, OrderStatus[]> = {
  CONFIRMED: [OrderStatus.ALLOCATED, OrderStatus.ON_HOLD, OrderStatus.CANCEL_REQUESTED, OrderStatus.CANCELLED, OrderStatus.FAILED, OrderStatus.REFUND_PENDING],
  ON_HOLD: [OrderStatus.CONFIRMED, OrderStatus.ALLOCATED, OrderStatus.CANCELLED, OrderStatus.FAILED],
  ALLOCATED: [OrderStatus.PICKING, OrderStatus.ON_HOLD, OrderStatus.CANCEL_REQUESTED, OrderStatus.CANCELLED],
  PICKING: [OrderStatus.PICKED, OrderStatus.ON_HOLD, OrderStatus.CANCEL_REQUESTED],
  PICKED: [OrderStatus.PACKING, OrderStatus.ON_HOLD],
  PACKING: [OrderStatus.PACKED, OrderStatus.ON_HOLD],
  PACKED: [OrderStatus.READY_TO_SHIP],
  READY_TO_SHIP: [OrderStatus.SHIPPED, OrderStatus.CANCEL_REQUESTED],
  SHIPPED: [OrderStatus.OUT_FOR_DELIVERY, OrderStatus.DELIVERED, OrderStatus.RETURN_REQUESTED, OrderStatus.FAILED],
  OUT_FOR_DELIVERY: [OrderStatus.DELIVERED, OrderStatus.RETURN_REQUESTED, OrderStatus.FAILED],
  DELIVERED: [OrderStatus.RETURN_REQUESTED, OrderStatus.REFUND_PENDING],
  CANCEL_REQUESTED: [OrderStatus.CANCELLED],
  CANCELLED: [OrderStatus.REFUND_PENDING, OrderStatus.REFUNDED],
  RETURN_REQUESTED: [OrderStatus.RETURNED],
  RETURNED: [OrderStatus.REFUND_PENDING],
  REFUND_PENDING: [OrderStatus.REFUNDED, OrderStatus.PARTIALLY_REFUNDED, OrderStatus.CONFIRMED],
  REFUNDED: [],
  PARTIALLY_REFUNDED: [OrderStatus.REFUNDED, OrderStatus.REFUND_PENDING],
  FAILED: [OrderStatus.REFUND_PENDING, OrderStatus.CANCELLED],
};

export function canTransitionOrder(from: OrderStatus, to: OrderStatus): boolean {
  return from === to || (NEXT[from]?.includes(to) ?? false);
}

export function assertOrderTransition(from: OrderStatus, to: OrderStatus): void {
  if (!canTransitionOrder(from, to)) {
    throw Object.assign(new Error(`Illegal order transition ${from} → ${to}`), {
      status: 409,
      code: 'ILLEGAL_ORDER_TRANSITION',
    });
  }
}

/** Order outbox events registered in NotificationDispatchService TITLE_BY_EVENT for buyers. */
export const BUYER_ORDER_NOTIFICATION_EVENTS = new Set([
  'ORDER_CONFIRMED',
  'ORDER_READY_FOR_SHIPMENT',
  'ORDER_CANCELLED',
]);

export function eventForStatus(status: OrderStatus): string | null {
  switch (status) {
    case OrderStatus.CONFIRMED:
      return 'ORDER_CONFIRMED';
    case OrderStatus.ON_HOLD:
      return 'ORDER_ON_HOLD';
    case OrderStatus.ALLOCATED:
      return 'ORDER_ALLOCATED';
    case OrderStatus.PICKING:
      return 'ORDER_PICKING';
    case OrderStatus.PICKED:
      return 'ORDER_PICKED';
    case OrderStatus.PACKING:
      return 'ORDER_PACKING';
    case OrderStatus.PACKED:
      return 'ORDER_PACKED';
    case OrderStatus.READY_TO_SHIP:
      return 'ORDER_READY_FOR_SHIPMENT';
    case OrderStatus.CANCELLED:
      return 'ORDER_CANCELLED';
    case OrderStatus.RETURN_REQUESTED:
      return 'ORDER_RETURN_REQUESTED';
    case OrderStatus.RETURNED:
      return 'ORDER_RETURNED';
    case OrderStatus.REFUND_PENDING:
      return 'ORDER_REFUND_PENDING';
    case OrderStatus.REFUNDED:
    case OrderStatus.PARTIALLY_REFUNDED:
      return 'ORDER_REFUNDED';
    default:
      return null;
  }
}
