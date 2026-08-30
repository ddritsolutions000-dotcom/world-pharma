import { useCallback, useEffect, useMemo, useState } from 'react';
import { SafeAreaView, View } from 'react-native';
import { createSessionStore, requestOtp, verifyOtp } from '@world-pharma/shell-core';
import {
  NativeButton,
  NativeCard,
  NativeEmptyState,
  NativeInput,
  NativeLoadingState,
  NativeNetworkErrorState,
  NativePermissionDeniedState,
  NativeSessionExpiredState,
  NativeText,
} from '@world-pharma/ui-kit/native';
import {
  AccountHubScreen,
  AddressesScreen,
  AppointmentDetailScreen,
  AppointmentsListScreen,
  ConsentScreen,
  DoctorsScreen,
  ImagingBookingDetailScreen,
  ImagingBookingsScreen,
  ImagingBrowseScreen,
  LabBookingDetailScreen,
  LabBookingsScreen,
  LabBrowseScreen,
  PreferencesScreen,
  PrescriptionDetailScreen,
  PrescriptionsListScreen,
  PrivacyScreen,
  ProfileEditScreen,
  SupportScreen,
  type FeatureCtx,
} from './customer-features';
import { WishlistScreen } from './wishlist-features';
import { ProductReviewsPanel } from './reviews-features';
import { HealthArtifactDetailScreen, HealthHomeScreen } from './health-features';
import { CareNavigationScreen } from './care-nav-features';
import {
  HelpArticleScreen,
  HelpCategoryScreen,
  HelpHomeScreen,
  HelpSearchScreen,
  type HelpCtx,
} from './help-features';
import {
  CommerceApiError,
  addCartItem,
  fetchCart,
  fetchCatalog,
  fetchOrders,
  fetchProduct,
  fetchShipments,
  newIdempotencyKey,
  payCheckout,
  searchCatalog,
  searchDiscovery,
  startCheckout,
  type CatalogCard,
  type CheckoutSession,
} from './commerce-api';
import {
  MAIN_NAV,
  MORE_NAV,
  PUBLIC_HELP_SCREENS,
  resolveMobileScreen,
  type MobileScreen,
  type ViewState,
} from './navigation';

const COUNTRY = 'XX';
const CARE_COUNTRY = 'DQ';

function ScreenState({ viewState, onRetry }: { viewState: ViewState; onRetry?: () => void }) {
  if (viewState === 'loading') {
    return <NativeLoadingState title="Loading" />;
  }
  if (viewState === 'network') {
    return <NativeNetworkErrorState onRetry={onRetry} />;
  }
  if (viewState === 'forbidden') {
    return <NativePermissionDeniedState />;
  }
  return null;
}

