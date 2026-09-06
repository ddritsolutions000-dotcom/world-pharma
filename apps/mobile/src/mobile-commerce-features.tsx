import { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { apiCall } from '@world-pharma/shell-core';
import {
  NativeButton,
  NativeCard,
  NativeEmptyState,
  NativeInput,
  NativeLoadingState,
  NativeText,
} from '@world-pharma/ui-kit/native';
import { fetchAddresses, type CustomerAddress } from './account-api';
import {
  attachCheckoutAddress,
  applyCheckoutPromo,
  completeUpiPayment,
  fetchAvailablePromos,
  fetchCatalog,
  fetchPaymentMethods,
  newIdempotencyKey,
  payCheckout,
  quoteCheckout,
  removeCheckoutPromo,
  startCheckout,
  type CatalogCard,
  type CheckoutSession,
  type CustomerPromoHint,
} from './commerce-api';
import {
  checkoutPayButtonLabel,
  checkoutSuccessCopy,
  isCheckoutPaymentComplete,
  isUpiCollectPending,
  paymentMethodHint,
  upiCollectVpa,
  type UpiCollectNextAction,
} from './checkout-payment-ui';
import { fetchLoyaltyBalance, fetchLoyaltyLedger, type LoyaltyLedgerRow } from './loyalty-api';
import { fetchCarePlanCatalog, fetchMyCarePlan, subscribeCarePlan, type CarePlanMine } from './care-plan-api';
import { enrollSpecialityProgram, fetchPublicSpecialityPrograms } from './lab-api';
import { filterAyurvedaProducts, filterDeals, filterCancerCareProducts, filterPetProducts, filterVaccineProducts, isLabTest, isMedicine, sortByDiscount } from './store-catalog-utils';
import { formatMoney } from './format-money';
import type { FeatureCtx } from './customer-features';
import { ProductGrid } from './commerce-ui';
import { NativePageHeader, NativeTrackTimeline } from './native-screens';

export function CountryPickerRow({
  countries,
  country,
  countryName,
  onSelect,
}: {
  countries: CountryOption[];
  country: string;
  countryName: string;
  onSelect: (iso: string) => void;
}) {
  if (countries.length <= 1) {
    return null;
  }
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {countries.map((row) => {
          const iso = row.iso_alpha2;
          const label =
            typeof row.name === 'string'
              ? row.name
              : row.name && typeof row.name === 'object' && 'en' in row.name
                ? (row.name as { en?: string }).en ?? iso
                : iso;
          const active = iso === country;
          return (
            <Pressable
              key={iso}
              onPress={() => onSelect(iso)}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 10,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: active ? '#1A7A76' : '#E6ECF0',
                backgroundColor: active ? '#EAF6F4' : '#fff',
                borderRadius: 999,
                paddingHorizontal: 12,
                paddingVertical: 8,
              }}
            >
              <NativeText variant="caption">{label}</NativeText>
            </Pressable>
          );
        })}
    </View>
  );
}

type TrackResult = {
  order_number: string;
  status: string;
  created_at: string;
  currency: string;
  total_minor: string;
  eta_hint: string;
  items: Array<{ title: string; qty: number }>;
  shipments: Array<{ id: string; status: string; tracking_number: string | null }>;
  message: string;
};

