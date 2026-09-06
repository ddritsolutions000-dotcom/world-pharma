'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from '@world-pharma/shell-web';
import {
  EmptyState,
  FormField,
  Input,
  LoadingState,
  NetworkErrorState,
  PermissionDeniedState,
  SessionExpiredState,
  Text,
} from '@world-pharma/ui-kit/web';
import { createAddress, fetchAddresses, type CustomerAddress } from './account-api';
import { fetchFamilyMembers } from './family-api';
import { matchAddressForMember, relationshipLabel, type FamilyMember } from './family-member-ui';
import { mergeGuestCartForCountry } from './guest-cart-merge';
import { readGuestCart } from './guest-cart';
import { fetchLoyaltyBalance } from './loyalty-api';
import {
  applyCheckoutPromo,
  attachCheckoutAddress,
  completeUpiPayment,
  createOrderFromPayment,
  fetchPaymentIntent,
  fetchPaymentMethods,
  notifyCartChanged,
  payCheckout,
  quoteCheckout,
  removeCheckoutPromo,
  startCheckout,
  type CheckoutSession,
} from './commerce-api';
import { fetchAvailablePromos, type CustomerPromoHint } from './recently-viewed-api';
import { RxHandoffBanner } from './rx-handoff-ui';
import { CheckoutPriceBreakdown } from './checkout-price-breakdown';
import { showDevTools } from '@world-pharma/shell-web';
import { formatMoney } from './format-money';
import { useSelectedCountry } from './use-selected-country';
import {
  checkoutPayButtonLabel,
  checkoutSuccessCopy,
  isCheckoutPaymentComplete,
  isUpiCollectPending,
  paymentMethodHint,
  type UpiCollectNextAction,
} from './checkout-payment-ui';
import { MarketplaceServiceabilityNote } from './marketplace-serviceability-note';
import { UpiCollectPanel } from './upi-collect-panel';
import { MgBtn, MgCard, Page, ServiceHero } from './ui/mg-ui';

function addressLabel(row: CustomerAddress): string {
  const name = row.recipient_name ?? row.recipientName ?? 'Recipient';
  const postal = row.postal_code ?? row.postalCode;
  return `${name} — ${row.line1}, ${row.city}${postal ? ` ${postal}` : ''}`;
}

function addressCountryCode(row: CustomerAddress): string {
  return String(row.country_code ?? row.countryCode ?? '').trim().toUpperCase();
}

function addressFingerprint(row: CustomerAddress): string {
  return [
    addressCountryCode(row),
    (row.recipient_name ?? row.recipientName ?? '').trim().toLowerCase(),
    row.line1.trim().toLowerCase(),
    row.city.trim().toLowerCase(),
    String(row.postal_code ?? row.postalCode ?? '').trim().toLowerCase(),
  ].join('|');
}