export function App() {
  const store = useMemo(() => createSessionStore(), []);
  const [session, setSession] = useState(store.snapshot());
  const [route, setRoute] = useState<MobileScreen>('home');
  const [appointmentId, setAppointmentId] = useState<string | null>(null);
  const [prescriptionId, setPrescriptionId] = useState<string | null>(null);
  const [labBookingId, setLabBookingId] = useState<string | null>(null);
  const [imagingBookingId, setImagingBookingId] = useState<string | null>(null);
  const [healthArtifactId, setHealthArtifactId] = useState<string | null>(null);
  const [helpCategorySlug, setHelpCategorySlug] = useState<string | null>(null);
  const [helpArticleSlug, setHelpArticleSlug] = useState<string | null>(null);
  const [helpSearchQuery, setHelpSearchQuery] = useState('');
  const [helpViewState, setHelpViewState] = useState<ViewState>('idle');
  const screen = resolveMobileScreen(session, route);

  const [email, setEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [signInError, setSignInError] = useState<string | null>(null);
  const [signInLoading, setSignInLoading] = useState(false);

  const [viewState, setViewState] = useState<ViewState>('idle');
  const [rows, setRows] = useState<string[]>([]);
  const [summary, setSummary] = useState<string | null>(null);
  const [catalogItems, setCatalogItems] = useState<CatalogCard[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [productSlug, setProductSlug] = useState('');
  const [productDetail, setProductDetail] = useState<string | null>(null);
  const [productItemId, setProductItemId] = useState<string | null>(null);
  const [checkoutSession, setCheckoutSession] = useState<CheckoutSession | null>(null);

  const token = store.getAccessToken();

  const syncSession = useCallback(() => setSession(store.snapshot()), [store]);

  const onUnauthorized = useCallback(() => {
    store.expire();
    syncSession();
  }, [store, syncSession]);

  const signOut = useCallback(() => {
    store.signOut();
    syncSession();
    setRoute('home');
    setAppointmentId(null);
  }, [store, syncSession]);

  const featureCtx: FeatureCtx = useMemo(
    () => ({
      token: token ?? '',
      onUnauthorized,
      viewState,
      setViewState,
      onBack: () => setRoute('account'),
      signOut,
    }),
    [token, onUnauthorized, viewState, signOut],
  );

  const helpCtx: HelpCtx = useMemo(
    () => ({
      viewState: helpViewState,
      setViewState: setHelpViewState,
      onBack: () => {
        if (helpArticleSlug) {
          setHelpArticleSlug(null);
          setRoute(helpCategorySlug ? 'help-category' : 'help-home');
          return;
        }
        if (helpCategorySlug) {
          setHelpCategorySlug(null);
          setRoute('help-home');
          return;
        }
        setRoute('help-home');
      },
      onOpenCategory: (slug) => {
        setHelpCategorySlug(slug);
        setRoute('help-category');
      },
      onOpenArticle: (slug) => {
        setHelpArticleSlug(slug);
        setRoute('help-article');
      },
      onOpenSearch: () => setRoute('help-search'),
      onExitApp: () => setRoute(session.status === 'authenticated' ? 'account' : 'home'),
    }),
    [helpArticleSlug, helpCategorySlug, helpViewState, session.status],
  );

  const handleApiError = useCallback(
    (err: unknown) => {
      if (err instanceof CommerceApiError) {
        if (err.status === 403) {
          setViewState('forbidden');
          return;
        }
        if (err.status === 401) {
          onUnauthorized();
          return;
        }
      }
      setViewState('network');
    },
    [onUnauthorized],
  );

  const commerceScreens: MobileScreen[] = ['home', 'search', 'product', 'cart', 'checkout', 'orders', 'shipments'];

  const loadCommerce = useCallback(async () => {
    if (!token || !commerceScreens.includes(screen)) {
      return;
    }
    setViewState('loading');
    try {
      if (screen === 'home') {
        const catalog = await fetchCatalog(COUNTRY);
        setCatalogItems(catalog.data ?? []);
        setSummary(catalog.country_enabled ? `${catalog.data.length} products` : 'Catalog disabled');
        setRows(catalog.data.map((item) => item.title));
      } else if (screen === 'search') {
        if (!searchQuery.trim()) {
          setRows([]);
          setSummary('Enter a search term');
        } else {
          const result = await searchDiscovery(COUNTRY, searchQuery.trim(), 'en', [
            'commerce',
            'help',
            'doctor',
            'lab',
            'test',
            'pharmacy',
          ]);
          const rows = result.data.map((row) => {
            const prefix =
              row.type === 'help'
                ? 'Help: '
                : row.type === 'doctor'
                  ? 'Doctor: '
                  : row.type === 'lab'
                    ? 'Lab: '
                    : row.type === 'test'
                      ? 'Test: '
                      : row.type === 'pharmacy'
                        ? 'Pharmacy: '
                        : '';
            return `${prefix}${row.title}`;
          });
          setRows(rows);
          setSummary(
            result.country_enabled && result.discovery_enabled
              ? `${result.data.length} results`
              : 'Discovery disabled',
          );
        }
      } else if (screen === 'product') {
        if (!productSlug.trim()) {
          setProductDetail('Enter a product slug');
          setProductItemId(null);
        } else {
          const product = await fetchProduct(COUNTRY, productSlug.trim());
          setProductDetail(String(product.title ?? productSlug));
          setProductItemId(typeof product.id === 'string' ? product.id : null);
        }
        setRows([]);
      } else if (screen === 'cart') {
        const cart = (await fetchCart(token, COUNTRY)) as {
          items?: Array<{ title: string; qty: number; currency: string; sell_minor: string | null }>;
        };
        setRows((cart.items ?? []).map((item) => `${item.title} × ${item.qty} — ${item.currency} ${item.sell_minor ?? '—'}`));
        setSummary(cart.items?.length ? 'Cart ready' : 'Cart empty');
      } else if (screen === 'checkout') {
        const quote = await startCheckout(token, COUNTRY, newIdempotencyKey('checkout'));
        setCheckoutSession(quote);
        setSummary(`Total ${quote.quote?.currency ?? ''} ${quote.quote?.total_minor ?? '—'}`);
        setRows(quote.id ? [`Session ${quote.id}`] : []);
      } else if (screen === 'orders') {
        const orders = await fetchOrders(token);
        setRows(orders.data.map((row) => `${row.order_number} — ${row.status}`));
        setSummary(`${orders.data.length} orders`);
      } else if (screen === 'shipments') {
        const shipments = await fetchShipments(token);
        setRows(shipments.data.map((row) => `${row.status} · ${row.tracking_number ?? 'pending'}`));
        setSummary(`${shipments.data.length} shipments`);
      }
      setViewState('idle');
    } catch (err) {
      handleApiError(err);
    }
  }, [handleApiError, productSlug, screen, searchQuery, token]);

  useEffect(() => {
    if (session.status === 'authenticated' && commerceScreens.includes(screen)) {
      void loadCommerce();
    }
  }, [loadCommerce, screen, session.status]);

  async function sendOtp() {
    setSignInLoading(true);
    setSignInError(null);
    try {
      const result = await requestOtp(email, 'LOGIN');
      setChallengeId(result.challengeId);
      if (result.devCode) {
        setOtpCode(result.devCode);
      }
    } catch {
      setSignInError('Could not send OTP.');
    } finally {
      setSignInLoading(false);
    }
  }

  async function verifySignIn() {
    if (!challengeId) {
      await sendOtp();
      return;
    }
    setSignInLoading(true);
    setSignInError(null);
    try {
      const result = await verifyOtp(challengeId, otpCode, 'customer');
      store.authenticate({
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        audience: 'customer',
      });
      syncSession();
      setRoute('home');
    } catch {
      setSignInError('Invalid or expired code.');
    } finally {
      setSignInLoading(false);
    }
  }

  if (screen === 'welcome') {
    return (
      <SafeAreaView style={{ flex: 1 }} accessibilityLabel="World Pharma mobile">
        <View style={{ flex: 1, padding: 16, gap: 12 }}>
          <NativeText variant="h1">World Pharma</NativeText>
          <NativeCard>
            <NativeText variant="caption">Sign in with OTP to shop, track orders, and manage your account.</NativeText>
            <NativeInput label="Email" value={email} onChangeText={setEmail} />
            {challengeId ? <NativeInput label="One-time code" value={otpCode} onChangeText={setOtpCode} /> : null}
            {!challengeId ? (
              <NativeButton label={signInLoading ? 'Sending…' : 'Send OTP'} onPress={() => void sendOtp()} />
            ) : (
              <NativeButton label={signInLoading ? 'Signing in…' : 'Verify & sign in'} onPress={() => void verifySignIn()} />
            )}
            {signInError ? <NativeNetworkErrorState description={signInError} onRetry={() => setSignInError(null)} /> : null}
          </NativeCard>
          <NativeButton label="Browse Help Center" variant="secondary" onPress={() => setRoute('help-home')} />
        </View>
      </SafeAreaView>
    );
  }

  if (PUBLIC_HELP_SCREENS.includes(screen)) {
    return (
      <SafeAreaView style={{ flex: 1 }} accessibilityLabel="World Pharma help">
        <View style={{ flex: 1, padding: 16, gap: 12 }}>
          {screen === 'help-home' ? <HelpHomeScreen ctx={helpCtx} /> : null}
          {screen === 'help-category' && helpCategorySlug ? (
            <HelpCategoryScreen ctx={helpCtx} categorySlug={helpCategorySlug} />
          ) : null}
          {screen === 'help-article' && helpArticleSlug ? (
            <HelpArticleScreen ctx={helpCtx} articleSlug={helpArticleSlug} />
          ) : null}
          {screen === 'help-search' ? (
            <HelpSearchScreen ctx={helpCtx} initialQuery={helpSearchQuery} />
          ) : null}
          {screen === 'help-category' && !helpCategorySlug ? (
            <NativeEmptyState title="Category unavailable" description="Choose a category from help home." />
          ) : null}
          {screen === 'help-article' && !helpArticleSlug ? (
            <NativeEmptyState title="Article unavailable" description="Choose an article from help home." />
          ) : null}
        </View>
      </SafeAreaView>
    );
  }

  if (screen === 'expired') {
    return (
      <SafeAreaView style={{ flex: 1 }}>
        <NativeSessionExpiredState onAction={signOut} />
      </SafeAreaView>
    );
  }

  if (screen === 'forbidden') {
    return (
      <SafeAreaView style={{ flex: 1 }}>
        <NativePermissionDeniedState description="Customer access is required for this app." />
        <View style={{ padding: 16 }}>
          <NativeButton label="Sign out" variant="secondary" onPress={signOut} />
        </View>
      </SafeAreaView>
    );
  }

  const featureScreens: MobileScreen[] = [
    'account',
    'privacy',
    'consent',
    'preferences',
    'wishlist',
    'support',
    'addresses',
    'profile-edit',
    'doctors',
    'appointments',
    'appointment-detail',
    'prescriptions',
    'prescription-detail',
    'lab',
    'lab-bookings',
    'lab-booking-detail',
    'imaging',
    'imaging-bookings',
    'imaging-booking-detail',
    'health-home',
    'health-artifact-detail',
    'care-navigation',
    'help-home',
    'help-category',
    'help-article',
    'help-search',
  ];

  return (
    <SafeAreaView style={{ flex: 1 }} accessibilityLabel="World Pharma customer">
      <View style={{ flex: 1, padding: 16, gap: 12 }}>
        <NativeText variant="h1">World Pharma</NativeText>

        {!featureScreens.includes(screen) || screen === 'account' ? (
          <>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {MAIN_NAV.map((item) => (
                <View key={item}>
                  <NativeButton
                    label={item}
                    variant={route === item ? 'primary' : 'secondary'}
                    onPress={() => {
                      setRoute(item);
                      setAppointmentId(null);
                      setPrescriptionId(null);
                    }}
                  />
                </View>
              ))}
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {MORE_NAV.map((item) => (
                <View key={item}>
                  <NativeButton
                    label={item}
                    variant={route === item ? 'primary' : 'secondary'}
                    onPress={() => {
                      setRoute(item);
                      setAppointmentId(null);
                      setPrescriptionId(null);
                    }}
                  />
                </View>
              ))}
            </View>
          </>
        ) : (
          <NativeButton label="Back to main" variant="secondary" onPress={() => setRoute('account')} />
        )}

        {screen === 'privacy' ? <PrivacyScreen ctx={featureCtx} /> : null}
        {screen === 'consent' ? <ConsentScreen ctx={featureCtx} /> : null}
        {screen === 'preferences' ? <PreferencesScreen ctx={featureCtx} /> : null}
        {screen === 'wishlist' ? <WishlistScreen ctx={featureCtx} country={COUNTRY} /> : null}
        {screen === 'support' ? <SupportScreen ctx={featureCtx} /> : null}
        {screen === 'addresses' ? <AddressesScreen ctx={featureCtx} country={COUNTRY} /> : null}
        {screen === 'profile-edit' ? <ProfileEditScreen ctx={featureCtx} /> : null}
        {screen === 'account' ? (
          <AccountHubScreen
            ctx={featureCtx}
            country={COUNTRY}
            onNavigate={(target) => setRoute(target)}
          />
        ) : null}
        {screen === 'doctors' ? (
          <DoctorsScreen ctx={featureCtx} country={CARE_COUNTRY} onBooked={() => setRoute('appointments')} />
        ) : null}
        {screen === 'appointments' ? (
          <AppointmentsListScreen
            ctx={featureCtx}
            onOpen={(id) => {
              setAppointmentId(id);
              setRoute('appointment-detail');
            }}
          />
        ) : null}
        {screen === 'appointment-detail' && appointmentId ? (
          <AppointmentDetailScreen
            ctx={featureCtx}
            appointmentId={appointmentId}
            onBack={() => {
              setAppointmentId(null);
              setRoute('appointments');
            }}
          />
        ) : null}
        {screen === 'prescriptions' ? (
          <PrescriptionsListScreen
            ctx={featureCtx}
            onOpen={(id) => {
              setPrescriptionId(id);
              setRoute('prescription-detail');
            }}
          />
        ) : null}
        {screen === 'prescription-detail' && prescriptionId ? (
          <PrescriptionDetailScreen
            ctx={featureCtx}
            prescriptionId={prescriptionId}
            onBack={() => {
              setPrescriptionId(null);
              setRoute('prescriptions');
            }}
            onContinueCheckout={() => {
              setPrescriptionId(null);
              setRoute('checkout');
            }}
            onViewOrders={() => {
              setPrescriptionId(null);
              setRoute('orders');
            }}
          />
        ) : null}
        {screen === 'lab' ? (
          <LabBrowseScreen ctx={featureCtx} onOpenBookings={() => setRoute('lab-bookings')} />
        ) : null}
        {screen === 'lab-bookings' ? (
          <LabBookingsScreen
            ctx={featureCtx}
            onOpen={(id) => {
              setLabBookingId(id);
              setRoute('lab-booking-detail');
            }}
          />
        ) : null}
        {screen === 'lab-booking-detail' && labBookingId ? (
          <LabBookingDetailScreen
            ctx={featureCtx}
            bookingId={labBookingId}
            onBack={() => {
              setLabBookingId(null);
              setRoute('lab-bookings');
            }}
          />
        ) : null}
        {screen === 'imaging' ? (
          <ImagingBrowseScreen ctx={featureCtx} onOpenBookings={() => setRoute('imaging-bookings')} />
        ) : null}
        {screen === 'imaging-bookings' ? (
          <ImagingBookingsScreen
            ctx={featureCtx}
            onOpen={(id) => {
              setImagingBookingId(id);
              setRoute('imaging-booking-detail');
            }}
          />
        ) : null}
        {screen === 'imaging-booking-detail' && imagingBookingId ? (
          <ImagingBookingDetailScreen
            ctx={featureCtx}
            bookingId={imagingBookingId}
            onBack={() => {
              setImagingBookingId(null);
              setRoute('imaging-bookings');
            }}
          />
        ) : null}
        {screen === 'health-home' ? (
          <HealthHomeScreen
            ctx={featureCtx}
            onOpenConsent={() => setRoute('consent')}
            onOpenCareNavigation={() => setRoute('care-navigation')}
            onOpenArtifact={(id) => {
              setHealthArtifactId(id);
              setRoute('health-artifact-detail');
            }}
          />
        ) : null}
        {screen === 'care-navigation' ? (
          <CareNavigationScreen ctx={featureCtx} onBack={() => setRoute('health-home')} />
        ) : null}
        {screen === 'help-home' ? <HelpHomeScreen ctx={helpCtx} /> : null}
        {screen === 'help-category' && helpCategorySlug ? (
          <HelpCategoryScreen ctx={helpCtx} categorySlug={helpCategorySlug} />
        ) : null}
        {screen === 'help-article' && helpArticleSlug ? (
          <HelpArticleScreen ctx={helpCtx} articleSlug={helpArticleSlug} />
        ) : null}
        {screen === 'help-search' ? (
          <HelpSearchScreen ctx={helpCtx} initialQuery={helpSearchQuery} />
        ) : null}

        {screen === 'health-artifact-detail' && healthArtifactId ? (
          <HealthArtifactDetailScreen
            ctx={featureCtx}
            artifactId={healthArtifactId}
            onBack={() => {
              setHealthArtifactId(null);
              setRoute('health-home');
            }}
          />
        ) : null}

        {commerceScreens.includes(screen) ? (
          <>
            <ScreenState viewState={viewState} onRetry={() => void loadCommerce()} />
            {screen === 'search' && viewState === 'idle' ? (
              <NativeCard>
                <NativeInput label="Search" value={searchQuery} onChangeText={setSearchQuery} />
                <NativeButton label="Search catalog" onPress={() => void loadCommerce()} />
              </NativeCard>
            ) : null}
            {screen === 'product' && viewState === 'idle' ? (
              <>
                <NativeCard>
                  <NativeInput label="Product slug" value={productSlug} onChangeText={setProductSlug} />
                  <NativeButton label="Load product" onPress={() => void loadCommerce()} />
                  {productDetail ? <NativeText>{productDetail}</NativeText> : null}
                </NativeCard>
                {productItemId ? (
                  <ProductReviewsPanel ctx={featureCtx} itemId={productItemId} country={COUNTRY} />
                ) : null}
              </>
            ) : null}
            {screen === 'home' && viewState === 'idle' && catalogItems.length ? (
              <NativeCard>
                <NativeText variant="h2">Quick add</NativeText>
                <NativeButton
                  label="Add first item to cart"
                  onPress={() => {
                    const offer = catalogItems[0]?.offers[0];
                    if (!token || !offer) {
                      return;
                    }
                    void addCartItem(token, COUNTRY, offer.id, 1, newIdempotencyKey('cart'))
                      .then(() => setRoute('cart'))
                      .catch(handleApiError);
                  }}
                />
              </NativeCard>
            ) : null}
            {screen === 'checkout' && viewState === 'idle' ? (
              <>
                {checkoutSession?.skip_inventory_hold || checkoutSession?.dispensing_case_id ? (
                  <NativeCard>
                    <NativeText variant="caption">
                      Prescription order — inventory was reserved at dispense. Checkout completes your commercial order.
                    </NativeText>
                    {checkoutSession.dispensing_case_id ? (
                      <NativeText variant="caption">
                        {`Dispensing case: ${checkoutSession.dispensing_case_id.slice(0, 8)}…`}
                      </NativeText>
                    ) : null}
                  </NativeCard>
                ) : null}
                <NativeButton
                  label="Pay (sandbox success)"
                  onPress={() => {
                    if (!token) {
                      return;
                    }
                    void startCheckout(token, COUNTRY, newIdempotencyKey('checkout'))
                      .then((quote) => {
                        const id = quote.id;
                        if (!id) {
                          return;
                        }
                        return payCheckout(token, id, newIdempotencyKey('pay'), 'CARD', 'success');
                      })
                      .then(() => setRoute('orders'))
                      .catch(handleApiError);
                  }}
                />
              </>
            ) : null}
            {viewState === 'idle' && summary ? <NativeText>{summary}</NativeText> : null}
            {viewState === 'idle' && !rows.length ? (
              <NativeEmptyState title="Nothing here" description="No data for this view yet." actionLabel="Refresh" onAction={() => void loadCommerce()} />
            ) : null}
            {viewState === 'idle' ? rows.map((row) => (
              <View key={row}>
                <NativeText>{row}</NativeText>
              </View>
            )) : null}
          </>
        ) : null}

        <NativeButton label="Sign out" variant="secondary" onPress={signOut} />
      </View>
    </SafeAreaView>
  );
}
