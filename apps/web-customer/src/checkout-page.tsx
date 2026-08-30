'use client';

import { useCallback, useEffect, useState } from 'react';
import { useCountries, useSession } from '@world-pharma/shell-web';
import {
  Button,
  Card,
  EmptyState,
  FormField,
  Heading,
  Input,
  LoadingState,
  NetworkErrorState,
  PermissionDeniedState,
  SessionExpiredState,
  Text,
} from '@world-pharma/ui-kit/web';
import {
  applyCheckoutPromo,
  fetchPaymentIntent,
  payCheckout,
  quoteCheckout,
  removeCheckoutPromo,
  startCheckout,
  type CheckoutSession,
} from './commerce-api';
import { RxHandoffBanner } from './rx-handoff-ui';

export function CheckoutScreen() {
  const { session, getAccessToken, signOut, expire } = useSession();
  const { countries } = useCountries();
  const country = countries[0]?.iso_alpha2 ?? 'XX';
  const [quote, setQuote] = useState<CheckoutSession | null>(null);
  const [payMessage, setPayMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<'network' | 'forbidden' | 'stale' | null>(null);
  const [intent, setIntent] = useState<{ status?: string; next_action?: { url?: string }; sandbox?: boolean } | null>(null);
  const [promoCode, setPromoCode] = useState('');
  const [promoMessage, setPromoMessage] = useState<string | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);

  const load = useCallback(() => {
    const token = getAccessToken();
    if (!token || session.status !== 'authenticated') {
      return;
    }
    setLoading(true);
    void startCheckout(token, country, `ui-co-${Date.now()}`)
      .then((body) => {
        setQuote(body as CheckoutSession);
        setError(null);
      })
      .catch((err: { message?: string; code?: string; status?: number }) => {
        if (err.status === 403) {
          setError('forbidden');
        } else if (err.status === 401) {
          expire();
        } else if (err.code === 'QUOTE_STALE' || err.code === 'PRICE_CHANGED') {
          setError('stale');
        } else {
          setError('network');
        }
      })
      .finally(() => setLoading(false));
  }, [country, expire, getAccessToken, session.status]);

  useEffect(() => {
    load();
  }, [load]);

  if (session.status === 'expired') {
    return <SessionExpiredState action={{ label: 'Sign in again', onClick: () => signOut() }} />;
  }

  if (session.status !== 'authenticated') {
    return <EmptyState title="Sign in required" description="Sign in to checkout." />;
  }

  if (session.audience !== 'customer') {
    return <PermissionDeniedState />;
  }

  if (loading) {
    return <LoadingState label="Loading checkout" />;
  }

  if (error === 'forbidden') {
    return <PermissionDeniedState />;
  }

  if (error === 'stale') {
    return (
      <EmptyState
        title="Quote is stale"
        description="Refresh checkout to get an updated quote."
        action={{ label: 'Refresh', onClick: load }}
      />
    );
  }

  if (error === 'network') {
    return <NetworkErrorState action={{ label: 'Retry', onClick: load }} />;
  }

  if (!quote) {
    return <EmptyState title="Checkout unavailable" description="Could not start a checkout session." />;
  }

  async function tryPay(scenario: string) {
    const token = getAccessToken();
    if (!token || !quote?.id) {
      return;
    }
    try {
      const paid = (await payCheckout(token, quote.id, `ui-pay-${Date.now()}`, 'CARD', scenario)) as {
        id: string;
        status: string;
        next_action?: { url?: string };
        sandbox?: boolean;
        message?: string;
      };
      setIntent(paid);
      setPayMessage(`${paid.message ?? paid.status} (sandbox)`);
      if (paid.next_action?.url) {
        const confirmed = (await fetchPaymentIntent(token, paid.id)) as typeof paid;
        setIntent(confirmed);
      }
    } catch (err) {
      setPayMessage((err as { message?: string }).message ?? 'Sandbox payment did not complete.');
    }
  }

  async function tryApplyPromo() {
    const token = getAccessToken();
    if (!token || !quote?.id || !promoCode.trim()) {
      return;
    }
    setPromoError(null);
    setPromoMessage(null);
    try {
      await applyCheckoutPromo(token, quote.id, promoCode.trim());
      const quoted = (await quoteCheckout(token, quote.id, `ui-quote-${Date.now()}`)) as CheckoutSession;
      setQuote(quoted);
      const discount = quoted.quote?.discount_minor ?? quoted.quote?.promo?.discount_minor;
      if (discount && discount !== '0') {
        setPromoMessage(`Promo applied. Discount ${quoted.quote?.currency ?? ''} ${discount}`);
      } else {
        setPromoMessage('Promo applied.');
      }
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === 'PROMO_INVALID') {
        setPromoError('This promo code is not valid for your cart.');
      } else if (code === 'QUOTE_STALE') {
        setPromoError('This promo has expired.');
      } else {
        setPromoError((err as { message?: string }).message ?? 'Could not apply promo.');
      }
    }
  }

  async function tryRemovePromo() {
    const token = getAccessToken();
    if (!token || !quote?.id) {
      return;
    }
    setPromoError(null);
    setPromoMessage(null);
    try {
      await removeCheckoutPromo(token, quote.id);
      const quoted = (await quoteCheckout(token, quote.id, `ui-quote-rm-${Date.now()}`)) as CheckoutSession;
      setQuote(quoted);
      setPromoCode('');
      setPromoMessage('Promo removed.');
    } catch (err) {
      setPromoError((err as { message?: string }).message ?? 'Could not remove promo.');
    }
  }

  return (
    <section>
      <Heading level={1}>Checkout</Heading>
      <Text tone="secondary">SANDBOX payment only. Redirect is not success. A captured payment may create a sandbox order.</Text>
      <RxHandoffBanner
        skipInventoryHold={quote.skip_inventory_hold}
        dispensingCaseId={quote.dispensing_case_id}
      />
      <Card>
        <Text>Status {quote.status}</Text>
        <Text>
          Total {quote.quote?.currency} {quote.quote?.total_minor ?? '—'}
        </Text>
        {quote.quote?.discount_minor && quote.quote.discount_minor !== '0' ? (
          <Text size="caption">
            Discount {quote.quote.currency} {quote.quote.discount_minor}
          </Text>
        ) : null}
        <Text size="caption">Shipping: {quote.quote?.shipping_status ?? 'UNAVAILABLE'}</Text>
        <Text size="caption">Tax: {quote.quote?.tax_status ?? 'UNKNOWN'}</Text>
        <Text size="caption">Quote expires {quote.quote?.expires_at ?? '—'}</Text>
      </Card>
      <Card>
        <Heading level={2}>Promo code</Heading>
        <FormField label="Code">
          {({ id }) => (
            <Input id={id} value={promoCode} onChange={(e) => setPromoCode(e.target.value.toUpperCase())} />
          )}
        </FormField>
        <Button onClick={() => void tryApplyPromo()}>Apply promo</Button>
        <Button onClick={() => void tryRemovePromo()}>Remove promo</Button>
        {promoMessage ? <Text tone="secondary">{promoMessage}</Text> : null}
        {promoError ? <Text tone="secondary">{promoError}</Text> : null}
      </Card>
      <Button onClick={() => void tryPay('success')}>Pay (sandbox success)</Button>
      <Button onClick={() => void tryPay('failure')}>Simulate failure</Button>
      <Button onClick={() => void tryPay('timeout')}>Simulate unknown</Button>
      {intent ? <Text>Intent {intent.status} {intent.sandbox ? '(test mode)' : ''}</Text> : null}
      <Text>{payMessage ?? quote.payment_message ?? 'Country policy must enable sandbox payments.'}</Text>
    </section>
  );
}