export function TrackOrderScreen({ onBack }: { onBack?: () => void }) {
  const [orderNumber, setOrderNumber] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TrackResult | null>(null);

  async function track() {
    if (!orderNumber.trim() || !postalCode.trim()) {
      setError('Enter order number and delivery postal code.');
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    const params = new URLSearchParams({
      order_number: orderNumber.trim(),
      postal_code: postalCode.trim(),
    });
    const response = await apiCall<TrackResult>(`api/v1/orders/track?${params.toString()}`);
    setLoading(false);
    if (!response.ok) {
      setError(
        response.status === 404
          ? 'Order not found. Check your order number.'
          : response.error ?? 'Could not track order.',
      );
      return;
    }
    setResult(response.data);
  }

  return (
    <View style={{ gap: 12 }}>
      <NativePageHeader title="Track your order" subtitle="Guest tracking — no login required." />
      <NativeCard>
        <NativeInput label="Order number" value={orderNumber} onChangeText={setOrderNumber} />
        <NativeInput label="Delivery postal code" value={postalCode} onChangeText={setPostalCode} />
        <NativeButton label={loading ? 'Looking up…' : 'Track order'} onPress={() => void track()} />
        {error ? <NativeText variant="caption">{error}</NativeText> : null}
      </NativeCard>
      {result ? (
        <NativeCard>
          <NativeText variant="h3">{result.order_number}</NativeText>
          <NativeText variant="label">{result.status.replaceAll('_', ' ')}</NativeText>
          <NativeText variant="caption">{result.eta_hint}</NativeText>
          <NativeText variant="caption">
            Total {formatMoney(result.total_minor, result.currency)}
          </NativeText>
          <NativeTrackTimeline
            steps={['CONFIRMED', 'ALLOCATED', 'PICKING', 'PACKED', 'SHIPPED', 'DELIVERED']}
            activeIndex={Math.max(
              0,
              ['CONFIRMED', 'ALLOCATED', 'PICKING', 'PACKED', 'SHIPPED', 'DELIVERED'].indexOf(result.status),
            )}
          />
          {result.items.map((line, i) => (
            <NativeText key={`${line.title}-${i}`} variant="caption">
              {line.title} × {line.qty}
            </NativeText>
          ))}
          <NativeText variant="caption">{result.message}</NativeText>
        </NativeCard>
      ) : null}
      {onBack ? <NativeButton label="Back" variant="secondary" onPress={onBack} /> : null}
    </View>
  );
}

export function DealsScreen({ country, countryName, onOpenProduct }: { country: string; countryName: string; onOpenProduct: (slug: string) => void }) {
  const [loading, setLoading] = useState(true);
  const [deals, setDeals] = useState<CatalogCard[]>([]);

  useEffect(() => {
    setLoading(true);
    void fetchCatalog(country)
      .then((res) => {
        const medicines = (res.data ?? []).filter(isMedicine);
        const labs = (res.data ?? []).filter(isLabTest);
        setDeals([
          ...filterDeals(sortByDiscount(medicines)),
          ...labs.filter((t) => filterDeals([t]).length > 0).slice(0, 8),
        ]);
      })
      .catch(() => setDeals([]))
      .finally(() => setLoading(false));
  }, [country]);

  return (
    <View style={{ gap: 12 }}>
      <NativePageHeader title="Offers & deals" subtitle={`Best discounts in ${countryName}.`} />
      {loading ? <NativeLoadingState title="Loading offers" /> : null}
      {!loading && deals.length === 0 ? (
        <NativeEmptyState title="No offers right now" description="Check back soon for new deals." />
      ) : null}
      {!loading && deals.length > 0 ? (
        <ProductGrid items={deals} onSelect={(item) => onOpenProduct(item.slug)} />
      ) : null}
    </View>
  );
}

export function CarePlanScreen({
  ctx,
  country,
  onOpenLoyalty,
  onNeedAuth,
}: {
  ctx: FeatureCtx;
  country: string;
  onOpenLoyalty: () => void;
  onNeedAuth?: () => void;
}) {
  const [mine, setMine] = useState<CarePlanMine | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    ctx.setViewState('loading');
    if (!ctx.token) {
      const pub = await fetchCarePlanCatalog();
      if (!pub.ok) {
        ctx.setViewState('network');
        return;
      }
      setMine({ catalog: pub.data.data ?? [], membership: null, plan: null });
      ctx.setViewState('idle');
      return;
    }
    const result = await fetchMyCarePlan(ctx.token, country, ctx.onUnauthorized);
    if (!result.ok) {
      ctx.setViewState(result.kind === 'forbidden' ? 'forbidden' : 'network');
      return;
    }
    setMine(result.data);
    ctx.setViewState('idle');
  }, [ctx, country]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <View style={{ gap: 12 }}>
      <NativeText variant="h2">Care Plan</NativeText>
      <NativeText variant="caption">
        Sandbox membership — checkout applies member discount. No live UPI.
      </NativeText>
      {ctx.viewState === 'loading' ? <NativeLoadingState title="Loading plans" /> : null}
      {mine?.plan ? (
        <NativeCard>
          <NativeText variant="h3">{mine.plan.name}</NativeText>
          <NativeText variant="caption">Active until {mine.membership?.expires_at?.slice(0, 10)}</NativeText>
        </NativeCard>
      ) : null}
      {message ? <NativeText variant="caption">{message}</NativeText> : null}
      {(mine?.catalog ?? []).map((plan) => (
        <NativeCard key={plan.id}>
          <NativeText variant="h3">{plan.name}</NativeText>
          <NativeText variant="caption">{plan.price_label}</NativeText>
          <NativeButton
            label={mine?.plan?.id === plan.id ? 'Current plan' : ctx.token ? 'Activate (sandbox)' : 'Sign in to join'}
            variant={plan.featured ? 'primary' : 'secondary'}
            onPress={() =>
              void (async () => {
                if (!ctx.token) {
                  onNeedAuth?.();
                  return;
                }
                const result = await subscribeCarePlan(ctx.token, country, plan.id, ctx.onUnauthorized);
                if (!result.ok) {
                  setMessage(result.error);
                  return;
                }
                setMine(result.data);
                setMessage('Membership active. Savings apply at checkout.');
              })()
            }
          />
        </NativeCard>
      ))}
      <NativeButton label="View rewards points" variant="secondary" onPress={onOpenLoyalty} />
    </View>
  );
}

