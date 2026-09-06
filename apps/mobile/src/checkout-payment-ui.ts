export function checkoutPayButtonLabel(method: string, hasAddress: boolean, totalLabel?: string): string {
  if (!hasAddress) {
    return 'Select a delivery address';
  }
  switch (method) {
    case 'COD':
      return totalLabel ? `Place order · ${totalLabel} on delivery` : 'Place order (pay on delivery)';
    case 'MOBILE_PAYMENT':
      return 'Pay with UPI';
    case 'WALLET':
      return 'Pay with Apple Pay / Google Pay';
    case 'CARD':
      return 'Pay with card';
    default:
      return 'Pay securely';
  }
}

export function checkoutSuccessCopy(method: string): { title: string; description: string } {
  if (method === 'COD') {
    return {
      title: 'Order placed successfully',
      description: 'Pay in cash when your order is delivered.',
    };
  }
  if (method === 'MOBILE_PAYMENT') {
    return {
      title: 'Payment successful',
      description: 'Your UPI payment was confirmed and your order is being processed.',
    };
  }
  if (method === 'WALLET') {
    return {
      title: 'Payment successful',
      description: 'Your wallet payment was confirmed and your order is being processed.',
    };
  }
  return {
    title: 'Order placed successfully',
    description: 'Your payment was accepted and your order is being processed.',
  };
}

export function paymentMethodHint(method: string, country: string): string | null {
  const code = country.toUpperCase();
  if (code === 'IN') {
    if (method === 'COD') {
      return 'Pay the delivery partner in cash when your medicines arrive.';
    }
    if (method === 'MOBILE_PAYMENT') {
      return 'Complete payment in PhonePe, Google Pay, or Paytm.';
    }
  }
  if (code === 'US' && method === 'WALLET') {
    return 'Complete payment with Apple Pay or Google Pay on this device.';
  }
  if (code === 'AE' && method === 'COD') {
    return 'Pay the delivery partner in cash when your order arrives.';
  }
  return null;
}

export function isCheckoutPaymentComplete(status: string | undefined): boolean {
  const normalized = (status ?? '').toUpperCase();
  return (
    normalized === 'SUCCEEDED' ||
    normalized === 'PAID' ||
    normalized === 'CAPTURED' ||
    normalized === 'AUTHORIZED' ||
    normalized === 'AUTHORIZED_COD'
  );
}

export type UpiCollectNextAction = {
  type: 'upi_collect';
  vpa?: string;
  sandbox?: boolean;
};

export function isUpiCollectPending(
  intent: { status?: string; next_action?: { type?: string } } | null | undefined,
  method: string,
): boolean {
  return (
    method === 'MOBILE_PAYMENT' &&
    (intent?.status ?? '').toUpperCase() === 'REQUIRES_ACTION' &&
    intent?.next_action?.type === 'upi_collect'
  );
}

export function upiCollectVpa(nextAction: UpiCollectNextAction | undefined | null): string {
  return nextAction?.vpa?.trim() || 'worldpharma@upi';
}
