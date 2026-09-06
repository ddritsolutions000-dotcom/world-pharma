export function storeOrderStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    CONFIRMED: 'Confirmed',
    ALLOCATED: 'Allocated',
    PICKING: 'Picking',
    PICKED: 'Picked',
    PACKING: 'Packing',
    PACKED: 'Packed',
    READY_TO_SHIP: 'Ready to ship',
    SHIPPED: 'Shipped',
    DELIVERED: 'Delivered',
    CANCELLED: 'Cancelled',
    ON_HOLD: 'On hold',
  };
  return labels[status] ?? status.replaceAll('_', ' ').toLowerCase();
}

export function storeOrderNextAction(status: string): 'pick/start' | 'pick/complete' | 'pack/complete' | 'ready' | null {
  if (status === 'CONFIRMED' || status === 'ALLOCATED') {
    return 'pick/start';
  }
  if (status === 'PICKING') {
    return 'pick/complete';
  }
  if (status === 'PICKED' || status === 'PACKING') {
    return 'pack/complete';
  }
  if (status === 'PACKED') {
    return 'ready';
  }
  return null;
}

export function dispensingStatusLabel(status: string): string {
  return status.replaceAll('_', ' ').toLowerCase();
}
