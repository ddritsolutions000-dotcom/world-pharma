import {
  activeSubscriptions,
  canEnableSubscription,
  canPauseSubscription,
  formatNextReminderDate,
  openRefillRequests,
  rxSubscriptionStatusLabel,
  subscriptionModeLabel,
  subscriptionSummaryLine,
} from './refill-subscription-ui';
import type { RefillRequest, RxSubscriptionView } from './care-api';

const baseSub = (overrides: Partial<RxSubscriptionView> = {}): RxSubscriptionView => ({
  available: true,
  status: 'DISABLED',
  auto_execute_enabled: false,
  pack_subscription_enabled: true,
  pack_auto_execute_enabled: false,
  ...overrides,
});

describe('refill-subscription-ui', () => {
  it('labels subscription statuses for customers', () => {
    expect(rxSubscriptionStatusLabel('ACTIVE')).toBe('Reminders on');
    expect(rxSubscriptionStatusLabel('PAUSED')).toBe('Paused');
  });

  it('detects enable/pause actions', () => {
    expect(canEnableSubscription(baseSub({ status: 'DISABLED' }))).toBe(true);
    expect(canEnableSubscription(baseSub({ status: 'ACTIVE' }))).toBe(false);
    expect(canPauseSubscription(baseSub({ status: 'ACTIVE' }))).toBe(true);
    expect(canEnableSubscription(baseSub({ pack_subscription_enabled: false }))).toBe(false);
  });

  it('describes reminder mode copy', () => {
    expect(subscriptionModeLabel(baseSub({ status: 'ACTIVE' }))).toBe('Refill reminders');
    expect(
      subscriptionSummaryLine(
        baseSub({ status: 'ACTIVE', next_attempt_at: '2026-09-15T00:00:00.000Z' }),
      ),
    ).toContain('Next reminder');
  });

  it('formats reminder dates', () => {
    expect(formatNextReminderDate('2026-09-15T00:00:00.000Z')).toMatch(/2026/);
    expect(formatNextReminderDate(null)).toBeNull();
  });

  it('filters open refill requests and active subscriptions', () => {
    const requests: RefillRequest[] = [
      {
        id: '1',
        prescription_id: 'rx',
        prescription_version_id: 'v',
        status: 'PENDING_REAUTH',
        created_at: '2026-01-01T00:00:00.000Z',
      },
      {
        id: '2',
        prescription_id: 'rx',
        prescription_version_id: 'v',
        status: 'COMPLETED',
        created_at: '2026-01-02T00:00:00.000Z',
      },
    ];
    expect(openRefillRequests(requests)).toHaveLength(1);
    expect(activeSubscriptions([{ status: 'ACTIVE' }, { status: 'DISABLED' }])).toHaveLength(1);
  });
});