export function LoyaltyScreen({
  ctx,
  country,
}: {
  ctx: FeatureCtx;
  country: string;
}) {
  const [balance, setBalance] = useState<number | null>(null);
  const [ledger, setLedger] = useState<LoyaltyLedgerRow[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    ctx.setViewState('loading');
    const [bal, led] = await Promise.all([
      fetchLoyaltyBalance(ctx.token, country, ctx.onUnauthorized),
      fetchLoyaltyLedger(ctx.token, country, ctx.onUnauthorized),
    ]);
    if (!bal.ok) {
      ctx.setViewState(bal.kind === 'forbidden' ? 'forbidden' : 'network');
      return;
    }
    setBalance(bal.data.balance_points);
    setMessage(bal.data.enabled ? null : 'Rewards are not enabled in this country.');
    setLedger(led.ok ? (led.data.data ?? []) : []);
    ctx.setViewState('idle');
  }, [ctx, country]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <View style={{ gap: 12 }}>
      <NativeText variant="h2">Rewards points</NativeText>
      {ctx.viewState === 'loading' ? <NativeLoadingState title="Loading rewards" /> : null}
      {ctx.viewState === 'idle' && balance !== null ? (
        <NativeCard>
          <NativeText variant="h3">{balance.toLocaleString()} points</NativeText>
          {message ? <NativeText variant="caption">{message}</NativeText> : null}
          {ledger.slice(0, 10).map((row) => (
            <NativeText key={row.id} variant="caption">
              {row.kind} {row.points_delta > 0 ? '+' : ''}
              {row.points_delta} · {new Date(row.created_at).toLocaleDateString()}
            </NativeText>
          ))}
        </NativeCard>
      ) : null}
    </View>
  );
}

