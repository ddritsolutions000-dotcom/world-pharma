export function orderTrackIndex(status: string): number {
  if (status === 'DELIVERED') return 5;
  if (status === 'OUT_FOR_DELIVERY' || status === 'SHIPPED') return 4;
  if (status === 'READY_TO_SHIP' || status === 'PACKED') return 3;
  if (status === 'PICKING' || status === 'PICKED' || status === 'PACKING') return 2;
  if (status === 'ALLOCATED') return 1;
  if (status === 'CANCELLED' || status === 'CANCEL_REQUESTED' || status === 'FAILED') return -1;
  return 0;
}

export function formatOrderMoney(order: { currency?: string | null; total_minor?: string | null }): string {
  const currency = order.currency?.trim() || '—';
  const total = order.total_minor?.trim() || '0';
  return `${currency} ${total}`;
}

export function formatPodCaption(pod: {
  delivered?: boolean;
  otp_recorded?: boolean;
  photo_attached?: boolean;
  signature_attached?: boolean;
} | null | undefined): string | null {
  if (!pod?.delivered) {
    return null;
  }
  return `POD · OTP ${pod.otp_recorded ? 'yes' : 'no'}${pod.photo_attached ? ' · photo' : ''}${
    pod.signature_attached ? ' · signature' : ''
  } · sandbox`;
}

export function formatReturnCaption(row: {
  status?: string | null;
  reason?: string | null;
}): string {
  return `${row.status ?? 'REQUESTED'} · ${row.reason ?? 'Return requested'}`;
}
