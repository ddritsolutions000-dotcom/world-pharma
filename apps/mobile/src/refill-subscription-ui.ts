import type { RefillRequest, RxSubscriptionView } from './care-api';

export function rxSubscriptionStatusLabel(status: string | undefined): string {
  const labels: Record<string, string> = {
    DISABLED: 'Off',
    ACTIVE: 'Reminders on',
    PAUSED: 'Paused',
    CANCELLED: 'Cancelled',
    EXPIRED_BLOCKED: 'Blocked',
    PAYMENT_FAILED: 'Payment issue',
  };
  return labels[status ?? ''] ?? (status ? status.replace(/_/g, ' ') : 'Off');
}

export function refillRequestStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    REQUESTED: 'Requested',
    PENDING_REAUTH: 'Awaiting doctor',
    APPROVED: 'Approved',
    QUEUED_FOR_DISPENSE: 'Pharmacy queued',
    REJECTED: 'Rejected',
    CANCELLED: 'Cancelled',
    COMPLETED: 'Completed',
  };
  return labels[status] ?? status.replace(/_/g, ' ');
}

export function subscriptionModeLabel(subscription: RxSubscriptionView | null | undefined): string {
  if (!subscription?.pack_subscription_enabled) {
    return 'Unavailable in your region';
  }
  if (subscription.status === 'ACTIVE') {
    return 'Refill reminders';
  }
  if (subscription.status === 'PAUSED') {
    return 'Paused reminders';
  }
  return 'Manual refill only';
}

export function canEnableSubscription(subscription: RxSubscriptionView | null | undefined): boolean {
  if (!subscription?.pack_subscription_enabled) {
    return false;
  }
  return subscription.status === 'DISABLED' || subscription.status === 'PAUSED' || subscription.status === 'CANCELLED';
}

export function canPauseSubscription(subscription: RxSubscriptionView | null | undefined): boolean {
  return subscription?.pack_subscription_enabled === true && subscription.status === 'ACTIVE';
}

export function canCancelSubscription(subscription: RxSubscriptionView | null | undefined): boolean {
  if (!subscription?.pack_subscription_enabled) {
    return false;
  }
  return subscription.status === 'ACTIVE' || subscription.status === 'PAUSED';
}

export function formatNextReminderDate(iso: string | null | undefined): string | null {
  if (!iso) {
    return null;
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function subscriptionSummaryLine(subscription: RxSubscriptionView | null | undefined): string {
  if (!subscription?.pack_subscription_enabled) {
    return 'Medicine subscriptions are not enabled for your country.';
  }
  const next = formatNextReminderDate(subscription.next_attempt_at);
  if (subscription.status === 'ACTIVE' && next) {
    return `Next reminder around ${next}. Auto-payment and auto-dispense stay off.`;
  }
  if (subscription.status === 'PAUSED') {
    return 'Reminders paused — turn them back on anytime.';
  }
  return subscription.message ?? 'Get reminded when it is time to reorder. You approve each refill.';
}

export function openRefillRequests(requests: RefillRequest[]): RefillRequest[] {
  const open = new Set(['REQUESTED', 'PENDING_REAUTH', 'APPROVED', 'QUEUED_FOR_DISPENSE']);
  return requests.filter((row) => open.has(row.status));
}

export function activeSubscriptions<T extends { status: string }>(rows: T[]): T[] {
  return rows.filter((row) => row.status === 'ACTIVE' || row.status === 'PAUSED');
}
