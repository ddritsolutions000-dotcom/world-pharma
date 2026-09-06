/** Customer-facing after-sales eligibility hints — server remains authoritative. */
export function canRequestReturn(status: string): boolean {
  return status === 'DELIVERED';
}

export function canRequestRefund(status: string): boolean {
  if (status === 'REFUNDED' || status === 'REFUND_PENDING' || status === 'PARTIALLY_REFUNDED') {
    return false;
  }
  return (
    status === 'DELIVERED' ||
    status === 'RETURN_REQUESTED' ||
    status === 'RETURNED' ||
    status === 'CANCELLED' ||
    status === 'CANCEL_REQUESTED'
  );
}

/** Post-delivery product reviews — server still enforces verified purchase. */
export function canReviewOrder(status: string): boolean {
  return status === 'DELIVERED';
}

export function returnReasonLabel(reason: string): string {
  const labels: Record<string, string> = {
    WRONG_ITEM: 'Wrong item received',
    DAMAGED: 'Damaged or defective',
    DELIVERY_FAILURE: 'Delivery failed',
    CUSTOMER_REFUSAL: 'Refused at delivery',
    OTHER_POLICY_ALLOWED: 'Other (policy allows)',
  };
  return labels[reason] ?? reason.replaceAll('_', ' ').toLowerCase();
}

export const RETURN_REASON_OPTIONS = [
  { value: 'WRONG_ITEM' as const, label: 'Wrong item received' },
  { value: 'DAMAGED' as const, label: 'Damaged or defective' },
  { value: 'DELIVERY_FAILURE' as const, label: 'Delivery failed' },
  { value: 'CUSTOMER_REFUSAL' as const, label: 'Refused at delivery' },
  { value: 'OTHER_POLICY_ALLOWED' as const, label: 'Other (policy allows)' },
];