export function MobileCheckoutScreen({
  ctx,
  country,
  onComplete,
}: {
  ctx: FeatureCtx;
  country: string;
  onComplete: () => void;
}) {
  const [session, setSession] = useState<CheckoutSession | null>(null);
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [methods, setMethods] = useState<Array<{ family: string; label: string }>>([]);
  const [payMethod, setPayMethod] = useState('CARD');
  const [loyaltyBalance, setLoyaltyBalance] = useState(0);
  const [promoCode, setPromoCode] = useState('');
  const [promoMessage, setPromoMessage] = useState<string | null>(null);
  const [availablePromos, setAvailablePromos] = useState<CustomerPromoHint[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [upiBusy, setUpiBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [intent, setIntent] = useState<{
    id?: string;
    status?: string;
    next_action?: UpiCollectNextAction;
  } | null>(null);

  const load = useCallback(async () => {
    ctx.setViewState('loading');
    try {
      const [quote, addr, pm, loyalty, promoHints] = await Promise.all([
        startCheckout(ctx.token, country, newIdempotencyKey('m-co')),
        fetchAddresses({ token: ctx.token, onUnauthorized: ctx.onUnauthorized }),
        fetchPaymentMethods(country),
        fetchLoyaltyBalance(ctx.token, country, ctx.onUnauthorized),
        fetchAvailablePromos(ctx.token, country).catch(() => ({ data: [] as CustomerPromoHint[] })),
      ]);
      setSession(quote);
      setAvailablePromos(promoHints.data ?? []);
      if (addr.ok && Array.isArray(addr.data)) {
        setAddresses(addr.data);
        const defaultAddr =
          addr.data.find((row) => row.is_default || row.isDefault) ?? addr.data[0];
        if (defaultAddr?.id) setSelectedAddressId(defaultAddr.id);
      }
      const listed = (pm as { methods?: Array<{ family: string; label: string }> }).methods ?? [];
      setMethods(listed);
      const preferred = listed.find((m) => m.family === 'MOBILE_PAYMENT') ?? listed[0];
      if (preferred?.family) setPayMethod(preferred.family);
      if (loyalty.ok && loyalty.data.enabled && loyalty.data.live_redemption) {
        setLoyaltyBalance(loyalty.data.balance_points);
      }
      ctx.setViewState('idle');
    } catch {
      ctx.setViewState('network');
    }
  }, [ctx, country]);

  useEffect(() => {
    void load();
  }, [load]);

  async function prepareQuote(addressId: string) {
    if (!session?.id) return session;
    await attachCheckoutAddress(ctx.token, session.id, addressId);
    return quoteCheckout(ctx.token, session.id, newIdempotencyKey('m-quote')) as Promise<CheckoutSession>;
  }

  async function pay(applyLoyalty = false) {
    if (!session?.id || !selectedAddressId) {
      setMessage('Select a delivery address.');
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      let current = await prepareQuote(selectedAddressId);
      if (applyLoyalty && loyaltyBalance > 0) {
        current = (await quoteCheckout(
          ctx.token,
          session.id,
          newIdempotencyKey('m-loyalty'),
          loyaltyBalance,
        )) as CheckoutSession;
      }
      setSession(current);
      const paid = (await payCheckout(
        ctx.token,
        session.id,
        newIdempotencyKey('m-pay'),
        payMethod,
        'success',
      )) as { id?: string; status?: string; next_action?: UpiCollectNextAction };
      setIntent(paid.id ? paid : null);
      if (isCheckoutPaymentComplete(paid.status)) {
        setDone(true);
        onComplete();
      } else if (isUpiCollectPending(paid, payMethod)) {
        setMessage(null);
      } else {
        setMessage('Payment could not be completed.');
      }
    } catch (err) {
      setMessage((err as Error).message ?? 'Checkout failed.');
    } finally {
      setBusy(false);
    }
  }

  async function completeUpi(_app: string) {
    if (!intent?.id) return;
    setUpiBusy(true);
    setMessage(null);
    try {
      const confirmed = (await completeUpiPayment(ctx.token, intent.id, newIdempotencyKey('m-upi'))) as {
        status?: string;
      };
      setIntent((prev) => (prev ? { ...prev, status: confirmed.status } : prev));
      if (isCheckoutPaymentComplete(confirmed.status)) {
        setDone(true);
        onComplete();
      } else {
        setMessage('Payment could not be confirmed.');
      }
    } catch {
      setMessage('Payment could not be confirmed.');
    } finally {
      setUpiBusy(false);
    }
  }

  async function applyPromo() {
    if (!session?.id || !promoCode.trim()) {
      setPromoMessage('Enter a promo code.');
      return;
    }
    setBusy(true);
    setPromoMessage(null);
    try {
      const updated = await applyCheckoutPromo(ctx.token, session.id, promoCode.trim());
      setSession(updated);
      if (selectedAddressId) {
        const quoted = await prepareQuote(selectedAddressId);
        if (quoted) {
          setSession(quoted);
          const discount = quoted.quote?.discount_minor;
          if (discount && discount !== '0') {
            setPromoMessage(`Promo applied — save ${formatMoney(discount, quoted.quote?.currency ?? 'XXX')}.`);
          } else {
            setPromoMessage('Promo applied.');
          }
        } else {
          setPromoMessage('Promo applied.');
        }
      } else {
        setPromoMessage('Promo applied.');
      }
    } catch (err) {
      setPromoMessage((err as Error).message ?? 'Promo could not be applied.');
    } finally {
      setBusy(false);
    }
  }

  async function removePromo() {
    if (!session?.id) return;
    setBusy(true);
    setPromoMessage(null);
    try {
      const updated = await removeCheckoutPromo(ctx.token, session.id);
      setSession(updated);
      if (selectedAddressId) {
        const quoted = await prepareQuote(selectedAddressId);
        setSession(quoted);
      }
      setPromoCode('');
      setPromoMessage('Promo removed.');
    } catch (err) {
      setPromoMessage((err as Error).message ?? 'Could not remove promo.');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    const copy = checkoutSuccessCopy(payMethod);
    return (
      <NativeCard>
        <NativeText variant="h2">{copy.title}</NativeText>
        <NativeText variant="caption">{copy.description}</NativeText>
      </NativeCard>
    );
  }

  const totalLabel = formatMoney(session?.quote?.total_minor, session?.quote?.currency ?? 'XXX');
  const upiPending = isUpiCollectPending(intent, payMethod);

  return (
    <View style={{ gap: 12 }}>
      <NativeText variant="h2">Checkout</NativeText>
      {ctx.viewState === 'loading' ? <NativeLoadingState title="Loading checkout" /> : null}
      {ctx.viewState === 'idle' ? (
        <>
          <NativeCard>
            <NativeText variant="label">Delivery address</NativeText>
            {addresses.map((row) => (
              <Pressable key={row.id} onPress={() => setSelectedAddressId(row.id)} style={{ paddingVertical: 6 }}>
                <NativeText variant="caption">
                  {selectedAddressId === row.id ? '● ' : '○ '}
                  {row.recipient_name ?? row.recipientName ?? 'Recipient'} — {row.line1}, {row.city}
                </NativeText>
              </Pressable>
            ))}
          </NativeCard>
          <NativeCard>
            <NativeText variant="label">Promo code</NativeText>
            {availablePromos.length ? (
              <>
                {availablePromos.slice(0, 3).map((row) => (
                  <NativeText key={row.code} variant="caption">
                    {row.code}
                    {row.min_basket_minor && row.min_basket_minor !== '0'
                      ? ` · min ${formatMoney(row.min_basket_minor, session?.quote?.currency ?? 'XXX')}`
                      : ''}
                  </NativeText>
                ))}
              </>
            ) : null}
            <NativeInput label="Promo code" value={promoCode} onChangeText={setPromoCode} placeholder="Enter code" />
            <NativeButton label="Apply promo" variant="secondary" onPress={() => void applyPromo()} />
            <NativeButton label="Remove promo" variant="secondary" onPress={() => void removePromo()} />
            {promoMessage ? <NativeText variant="caption">{promoMessage}</NativeText> : null}
            {session?.promo?.code ? (
              <NativeText variant="caption">{`Applied: ${session.promo.code}`}</NativeText>
            ) : null}
            {session?.quote?.discount_minor && session.quote.discount_minor !== '0' ? (
              <NativeText variant="caption">
                {`Discount: ${formatMoney(session.quote.discount_minor, session.quote.currency ?? 'XXX')}`}
              </NativeText>
            ) : null}
          </NativeCard>
          <NativeCard>
            <NativeText variant="label">Total {totalLabel}</NativeText>
            {loyaltyBalance > 0 ? (
              <NativeButton
                label={`Apply ${loyaltyBalance} reward points`}
                variant="secondary"
                onPress={() => void pay(true)}
              />
            ) : null}
          </NativeCard>
          <NativeCard>
            <NativeText variant="label">Payment method</NativeText>
            {methods.map((m) => (
              <Pressable key={m.family} onPress={() => setPayMethod(m.family)} style={{ paddingVertical: 6 }}>
                <NativeText variant="caption">
                  {payMethod === m.family ? '● ' : '○ '}
                  {m.label || m.family}
                </NativeText>
              </Pressable>
            ))}
            {paymentMethodHint(payMethod, country) ? (
              <NativeText variant="caption">{paymentMethodHint(payMethod, country)}</NativeText>
            ) : null}
          </NativeCard>
          {upiPending && intent ? (
            <NativeCard>
              <NativeText variant="label">Complete UPI payment</NativeText>
              <NativeText variant="caption">
                Sandbox demo — pay {totalLabel} to {upiCollectVpa(intent.next_action)} or tap below to simulate approval.
              </NativeText>
              <NativeButton
                label={upiBusy ? 'Confirming…' : 'I have completed payment'}
                onPress={() => void completeUpi('simulate')}
              />
              <NativeButton
                label="Choose another method"
                variant="secondary"
                onPress={() => {
                  setIntent(null);
                  setMessage(null);
                }}
              />
            </NativeCard>
          ) : (
            <NativeButton
              label={busy ? 'Processing…' : checkoutPayButtonLabel(payMethod, Boolean(selectedAddressId), totalLabel)}
              onPress={() => void pay(false)}
            />
          )}
          {message ? <NativeText variant="caption">{message}</NativeText> : null}
        </>
      ) : null}
    </View>
  );
}

export function MobilePetCareScreen({
  ctx,
  country,
  onOpenProduct,
}: {
  ctx: FeatureCtx;
  country: string;
  onOpenProduct: (slug: string) => void;
}) {
  const [items, setItems] = useState<CatalogCard[]>([]);
  const [petType, setPetType] = useState<'all' | 'dog' | 'cat'>('all');

  const load = useCallback(async () => {
    ctx.setViewState('loading');
    try {
      const catalog = await fetchCatalog(country);
      setItems(filterPetProducts(catalog.data, petType));
      ctx.setViewState('idle');
    } catch {
      ctx.setViewState('network');
    }
  }, [country, ctx, petType]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <View style={{ gap: 12 }}>
      <NativeText variant="h2">Pet Care</NativeText>
      <NativeText variant="caption">Medicines and essentials for dogs and cats — consult your vet before use.</NativeText>
      {ctx.viewState === 'loading' ? <NativeLoadingState title="Loading pet products" /> : null}
      {ctx.viewState === 'network' ? (
        <NativeEmptyState title="Could not load" description="Check your connection and try again." />
      ) : null}
      {ctx.viewState === 'idle' ? (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {(['all', 'dog', 'cat'] as const).map((type) => (
              <NativeButton
                key={type}
                label={type === 'all' ? 'All' : type === 'dog' ? 'Dogs' : 'Cats'}
                variant={petType === type ? 'primary' : 'secondary'}
                onPress={() => setPetType(type)}
              />
            ))}
          </View>
          <ProductGrid items={items} onSelect={(item) => onOpenProduct(item.slug)} />
        </>
      ) : null}
    </View>
  );
}

export function MobileCancerCareScreen({
  ctx,
  country,
  onOpenProduct,
  onNavigate,
}: {
  ctx: FeatureCtx;
  country: string;
  onOpenProduct: (slug: string) => void;
  onNavigate: (target: string) => void;
}) {
  const [items, setItems] = useState<CatalogCard[]>([]);
  const [careFilter, setCareFilter] = useState<'all' | 'support' | 'nutrition' | 'comfort'>('all');

  const load = useCallback(async () => {
    ctx.setViewState('loading');
    try {
      const catalog = await fetchCatalog(country);
      setItems(filterCancerCareProducts(catalog.data, careFilter));
      ctx.setViewState('idle');
    } catch {
      ctx.setViewState('network');
    }
  }, [careFilter, country, ctx]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <View style={{ gap: 12 }}>
      <NativeText variant="h2">Cancer Care</NativeText>
      <NativeText variant="caption">
        Supportive products plus links to oncologists, lab tests, and prescriptions. Follow your care team&apos;s guidance.
      </NativeText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <NativeButton label="Consult doctor" variant="secondary" onPress={() => onNavigate('doctors')} />
        <NativeButton label="Lab tests" variant="secondary" onPress={() => onNavigate('lab')} />
        <NativeButton label="Upload Rx" variant="secondary" onPress={() => onNavigate('prescriptions')} />
      </View>
      {ctx.viewState === 'loading' ? <NativeLoadingState title="Loading cancer care" /> : null}
      {ctx.viewState === 'network' ? (
        <NativeEmptyState title="Could not load" description="Check your connection and try again." />
      ) : null}
      {ctx.viewState === 'idle' ? (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {(['all', 'support', 'nutrition', 'comfort'] as const).map((type) => (
              <NativeButton
                key={type}
                label={type === 'all' ? 'All' : type.charAt(0).toUpperCase() + type.slice(1)}
                variant={careFilter === type ? 'primary' : 'secondary'}
                onPress={() => setCareFilter(type)}
              />
            ))}
          </View>
          <ProductGrid items={items} onSelect={(item) => onOpenProduct(item.slug)} />
        </>
      ) : null}
    </View>
  );
}

export function MobileAyurvedaScreen({
  ctx,
  country,
  onOpenProduct,
  onNavigate,
}: {
  ctx: FeatureCtx;
  country: string;
  onOpenProduct: (slug: string) => void;
  onNavigate: (target: string) => void;
}) {
  const [items, setItems] = useState<CatalogCard[]>([]);
  const [tradition, setTradition] = useState<'all' | 'ayurveda' | 'homeopathy'>('all');

  const load = useCallback(async () => {
    ctx.setViewState('loading');
    try {
      const catalog = await fetchCatalog(country);
      setItems(filterAyurvedaProducts(catalog.data, tradition));
      ctx.setViewState('idle');
    } catch {
      ctx.setViewState('network');
    }
  }, [country, ctx, tradition]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <View style={{ gap: 12 }}>
      <NativeText variant="h2">Ayurveda & Homeopathy</NativeText>
      <NativeText variant="caption">Traditional wellness products — consult a practitioner before use.</NativeText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <NativeButton label="Consult doctor" variant="secondary" onPress={() => onNavigate('doctors')} />
        <NativeButton label="Wellness offers" variant="secondary" onPress={() => onNavigate('deals')} />
      </View>
      {ctx.viewState === 'loading' ? <NativeLoadingState title="Loading wellness products" /> : null}
      {ctx.viewState === 'network' ? (
        <NativeEmptyState title="Could not load" description="Check your connection and try again." />
      ) : null}
      {ctx.viewState === 'idle' ? (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {(['all', 'ayurveda', 'homeopathy'] as const).map((type) => (
              <NativeButton
                key={type}
                label={type === 'all' ? 'All' : type.charAt(0).toUpperCase() + type.slice(1)}
                variant={tradition === type ? 'primary' : 'secondary'}
                onPress={() => setTradition(type)}
              />
            ))}
          </View>
          <ProductGrid items={items} onSelect={(item) => onOpenProduct(item.slug)} />
        </>
      ) : null}
    </View>
  );
}

export function MobileVaccinesScreen({
  ctx,
  country,
  onOpenProduct,
  onNavigate,
}: {
  ctx: FeatureCtx;
  country: string;
  onOpenProduct: (slug: string) => void;
  onNavigate: (target: string) => void;
}) {
  const [items, setItems] = useState<CatalogCard[]>([]);

  const load = useCallback(async () => {
    ctx.setViewState('loading');
    try {
      const catalog = await fetchCatalog(country);
      setItems(filterVaccineProducts(catalog.data));
      ctx.setViewState('idle');
    } catch {
      ctx.setViewState('network');
    }
  }, [country, ctx]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <View style={{ gap: 12 }}>
      <NativeText variant="h2">Adult Vaccines</NativeText>
      <NativeText variant="caption">Book flu, travel, HPV and more at partner clinics.</NativeText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <NativeButton label="Ask a doctor" variant="secondary" onPress={() => onNavigate('doctors')} />
        <NativeButton label="Lab bookings" variant="secondary" onPress={() => onNavigate('lab-bookings')} />
      </View>
      {ctx.viewState === 'loading' ? <NativeLoadingState title="Loading vaccines" /> : null}
      {ctx.viewState === 'network' ? (
        <NativeEmptyState title="Could not load" description="Check your connection and try again." />
      ) : null}
      {ctx.viewState === 'idle' ? (
        <ProductGrid items={items} onSelect={(item) => onOpenProduct(item.slug)} />
      ) : null}
    </View>
  );
}

export function SpecialityProgramsScreen({
  ctx,
  onNeedAuth,
}: {
  ctx: FeatureCtx;
  onNeedAuth?: () => void;
}) {
  const [programs, setPrograms] = useState<Array<{ id: string; name: string; description: string; features: string[] }>>([]);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    ctx.setViewState('loading');
    const result = await fetchPublicSpecialityPrograms(ctx.country);
    if (!result.ok) {
      ctx.setViewState('network');
      return;
    }
    setPrograms(result.data.programs ?? []);
    ctx.setViewState('idle');
  }, [ctx]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <View style={{ gap: 12 }}>
      <NativeText variant="h2">Speciality programs</NativeText>
      <NativeText variant="caption">Browse without signing in. Enrol is a sandbox request, not a live clinic booking.</NativeText>
      {message ? <NativeText variant="caption">{message}</NativeText> : null}
      {ctx.viewState === 'loading' ? <NativeLoadingState title="Loading programs" /> : null}
      {programs.map((program) => (
        <NativeCard key={program.id}>
          <NativeText variant="h2">{program.name}</NativeText>
          <NativeText variant="caption">{program.description}</NativeText>
          <NativeButton
            label={ctx.token ? 'Enrol in sandbox' : 'Sign in to enrol'}
            variant="secondary"
            onPress={() =>
              void (async () => {
                if (!ctx.token) {
                  onNeedAuth?.();
                  return;
                }
                const result = await enrollSpecialityProgram(ctx.token, program.id, ctx.country, ctx.onUnauthorized);
                setMessage(result.ok ? result.data.message : result.error);
              })()
            }
          />
        </NativeCard>
      ))}
    </View>
  );
}
