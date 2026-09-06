'use client';

import { useCallback, useEffect, useState } from 'react';
import { LoadingState, Text } from '@world-pharma/ui-kit/web';

import {
  cancelRxSubscription,
  enableRxSubscription,
  fetchRxSubscription,
  pauseRxSubscription,
  type RxSubscriptionView,
} from './care-api';
import {
  canCancelSubscription,
  canEnableSubscription,
  canPauseSubscription,
  formatNextReminderDate,
  rxSubscriptionStatusLabel,
  subscriptionModeLabel,
  subscriptionSummaryLine,
} from './refill-subscription-ui';
import { MgBtn } from './ui/mg-ui';

type RxSubscriptionPanelProps = {
  prescriptionId: string;
  token: string;
  onUnauthorized: () => void;
  compact?: boolean;
};

export function RxSubscriptionPanel({
  prescriptionId,
  token,
  onUnauthorized,
  compact = false,
}: RxSubscriptionPanelProps) {
  const [subscription, setSubscription] = useState<RxSubscriptionView | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSubscription(await fetchRxSubscription(token, prescriptionId));
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      if (status === 401) {
        onUnauthorized();
        return;
      }
      setSubscription(null);
      setError((err as { message?: string }).message ?? 'Could not load subscription.');
    } finally {
      setLoading(false);
    }
  }, [onUnauthorized, prescriptionId, token]);

  useEffect(() => {
    void load();
  }, [load]);

  const mutate = useCallback(
    async (action: 'enable' | 'pause' | 'cancel') => {
      setBusy(true);
      setError(null);
      try {
        const fn =
          action === 'enable'
            ? enableRxSubscription
            : action === 'pause'
              ? pauseRxSubscription
              : cancelRxSubscription;
        setSubscription(await fn(token, prescriptionId));
      } catch (err: unknown) {
        const status = (err as { status?: number }).status;
        if (status === 401) {
          onUnauthorized();
          return;
        }
        setError((err as { message?: string }).message ?? 'Could not update subscription.');
      } finally {
        setBusy(false);
      }
    },
    [onUnauthorized, prescriptionId, token],
  );

  if (loading) {
    return <LoadingState label="Loading refill reminders" />;
  }

  if (!subscription) {
    return error ? <Text tone="secondary">{error}</Text> : null;
  }

  const nextReminder = formatNextReminderDate(subscription.next_attempt_at);

  return (
    <div className={`mg-subscription-panel${compact ? ' is-compact' : ''}`}>
      <div className="mg-subscription-head">
        <span className={`mg-subscription-badge is-${subscription.status.toLowerCase()}`}>
          {rxSubscriptionStatusLabel(subscription.status)}
        </span>
        <span className="mg-subscription-mode">{subscriptionModeLabel(subscription)}</span>
      </div>
      <p className="mg-subscription-copy">{subscriptionSummaryLine(subscription)}</p>
      {nextReminder && subscription.status === 'ACTIVE' ? (
        <p className="mg-list-meta">Estimated next reminder: {nextReminder}</p>
      ) : null}
      <p className="mg-subscription-safety">
        Automatic payment and pharmacy dispense stay <strong>off</strong> in sandbox — you approve each refill.
      </p>
      {error ? <Text tone="secondary">{error}</Text> : null}
      <div className="mg-toolbar">
        {!busy && canEnableSubscription(subscription) ? (
          <MgBtn size="sm" onClick={() => void mutate('enable')}>
            Turn on reminders
          </MgBtn>
        ) : null}
        {!busy && canPauseSubscription(subscription) ? (
          <MgBtn size="sm" variant="secondary" onClick={() => void mutate('pause')}>
            Pause reminders
          </MgBtn>
        ) : null}
        {!busy && canCancelSubscription(subscription) ? (
          <MgBtn size="sm" variant="ghost" onClick={() => void mutate('cancel')}>
            Cancel subscription
          </MgBtn>
        ) : null}
      </div>
    </div>
  );
}
