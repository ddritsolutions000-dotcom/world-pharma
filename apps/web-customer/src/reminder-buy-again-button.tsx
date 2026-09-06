'use client';

import { useEffect, useState } from 'react';
import { LoadingState, Text } from '@world-pharma/ui-kit/web';
import { addCartItem, notifyCartChanged } from './commerce-api';
import { fetchReminderBuyAgain, type ReminderBuyAgain } from './medication-reminder-api';
import { MgBtn } from './ui/mg-ui';

export function ReminderBuyAgainButton({
  token,
  countryCode,
  reminderId,
  disabled,
}: {
  token: string;
  countryCode: string;
  reminderId: string;
  disabled?: boolean;
}) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [buyAgain, setBuyAgain] = useState<ReminderBuyAgain | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    void fetchReminderBuyAgain(token, reminderId, countryCode)
      .then(setBuyAgain)
      .catch(() => setBuyAgain(null))
      .finally(() => setLoading(false));
  }, [token, countryCode, reminderId]);

  if (loading) {
    return <LoadingState label="Checking buy again" />;
  }
  if (!buyAgain) {
    return null;
  }

  async function addToCart() {
    if (!buyAgain?.eligible || !buyAgain.offer_id) return;
    setBusy(true);
    setMessage(null);
    try {
      await addCartItem(
        token,
        countryCode,
        buyAgain.offer_id,
        buyAgain.qty ?? 1,
        `reminder-buy-${reminderId}-${Date.now()}`,
      );
      notifyCartChanged();
      window.location.href = '/cart';
    } catch (err) {
      setMessage((err as { message?: string }).message ?? 'Could not add to cart.');
    } finally {
      setBusy(false);
    }
  }

  if (buyAgain.eligible) {
    return (
      <div>
        <MgBtn size="sm" disabled={disabled || busy} onClick={() => void addToCart()}>
          {busy ? 'Adding…' : 'Buy again'}
        </MgBtn>
        {buyAgain.rx_required ? (
          <Text tone="secondary">Prescription required at checkout</Text>
        ) : null}
        {message ? <Text tone="secondary">{message}</Text> : null}
      </div>
    );
  }

  return (
    <Text tone="secondary">{buyAgain.reason ?? 'Buy again unavailable for this reminder.'}</Text>
  );
}