/** Collapse identical seeded/test addresses so checkout is not a wall of duplicates. */
function dedupeAddresses(addresses: CustomerAddress[]): CustomerAddress[] {
  const seen = new Set<string>();
  const out: CustomerAddress[] = [];
  for (const row of addresses) {
    const key = addressFingerprint(row);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

function pickCheckoutAddress(addresses: CustomerAddress[], market: string): CustomerAddress | undefined {
  const code = market.trim().toUpperCase();
  const matching = addresses.filter((row) => {
    const rowCountry = addressCountryCode(row);
    return !rowCountry || rowCountry === code;
  });
  const pool = matching.length ? matching : addresses;
  return pool.find((row) => row.is_default || row.isDefault) ?? pool[0];
}

export function CheckoutScreen() {
  const { session, getAccessToken, signOut, expire } = useSession();
  const { country, needsSelection, ready } = useSelectedCountry();
  const [quote, setQuote] = useState<CheckoutSession | null>(null);
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
  const [orderingForId, setOrderingForId] = useState<string>('self');
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [addressBusy, setAddressBusy] = useState(false);
  const [payMessage, setPayMessage] = useState<string | null>(null);
  const [paymentComplete, setPaymentComplete] = useState(false);
  const [placedOrderNumber, setPlacedOrderNumber] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<'network' | 'forbidden' | 'stale' | 'empty' | null>(null);
  const [intent, setIntent] = useState<{
    id?: string;
    status?: string;
    next_action?: UpiCollectNextAction & { url?: string };
    sandbox?: boolean;
  } | null>(null);
  const [upiBusy, setUpiBusy] = useState(false);
  const [promoCode, setPromoCode] = useState('');
  const [promoMessage, setPromoMessage] = useState<string | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [availablePromos, setAvailablePromos] = useState<CustomerPromoHint[]>([]);
  const [payMethod, setPayMethod] = useState('CARD');
  const [paymentMethods, setPaymentMethods] = useState<Array<{ family: string; label: string }>>([]);
  const [paymentMethodsLoading, setPaymentMethodsLoading] = useState(true);
  const [loyaltyBalance, setLoyaltyBalance] = useState(0);
  const [loyaltyRedeemEnabled, setLoyaltyRedeemEnabled] = useState(false);
  const [loyaltyMessage, setLoyaltyMessage] = useState<string | null>(null);
  const [quickRecipient, setQuickRecipient] = useState('');
  const [quickLine1, setQuickLine1] = useState('');
  const [quickCity, setQuickCity] = useState('');
  const [quickPostal, setQuickPostal] = useState('');
  const [quickPhone, setQuickPhone] = useState('');
  const [addressMessage, setAddressMessage] = useState<string | null>(null);
  const [payBusy, setPayBusy] = useState(false);
  const autoAttachRef = useRef<string | null>(null);

  const defaultAddressSeed = useMemo(() => {
    const code = country.toUpperCase();
    if (code === 'AE') {
      return { city: 'Dubai', postal: '00000', phone: '+971500000000' };
    }
    if (code === 'US') {
      return { city: 'Austin', postal: '78701', phone: '+15125550100' };
    }
    if (code === 'IN') {
      return { city: 'Mumbai', postal: '400001', phone: '+919999999999' };
    }
    // Country-neutral placeholder — operator should edit before live use.
    return { city: 'City', postal: '00000', phone: '+10000000000' };
  }, [country]);

  useEffect(() => {
    setQuickCity(defaultAddressSeed.city);
    setQuickPostal(defaultAddressSeed.postal);
    setQuickPhone(defaultAddressSeed.phone);
  }, [defaultAddressSeed.city, defaultAddressSeed.postal, defaultAddressSeed.phone]);

  const onUnauthorized = useCallback(() => expire(), [expire]);

  const load = useCallback(() => {
    const token = getAccessToken();
    if (!token || session.status !== 'authenticated' || !ready) {
      return;
    }
    setLoading(true);
    void (async () => {
      try {
        if (readGuestCart(country).length) {
          await mergeGuestCartForCountry(token, country);
        }
        const [sessionBody, addressResult, familyBody, promoHints] = await Promise.all([
          startCheckout(token, country, `ui-co-${Date.now()}`),
          fetchAddresses({ token, onUnauthorized }),
          fetchFamilyMembers(token, country).catch(() => ({ members: [] as FamilyMember[] })),
          fetchAvailablePromos(token, country).catch(() => ({ data: [] as CustomerPromoHint[] })),
        ]);
        const session = sessionBody as CheckoutSession;
        setQuote(session);
        setAvailablePromos(promoHints.data ?? []);
        setFamilyMembers(familyBody.members ?? []);
        if (addressResult.ok && Array.isArray(addressResult.data)) {
          const unique = dedupeAddresses(addressResult.data);
          setAddresses(unique);
          const defaultAddress = pickCheckoutAddress(unique, country);
          if (defaultAddress?.id) {
            setSelectedAddressId(defaultAddress.id);
          } else if (session.address?.id) {
            setSelectedAddressId(session.address.id);
          }
        } else if (session.address?.id) {
          setSelectedAddressId(session.address.id);
        }
        setError(null);
      } catch (err: unknown) {
        const row = err as { message?: string; code?: string; status?: number };
        if (row.status === 403) {
          setError('forbidden');
        } else if (row.status === 401) {
          expire();
        } else if (row.code === 'QUOTE_STALE' || row.code === 'PRICE_CHANGED') {
          setError('stale');
        } else if (/cart is empty/i.test(row.message ?? '')) {
          setError('empty');
        } else {
          setError('network');
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [country, expire, getAccessToken, onUnauthorized, ready, session.status]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPaymentMethodsLoading(true);
    void fetchPaymentMethods(country)
      .then((body) => {
        const methods = (body as { methods?: Array<{ family: string; label: string }> }).methods ?? [];
        setPaymentMethods(methods);
        // Prefer CARD for deterministic sandbox checkout; fall back to country-preferred UPI/mobile.
        const preferred =
          methods.find((m) => m.family === 'CARD') ??
          methods.find((m) => m.family === 'MOBILE_PAYMENT') ??
          methods[0];
        if (preferred?.family) setPayMethod(preferred.family);
      })
      .catch(() => {
        setPaymentMethods([]);
      })
      .finally(() => setPaymentMethodsLoading(false));
  }, [country]);

  useEffect(() => {
    const token = getAccessToken();
    if (!token || session.status !== 'authenticated') return;
    void fetchLoyaltyBalance(token, country, onUnauthorized).then((result) => {
      if (result.ok && result.data?.enabled && result.data.live_redemption) {
        setLoyaltyBalance(result.data.balance_points);
        setLoyaltyRedeemEnabled(true);
      }
    });
  }, [country, getAccessToken, onUnauthorized, session.status]);

  useEffect(() => {
    const token = getAccessToken();
    if (!token || !quote?.id || quote.address?.id || !selectedAddressId || addressBusy) {
      return;
    }
    if (autoAttachRef.current === `${quote.id}:${selectedAddressId}`) {
      return;
    }
    autoAttachRef.current = `${quote.id}:${selectedAddressId}`;
    void attachAddress(selectedAddressId);
  }, [addressBusy, getAccessToken, quote?.address?.id, quote?.id, selectedAddressId]);

  const hasAddress = Boolean(quote?.address?.id);
  const upiPending = isUpiCollectPending(intent, payMethod);
  const checkoutStep = paymentComplete ? 3 : upiPending || hasAddress ? 2 : 1;

  const selectedAddress = useMemo(() => {
    const attachedId = quote?.address?.id ?? selectedAddressId;
    if (!attachedId) return null;
    return addresses.find((row) => row.id === attachedId) ?? quote?.address ?? null;
  }, [addresses, quote?.address, selectedAddressId]);

  const effectiveAddressId = quote?.address?.id ?? selectedAddressId;

  async function attachAddress(addressId: string) {
    const token = getAccessToken();
    if (!token || !quote?.id) {
      return;
    }
    setAddressBusy(true);
    setSelectedAddressId(addressId);
    try {
      const attached = (await attachCheckoutAddress(token, quote.id, addressId)) as CheckoutSession;
      const quoted = (await quoteCheckout(token, quote.id, `ui-quote-addr-${Date.now()}`)) as CheckoutSession;
      setQuote({ ...quoted, address: attached.address ?? quoted.address });
      setPayMessage(null);
    } catch (err) {
      const message = (err as { message?: string }).message ?? 'Could not set delivery address.';
      if (/country does not match/i.test(message)) {
        setPayMessage(
          `This address is for a different country than your ${country} cart. Choose a ${country} delivery address, or change market in the header.`,
        );
      } else {
        setPayMessage(message);
      }
    } finally {
      setAddressBusy(false);
    }
  }

  function selectOrderingFor(memberId: string) {
    setOrderingForId(memberId);
    if (memberId === 'self') {
      return;
    }
    const member = familyMembers.find((row) => row.id === memberId);
    if (!member) {
      return;
    }
    const matched = matchAddressForMember(member, addresses);
    if (matched) {
      autoAttachRef.current = null;
      void attachAddress(matched);
    }
  }

  const orderingForMember =
    orderingForId === 'self' ? null : familyMembers.find((row) => row.id === orderingForId) ?? null;
  const orderingAddressHint =
    orderingForMember && !matchAddressForMember(orderingForMember, addresses)
      ? `Add a delivery address with recipient name "${orderingForMember.display_name}".`
      : null;

  if (session.status === 'expired') {
    return <SessionExpiredState action={{ label: 'Sign in again', onClick: () => signOut() }} />;
  }

  if (needsSelection || !country) {
    return (
      <Page>
        <EmptyState
          title="Choose your market"
          description="Select a delivery country from the header before checkout."
          action={{ label: 'Go to home', onClick: () => (window.location.href = '/') }}
        />
      </Page>
    );
  }

  if (session.status !== 'authenticated') {
    return (
      <Page>
        <EmptyState
          title="Sign in required"
          description="Sign in to complete checkout."
          action={{ label: 'Sign in', onClick: () => (window.location.href = '/login?next=/checkout') }}
        />
        <p className="mg-auth-alt">
          New here? <Link href="/signup">Create an account</Link>
        </p>
      </Page>
    );
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

  if (error === 'empty') {
    return (
      <EmptyState
        title="Your cart is empty"
        description="Add medicines to your cart before checkout. Guest cart items merge after sign-in."
        action={{ label: 'Browse medicines', onClick: () => (window.location.href = '/') }}
      />
    );
  }

  if (error === 'network') {
    return (
      <NetworkErrorState
        description="Check your network and retry. Nothing was charged."
        action={{ label: 'Retry', onClick: load }}
      />
    );
  }

  if (!quote) {
    return <EmptyState title="Checkout unavailable" description="Could not start a checkout session. Return to your cart and try again, or browse the store." action={{ label: 'Back to cart', onClick: () => { window.location.href = '/cart'; } }} />;
  }

  async function finalizeOrder(token: string, paymentIntentId: string) {
    try {
      const order = (await createOrderFromPayment(token, paymentIntentId, `ui-order-${paymentIntentId}`)) as {
        order_number?: string;
      };
      setPlacedOrderNumber(order.order_number ?? null);
      setPaymentComplete(true);
      setPayMessage(null);
      notifyCartChanged();
    } catch (err) {
      setPayMessage(
        (err as { message?: string }).message ??
          'Payment succeeded but the order could not be confirmed. Check My Orders or try again.',
      );
    }
  }

  async function saveQuickAddress() {
    const token = getAccessToken();
    if (!token || !quickRecipient.trim() || !quickLine1.trim() || !quickCity.trim()) {
      setAddressMessage('Enter recipient name, address line, and city.');
      return;
    }
    setAddressBusy(true);
    setAddressMessage(null);
    try {
      const result = await createAddress({
        token,
        onUnauthorized,
        country_code: country,
        recipient_name: quickRecipient.trim(),
        line1: quickLine1.trim(),
        city: quickCity.trim(),
        postal_code: quickPostal.trim() || defaultAddressSeed.postal,
        phone: (quickPhone.trim() || defaultAddressSeed.phone),
        is_default: true,
      });
      if (!result.ok) {
        setAddressMessage(result.error ?? 'Could not save address.');
        return;
      }
      if (!result.data.id) {
        setAddressMessage('Could not save address.');
        return;
      }
      setAddresses((prev) => [...prev, result.data]);
      autoAttachRef.current = null;
      await attachAddress(result.data.id);
      setAddressMessage('Address saved and selected for delivery.');
    } finally {
      setAddressBusy(false);
    }
  }

  async function tryPay(scenario: string) {
    const token = getAccessToken();
    if (!token || !quote?.id || !hasAddress || payBusy) {
      return;
    }
    setPayBusy(true);
    setPayMessage(null);
    try {
      const paid = (await payCheckout(token, quote.id, `ui-pay-${quote.id}`, payMethod, scenario)) as {
        id: string;
        status: string;
        next_action?: UpiCollectNextAction & { url?: string };
        sandbox?: boolean;
        message?: string;
      };
      setIntent(paid);
      if (isCheckoutPaymentComplete(paid.status)) {
        await finalizeOrder(token, paid.id);
      } else if (isUpiCollectPending(paid, payMethod)) {
        setPayMessage(null);
      } else if (paid.next_action?.url) {
        setPayMessage('Complete payment in your UPI app, then refresh this page.');
      } else if (scenario === 'failure' || scenario === 'timeout') {
        setPayMessage('Payment could not be completed. Please try again.');
      } else {
        setPayMessage('Payment could not be completed. Please try again.');
      }
      if (paid.next_action?.url) {
        const confirmed = (await fetchPaymentIntent(token, paid.id)) as typeof paid;
        setIntent(confirmed);
        if (isCheckoutPaymentComplete(confirmed.status)) {
          await finalizeOrder(token, confirmed.id);
        }
      }
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === 'PAYMENTS_DISABLED') {
        setPayMessage((err as { message?: string }).message ?? 'Payment is not available in this environment.');
      } else {
        setPayMessage('Payment could not be completed. Please try again.');
      }
    } finally {
      setPayBusy(false);
    }
  }

  async function completeUpi(_app: string) {
    const token = getAccessToken();
    if (!token || !intent?.id) {
      return;
    }
    setUpiBusy(true);
    setPayMessage(null);
    try {
      const confirmed = (await completeUpiPayment(token, intent.id, `ui-upi-${Date.now()}`)) as {
        status?: string;
      };
      setIntent((prev) => (prev ? { ...prev, status: confirmed.status } : prev));
      if (isCheckoutPaymentComplete(confirmed.status)) {
        await finalizeOrder(token, intent.id);
      } else {
        setPayMessage('Payment could not be confirmed. Please try again.');
      }
    } catch {
      setPayMessage('Payment could not be confirmed. Please try again.');
    } finally {
      setUpiBusy(false);
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
        setPromoMessage(`Promo applied — you save ${formatMoney(discount, quoted.quote?.currency ?? 'XXX')}.`);
      } else {
        setPromoMessage(
          'Code accepted without a discount line yet. Confirm your address and cart meet the promo rules, then re-quote.',
        );
      }
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === 'PROMO_INVALID') {
        setPromoError('This promo code is not valid for your cart.');
      } else if (code === 'QUOTE_STALE') {
        setPromoError('This promo has expired.');
      } else if (code === 'ADDRESS_REQUIRED' || /address/i.test((err as { message?: string }).message ?? '')) {
        setPromoError('Add a compatible delivery address, then apply the promo again.');
      } else {
        setPromoError((err as { message?: string }).message ?? 'Could not apply promo.');
      }
    }
  }

  async function tryApplyLoyalty() {
    const token = getAccessToken();
    if (!token || !quote?.id || !loyaltyBalance) return;
    setLoyaltyMessage(null);
    try {
      const quoted = (await quoteCheckout(token, quote.id, `ui-loyalty-${Date.now()}`, loyaltyBalance)) as CheckoutSession;
      setQuote(quoted);
      const loyalty = (quoted.quote?.payload as { loyalty?: { points_applied: number; discount_minor: string } })?.loyalty;
      if (loyalty?.points_applied) {
        setLoyaltyMessage(
          `Applied ${loyalty.points_applied} points — save ${formatMoney(loyalty.discount_minor, quoted.quote?.currency ?? 'XXX')}.`,
        );
      } else {
        setLoyaltyMessage('Could not apply loyalty points.');
      }
    } catch (err) {
      setLoyaltyMessage((err as { message?: string }).message ?? 'Could not apply loyalty points.');
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

  if (paymentComplete) {
    const success = checkoutSuccessCopy(payMethod, country);
    return (
      <Page>
        <MgCard className="mg-checkout-success">
          <h2 className="mg-section-title">{success.title}</h2>
          <Text>{success.description}</Text>
          {placedOrderNumber ? (
            <Text tone="secondary">
              Order <strong>#{placedOrderNumber}</strong> is confirmed.
            </Text>
          ) : null}
          <div className="mg-toolbar">
            <MgBtn href="/orders">View my orders</MgBtn>
            <MgBtn href="/" variant="secondary">
              Continue shopping
            </MgBtn>
          </div>
        </MgCard>
      </Page>
    );
  }

  return (
    <Page>
      <ServiceHero
        kicker="Secure sandbox checkout"
        title="Checkout"
        subtitle="Review delivery, apply offers, and pay securely."
        compact
      />
      <MgCard flat className="mg-sandbox-banner">
        <Text tone="secondary">
          <strong>Sandbox payment</strong> — this checkout does not charge a live payment provider. No real money moves.
        </Text>
      </MgCard>
      <RxHandoffBanner skipInventoryHold={quote.skip_inventory_hold} dispensingCaseId={quote.dispensing_case_id} />
      {quote.seller_display_name ? (
        <MgCard flat>
          <Text tone="secondary">
            Fulfilled by <strong>{quote.seller_display_name}</strong>. Checkout completes with one pharmacy per order.
          </Text>
        </MgCard>
      ) : null}

      <ol className="mg-checkout-steps" aria-label="Checkout progress">
        <li className={checkoutStep >= 1 ? 'is-active' : ''}>Delivery</li>
        <li className={checkoutStep >= 2 ? 'is-active' : ''}>Payment</li>
        <li className={checkoutStep >= 3 ? 'is-active' : ''}>Done</li>
      </ol>

      <div className="mg-split mg-split--wide">
        <div className="wp-stack">
          {familyMembers.length ? (
            <MgCard>
              <h2 className="mg-section-title">Ordering for</h2>
              <div className="mg-family-chips">
                <button
                  type="button"
                  className={`mg-family-chip${orderingForId === 'self' ? ' is-selected' : ''}`}
                  onClick={() => selectOrderingFor('self')}
                >
                  Myself
                </button>
                {familyMembers.map((member) => (
                  <button
                    key={member.id}
                    type="button"
                    className={`mg-family-chip${orderingForId === member.id ? ' is-selected' : ''}`}
                    onClick={() => selectOrderingFor(member.id)}
                  >
                    {member.display_name}
                    <span className="mg-list-meta">{relationshipLabel(member.relationship_code)}</span>
                  </button>
                ))}
              </div>
              {orderingAddressHint ? <Text tone="secondary">{orderingAddressHint}</Text> : null}
              <MgBtn href="/family" variant="ghost" size="sm">
                Manage family
              </MgBtn>
            </MgCard>
          ) : null}
          <MgCard>
            <h2 className="mg-section-title">Delivery address</h2>
            {!addresses.length ? (
              <>
                <Text tone="secondary">Add a delivery address to place your order.</Text>
                <FormField label="Recipient name">
                  {({ id }) => (
                    <Input id={id} value={quickRecipient} onChange={(e) => setQuickRecipient(e.target.value)} />
                  )}
                </FormField>
                <FormField label="Address line">
                  {({ id }) => <Input id={id} value={quickLine1} onChange={(e) => setQuickLine1(e.target.value)} />}
                </FormField>
                <FormField label="City">
                  {({ id }) => <Input id={id} value={quickCity} onChange={(e) => setQuickCity(e.target.value)} />}
                </FormField>
                <FormField label="Postal code">
                  {({ id }) => <Input id={id} value={quickPostal} onChange={(e) => setQuickPostal(e.target.value)} />}
                </FormField>
                <FormField label="Phone (E.164)">
                  {({ id }) => <Input id={id} value={quickPhone} onChange={(e) => setQuickPhone(e.target.value)} />}
                </FormField>
                <MgBtn onClick={() => void saveQuickAddress()} disabled={addressBusy}>
                  Save &amp; continue
                </MgBtn>
                <MgBtn href="/account/addresses" variant="ghost" size="sm">
                  Manage all addresses
                </MgBtn>
                {addressMessage ? <Text tone="secondary">{addressMessage}</Text> : null}
              </>
            ) : (
              <>
                <div className="mg-address-picker">
                  {addresses.map((row) => {
                    const rowCountry = addressCountryCode(row);
                    const compatible = !rowCountry || rowCountry === country.toUpperCase();
                    return (
                      <label
                        key={row.id}
                        className={`mg-address-option${effectiveAddressId === row.id ? ' is-selected' : ''}${
                          compatible ? '' : ' is-incompatible'
                        }`}
                      >
                        <input
                          type="radio"
                          name="checkout-address"
                          value={row.id}
                        checked={effectiveAddressId === row.id}
                        disabled={addressBusy || !compatible}
                          onChange={() => void attachAddress(row.id)}
                        />
                        <span>
                          {addressLabel(row)}
                          {rowCountry ? ` · ${rowCountry}` : ''}
                          {!compatible ? ' — wrong market for this cart' : ''}
                        </span>
                      </label>
                    );
                  })}
                </div>
                {!addresses.some((row) => {
                  const rowCountry = addressCountryCode(row);
                  return !rowCountry || rowCountry === country.toUpperCase();
                }) ? (
                  <>
                    <Text tone="secondary">
                      None of your saved addresses match market {country}. Add one to continue checkout.
                    </Text>
                    <FormField label="Recipient name">
                      {({ id }) => (
                        <Input id={id} value={quickRecipient} onChange={(e) => setQuickRecipient(e.target.value)} />
                      )}
                    </FormField>
                    <FormField label="Address line">
                      {({ id }) => (
                        <Input id={id} value={quickLine1} onChange={(e) => setQuickLine1(e.target.value)} />
                      )}
                    </FormField>
                    <FormField label="City">
                      {({ id }) => <Input id={id} value={quickCity} onChange={(e) => setQuickCity(e.target.value)} />}
                    </FormField>
                    <FormField label="Postal code">
                      {({ id }) => (
                        <Input id={id} value={quickPostal} onChange={(e) => setQuickPostal(e.target.value)} />
                      )}
                    </FormField>
                    <FormField label="Phone (E.164)">
                      {({ id }) => (
                        <Input id={id} value={quickPhone} onChange={(e) => setQuickPhone(e.target.value)} />
                      )}
                    </FormField>
                    <MgBtn onClick={() => void saveQuickAddress()} disabled={addressBusy}>
                      Save {country} address &amp; continue
                    </MgBtn>
                    {addressMessage ? <Text tone="secondary">{addressMessage}</Text> : null}
                  </>
                ) : addresses.some((row) => {
                    const rowCountry = addressCountryCode(row);
                    return Boolean(rowCountry && rowCountry !== country.toUpperCase());
                  }) ? (
                  <Text size="caption" tone="secondary">
                    Addresses from other markets are disabled for this cart. Select a {country} address above.
                  </Text>
                ) : null}
              </>
            )}
            {selectedAddress && quote.address?.id ? (
              <Text size="caption" tone="secondary">
                Delivering to {addressLabel(selectedAddress as CustomerAddress)}
              </Text>
            ) : null}
            <MarketplaceServiceabilityNote
              countryCode={country}
              postalCode={String(selectedAddress?.postal_code ?? quickPostal ?? '')}
            />
          </MgCard>

          <MgCard>
            <h2 className="mg-section-title">Order summary</h2>
            <CheckoutPriceBreakdown
              currency={quote.quote?.currency ?? 'XXX'}
              quote={quote.quote}
              payload={(quote.quote?.payload as import('./commerce-api').CheckoutQuotePayload | undefined) ?? null}
            />
            {!(quote.quote?.payload as import('./commerce-api').CheckoutQuotePayload | undefined)?.care_plan?.discount_minor ||
            (quote.quote?.payload as import('./commerce-api').CheckoutQuotePayload | undefined)?.care_plan?.discount_minor === '0' ? (
              <p className="mg-summary-note">
                No Care Plan discount on this quote.{' '}
                <MgBtn href="/care-plan" variant="ghost" size="sm">
                  Join sandbox Care Plan
                </MgBtn>
              </p>
            ) : null}
            <p className="mg-summary-total">
              Total {formatMoney(quote.quote?.total_minor, quote.quote?.currency ?? 'XXX')}
            </p>
          </MgCard>
        </div>

        <div className="wp-stack">
          <MgCard>
            <h3 className="mg-section-title">Promo code</h3>
            {availablePromos.length ? (
              <div className="wp-stack">
                <Text tone="secondary">Available offers (sandbox):</Text>
                {availablePromos.slice(0, 5).map((row) => (
                  <Text key={row.code} tone="secondary">
                    {row.code}
                    {row.min_basket_minor && row.min_basket_minor !== '0'
                      ? ` — min order ${formatMoney(row.min_basket_minor, quote?.quote?.currency ?? 'XXX')}`
                      : ''}
                    {row.expires_at ? ` · expires ${new Date(row.expires_at).toLocaleDateString()}` : ''}
                  </Text>
                ))}
              </div>
            ) : null}
            <FormField label="Enter code">
              {({ id }) => (
                <Input id={id} value={promoCode} onChange={(e) => setPromoCode(e.target.value.toUpperCase())} />
              )}
            </FormField>
            <div className="mg-toolbar">
              <MgBtn onClick={() => void tryApplyPromo()} disabled={!hasAddress}>
                Apply
              </MgBtn>
              <MgBtn variant="secondary" onClick={() => void tryRemovePromo()} disabled={!hasAddress}>
                Remove
              </MgBtn>
            </div>
            {!hasAddress ? (
              <Text tone="secondary">
                Select a compatible delivery address above before applying a promo. Discounts appear only after the server
                accepts the code — we never show a discount as applied without confirmation.
              </Text>
            ) : null}
            {promoMessage ? <Text tone="secondary">{promoMessage}</Text> : null}
            {promoError ? (
              <Text tone="secondary">
                {promoError} You can fix your address or cart and try again, or continue without a promo.
              </Text>
            ) : null}
            {quote?.quote?.discount_minor && quote.quote.discount_minor !== '0' ? (
              <Text tone="secondary">
                Server discount: {formatMoney(quote.quote.discount_minor, quote.quote.currency ?? 'XXX')}
              </Text>
            ) : null}
          </MgCard>

          {loyaltyRedeemEnabled && loyaltyBalance > 0 ? (
            <MgCard>
              <h3 className="mg-section-title">Rewards points</h3>
              <Text tone="secondary">
                You have {loyaltyBalance.toLocaleString()} points available (max 50% of order).
              </Text>
              <MgBtn onClick={() => void tryApplyLoyalty()} disabled={!hasAddress}>
                Apply all points
              </MgBtn>
              {loyaltyMessage ? <Text tone="secondary">{loyaltyMessage}</Text> : null}
            </MgCard>
          ) : null}

          <MgCard>
            <h3 className="mg-section-title">Payment method</h3>
            {paymentMethodsLoading ? (
              <Text tone="secondary">Loading payment options for {country}…</Text>
            ) : paymentMethods.length === 0 ? (
              <Text tone="secondary">
                No published payment methods for this market yet. Checkout stays policy-gated — sandbox will not charge a
                live provider.
              </Text>
            ) : (
              <div className="mg-payment-methods">
                {paymentMethods.map((m) => (
                  <label key={m.family} className={`mg-payment-method${payMethod === m.family ? ' is-selected' : ''}`}>
                    <input
                      type="radio"
                      name="pay-method"
                      value={m.family}
                      checked={payMethod === m.family}
                      onChange={() => setPayMethod(m.family)}
                    />
                    <span>{m.label || m.family}</span>
                  </label>
                ))}
              </div>
            )}
            {!paymentMethodsLoading && paymentMethods.length > 0 && paymentMethodHint(payMethod, country) ? (
              <Text size="caption" tone="secondary">
                {paymentMethodHint(payMethod, country)}
              </Text>
            ) : null}
          </MgCard>

          {upiPending && intent ? (
            <UpiCollectPanel
              amountMinor={quote.quote?.total_minor}
              currency={quote.quote?.currency ?? 'XXX'}
              nextAction={intent.next_action}
              busy={upiBusy}
              onComplete={(app) => void completeUpi(app)}
              onCancel={() => {
                setIntent(null);
                setPayMessage(null);
              }}
            />
          ) : (
            <MgBtn
              block
              disabled={!hasAddress || addressBusy || payBusy}
              onClick={() => void tryPay('success')}
            >
              {checkoutPayButtonLabel(
                payMethod,
                hasAddress,
                formatMoney(quote.quote?.total_minor, quote.quote?.currency ?? 'XXX'),
                country,
              )}
            </MgBtn>
          )}
          {payMessage ? <Text>{payMessage}</Text> : null}
          {quote.payment_message ? (
            <Text size="caption" tone="secondary">
              {quote.payment_message}
            </Text>
          ) : null}

          {showDevTools() ? (
            <MgCard flat className="dev-tools-panel">
              <h3 className="mg-section-title">Developer tools</h3>
              <Text size="caption" tone="secondary">
                Sandbox payment scenarios.
              </Text>
              <MgBtn variant="secondary" disabled={!hasAddress} onClick={() => void tryPay('failure')}>
                Simulate failure
              </MgBtn>
              <MgBtn variant="secondary" disabled={!hasAddress} onClick={() => void tryPay('timeout')}>
                Simulate timeout
              </MgBtn>
              {intent ? <Text size="caption">Intent: {intent.status}</Text> : null}
            </MgCard>
          ) : null}
        </div>
      </div>
    </Page>
  );
}
