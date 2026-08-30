export const CRM_CART_ABANDON_RECOVERY_EVENT = 'CRM_CART_ABANDON_RECOVERY' as const;

export function cartAbandonRecoveryOccurrenceKey(checkoutSessionId: string): string {
  return `cart_abandon_recovery:${checkoutSessionId.trim()}`;
}
