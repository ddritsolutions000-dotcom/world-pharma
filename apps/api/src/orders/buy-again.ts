const INELIGIBLE = new Set([
  'CANCELLED',
  'FAILED',
  'REFUNDED',
  'RETURNED',
  'CANCEL_REQUESTED',
  'RETURN_REQUESTED',
  'REFUND_PENDING',
]);

export type BuyAgainSourceOrder = {
  createdAt: Date;
  status: string;
  items: Array<{
    offerId: string;
    variantId: string;
    sku: string;
    title: string;
    qty: number;
    rxRequired: boolean;
  }>;
};

export type BuyAgainAggregate = {
  offer_id: string;
  variant_id: string;
  sku: string;
  title: string;
  times_ordered: number;
  last_qty: number;
  last_ordered_at: string;
  rx_required: boolean;
};

export function aggregateBuyAgain(orders: BuyAgainSourceOrder[]): BuyAgainAggregate[] {
  const map = new Map<string, BuyAgainAggregate>();
  for (const order of orders) {
    if (INELIGIBLE.has(order.status)) {
      continue;
    }
    for (const item of order.items) {
      const existing = map.get(item.offerId);
      const stamped = order.createdAt.toISOString();
      if (!existing) {
        map.set(item.offerId, {
          offer_id: item.offerId,
          variant_id: item.variantId,
          sku: item.sku,
          title: item.title,
          times_ordered: 1,
          last_qty: item.qty,
          last_ordered_at: stamped,
          rx_required: item.rxRequired,
        });
        continue;
      }
      existing.times_ordered += 1;
      if (stamped > existing.last_ordered_at) {
        existing.last_ordered_at = stamped;
        existing.last_qty = item.qty;
        existing.title = item.title;
        existing.rx_required = item.rxRequired;
      }
    }
  }
  return [...map.values()].sort((a, b) => b.last_ordered_at.localeCompare(a.last_ordered_at));
}
