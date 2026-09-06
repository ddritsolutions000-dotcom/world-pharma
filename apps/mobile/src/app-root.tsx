import { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, SafeAreaView, ScrollView, View } from 'react-native';
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
  nativeCanvas,
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
  SubscriptionsListScreen,
  PrivacyScreen,
  ProfileEditScreen,
  SupportScreen,
  type FeatureCtx,
} from './customer-features';
import { FamilyMembersScreen } from './family-member-features';
import { BuyAgainScreen, StoresScreen } from './buy-again-features';
import { MedicationRemindersScreen } from './medication-reminder-features';
import { WishlistScreen } from './wishlist-features';
import { RecentlyViewedScreen } from './recently-viewed-features';
import { HealthArtifactDetailScreen, HealthHomeScreen, HealthProfileScreen } from './health-features';
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
  fetchCart,
  fetchCatalog,
  fetchOrders,
  fetchProduct,
  newIdempotencyKey,
  searchCatalog,
  searchDiscovery,
  addCartItem,
  type CatalogCard,
  type CustomerCart,
  type DiscoveryResultItem,
} from './commerce-api';
import { DiscoverySearchResults, MobileProductDetailScreen } from './commerce-discovery';
import { fetchNotificationInbox } from './account-api';
import { unreadInboxCount } from './notification-inbox';
import { ShipmentsListScreen, ShipmentDetailScreen } from './shipment-features';
import { OrderDetailScreen } from './order-features';
import { newClickId, writeAffiliateAttribution, parseReferralCodeFromUrl } from './affiliate-attribution';
import {
  MAIN_NAV,
  PUBLIC_GUEST_SCREENS,
  PUBLIC_HELP_SCREENS,
  resolveMobileScreen,
  type MobileScreen,
  type ViewState,
} from './navigation';
import { AuthSignInScreen, AuthSignUpScreen, AuthWelcomeScreen } from './auth-screens';
import { CustomerSplashScreen } from './splash-screen';
import { MobileTabBar, MobileHomeHeader, ProductRail, ProductGrid, SearchScopeChips, MOBILE_SEARCH_SCOPES, TAB_ITEMS, TAB_ROOT_SCREENS, MobileCartPanel, SearchEmptyHints, OrderListCard } from './commerce-ui';
import { MobileHomeSummary } from './mobile-home-summary';
import type { MobileHealthDestination } from './health-utils';
import { mobileBreadcrumbLabel } from './mobile-breadcrumbs';
import { addGuestCartLine, GuestCartError, guestCartQty, guestLinesAsCartItems, readGuestCart, removeGuestCartLine } from './guest-cart';
import { useSelectedCountry } from './use-selected-country';
import {
  CountryPickerRow,
  DealsScreen,
  LoyaltyScreen,
  CarePlanScreen,
  MobileCheckoutScreen,
  MobileAyurvedaScreen,
  MobileCancerCareScreen,
  MobilePetCareScreen,
  MobileVaccinesScreen,
  SpecialityProgramsScreen,
  TrackOrderScreen,
} from './mobile-commerce-features';
import { formatMoney } from './format-money';
import { InboxScreen } from './inbox-screen';
import type { InboxDestination } from './notification-inbox';

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
  const { country, countries, setCountry, countryName } = useSelectedCountry();
  const [session, setSession] = useState(store.snapshot());
  const [showSplash, setShowSplash] = useState(true);
  const [route, setRoute] = useState<MobileScreen>('home');
  const [appointmentId, setAppointmentId] = useState<string | null>(null);
  const [prescriptionId, setPrescriptionId] = useState<string | null>(null);
  const [labBookingId, setLabBookingId] = useState<string | null>(null);
  const [shipmentId, setShipmentId] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [imagingBookingId, setImagingBookingId] = useState<string | null>(null);
  const [healthArtifactId, setHealthArtifactId] = useState<string | null>(null);
  const [helpCategorySlug, setHelpCategorySlug] = useState<string | null>(null);
  const [helpArticleSlug, setHelpArticleSlug] = useState<string | null>(null);
  const [helpSearchQuery, setHelpSearchQuery] = useState('');
  const [helpViewState, setHelpViewState] = useState<ViewState>('idle');
  const screen = resolveMobileScreen(session, route);

  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [signInError, setSignInError] = useState<string | null>(null);
  const [signInLoading, setSignInLoading] = useState(false);

  const resetAuthForm = useCallback(() => {
    setChallengeId(null);
    setOtpCode('');
    setSignInError(null);
  }, []);

  const openSignIn = useCallback(() => {
    resetAuthForm();
    setRoute('sign-in');
  }, [resetAuthForm]);

  const openSignUp = useCallback(() => {
    resetAuthForm();
    setRoute('sign-up');
  }, [resetAuthForm]);

  const openWelcome = useCallback(() => {
    resetAuthForm();
    setRoute('welcome');
  }, [resetAuthForm]);

  const [viewState, setViewState] = useState<ViewState>('idle');
  const [rows, setRows] = useState<string[]>([]);
  const [summary, setSummary] = useState<string | null>(null);
  const [catalogItems, setCatalogItems] = useState<CatalogCard[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchScope, setSearchScope] = useState<(typeof MOBILE_SEARCH_SCOPES)[number]['id']>('all');
  const [productSlug, setProductSlug] = useState('');
  const [productDetail, setProductDetail] = useState<string | null>(null);
  const [productItemId, setProductItemId] = useState<string | null>(null);
  const [productOffers, setProductOffers] = useState<
    Array<{
      id: string;
      seller_display_name?: string;
      seller_org_id?: string;
      currency?: string;
      price?: { sell_minor?: string };
    }>
  >([]);
  const [selectedProductOfferId, setSelectedProductOfferId] = useState<string | null>(null);
  const [discoveryResults, setDiscoveryResults] = useState<DiscoveryResultItem[]>([]);
  const [productRxRequired, setProductRxRequired] = useState(false);
  const [productReviewSummary, setProductReviewSummary] = useState<{ avg_rating: number | null; review_count: number } | null>(null);
  const [productServiceability, setProductServiceability] = useState<{ purchasable?: boolean; message?: string; medicine_eta?: string } | null>(null);
  const [inboxUnread, setInboxUnread] = useState(0);
  const [orderRows, setOrderRows] = useState<
    Array<{ id: string; order_number: string; status: string; total_minor: string; currency: string }>
  >([]);
  const [cartItems, setCartItems] = useState<CustomerCart['items']>([]);
  const [cartBump, setCartBump] = useState(0);

  const token = store.getAccessToken();
  const cartCount = token ? (cartItems?.length ?? 0) : guestCartQty(country);
  void cartBump;

  const addCatalogToCart = useCallback(
    async (item: CatalogCard) => {
      const offer = item.offers?.[0];
      if (!offer?.id) {
        throw new Error('unavailable');
      }
      if (token) {
        await addCartItem(token, country, offer.id, 1, newIdempotencyKey('cart'));
        setCartItems((prev) => [
          ...(prev ?? []),
          {
            id: offer.id,
            title: item.title,
            qty: 1,
            currency: offer.currency ?? 'XXX',
            sell_minor: String(offer.price?.sell_minor ?? '0'),
          },
        ]);
        return;
      }
      addGuestCartLine({
        offer_id: offer.id,
        qty: 1,
        title: item.title,
        currency: offer.currency ?? 'XXX',
        sell_minor: String(offer.price?.sell_minor ?? '0'),
        country,
      });
      setCartBump((n) => n + 1);
    },
    [country, token],
  );

  const syncSession = useCallback(() => setSession(store.snapshot()), [store]);

  const onUnauthorized = useCallback(() => {
    store.expire();
    syncSession();
  }, [store, syncSession]);

  useEffect(() => {
    function captureReferral(url: string) {
      const code = parseReferralCodeFromUrl(url);
      if (!code) {
        return;
      }
      writeAffiliateAttribution({
        referral_code: code,
        click_id: newClickId(),
        country_code: country,
        recorded_at: new Date().toISOString(),
      });
    }
    void Linking.getInitialURL().then((url) => {
      if (url) {
        captureReferral(url);
      }
    });
    const sub = Linking.addEventListener('url', ({ url }) => captureReferral(url));
    return () => sub.remove();
  }, [country]);

  useEffect(() => {
    if (!token || session.status !== 'authenticated') {
      setInboxUnread(0);
      return;
    }
    void fetchNotificationInbox({ token, onUnauthorized }).then((result) => {
      if (result.ok) {
        setInboxUnread(unreadInboxCount(result.data.data ?? []));
      }
    });
  }, [onUnauthorized, screen, session.status, token]);

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
      country,
    }),
    [token, onUnauthorized, viewState, signOut, country],
  );

  const helpCtx: HelpCtx = useMemo(
    () => ({
      viewState: helpViewState,
      setViewState: setHelpViewState,
      country,
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
    [country, helpArticleSlug, helpCategorySlug, helpViewState, session.status],
  );

  const handleApiError = useCallback(
    (err: unknown) => {
      if (err instanceof GuestCartError) {
        setViewState('idle');
        setSummary(err.message);
        return;
      }
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

  const handleHealthNavigate = useCallback(
    (destination: MobileHealthDestination) => {
      if (!destination) {
        return;
      }
      if (destination.screen === 'health-artifact-detail') {
        setHealthArtifactId(destination.artifactId);
        setRoute('health-artifact-detail');
        return;
      }
      if (destination.screen === 'appointment-detail') {
        setAppointmentId(destination.appointmentId);
        setRoute('appointment-detail');
        return;
      }
      if (destination.screen === 'lab-booking-detail') {
        setLabBookingId(destination.bookingId);
        setRoute('lab-booking-detail');
        return;
      }
      if (destination.screen === 'imaging-booking-detail') {
        setImagingBookingId(destination.bookingId);
        setRoute('imaging-booking-detail');
        return;
      }
      if (destination.screen === 'prescriptions') {
        setRoute('prescriptions');
        return;
      }
      if (destination.screen === 'orders') {
        setRoute('orders');
        return;
      }
      if (destination.screen === 'reminders') {
        setRoute('reminders');
        return;
      }
      if (destination.screen === 'care-plan') {
        setRoute('care-plan');
      }
    },
    [],
  );

  const showTabBar =
    TAB_ROOT_SCREENS.has(route) ||
    route === 'order-detail' ||
    route === 'cart' ||
    route === 'checkout';
  const commerceScreens: MobileScreen[] = ['home', 'search', 'product', 'cart', 'checkout', 'orders', 'deals', 'loyalty'];
  const guestCommerceScreens: MobileScreen[] = ['home', 'search', 'product', 'cart', 'deals'];

  const loadCommerce = useCallback(async () => {
    if (!commerceScreens.includes(screen)) {
      return;
    }
    if (!token && !guestCommerceScreens.includes(screen)) {
      return;
    }
    setViewState('loading');
    try {
      if (screen === 'home') {
        const catalog = await fetchCatalog(country);
        const medicines = (catalog.data ?? []).filter(
          (item) => !item.kind || item.kind === 'OTC' || item.kind === 'MEDICINE',
        );
        setCatalogItems(medicines);
        setSummary(catalog.country_enabled ? `${medicines.length} medicines` : 'Store unavailable');
        setRows([]);
      } else if (screen === 'search') {
        if (!searchQuery.trim()) {
          const catalog = await fetchCatalog(country);
          const medicines = (catalog.data ?? []).filter(
            (item) => !item.kind || item.kind === 'OTC' || item.kind === 'MEDICINE',
          );
          setCatalogItems(medicines);
          setDiscoveryResults([]);
          setSummary(catalog.country_enabled ? 'Search medicines, labs, and doctors' : 'Store unavailable');
          setRows([]);
        } else {
          const types = MOBILE_SEARCH_SCOPES.find((row) => row.id === searchScope)?.types ?? [
            'commerce',
            'help',
            'doctor',
            'lab',
            'test',
            'pharmacy',
          ];
          const result = await searchDiscovery(country, searchQuery.trim(), 'en', types, {
            sort: searchScope === 'commerce' ? 'relevance' : undefined,
          });
          setDiscoveryResults(result.data);
          setSummary(
            result.country_enabled && result.discovery_enabled
              ? `${result.data.length} results`
              : 'Discovery disabled',
          );
        }
      } else if (screen === 'product') {
        if (!productSlug.trim()) {
          setProductDetail(null);
          setProductItemId(null);
          setProductOffers([]);
          setSelectedProductOfferId(null);
          setRows([]);
        } else {
          const product = await fetchProduct(country, productSlug.trim());
          const offers = (product.offers as Array<{
            id?: string;
            seller_display_name?: string;
            seller_org_id?: string;
            currency?: string;
            strength?: string | null;
            pack_size?: string | null;
            price?: { sell_minor?: string; list_minor?: string | null };
            inventory?: { available?: boolean; qty?: number };
          }>) ?? [];
          const ranked = [...offers].sort(
            (a, b) => Number(a.price?.sell_minor ?? Number.POSITIVE_INFINITY) - Number(b.price?.sell_minor ?? Number.POSITIVE_INFINITY),
          );
          const offer = ranked[0] ?? offers[0];
          const price = offer?.price;
          setProductOffers(offers.filter((row): row is typeof offers[number] & { id: string } => Boolean(row.id)).map((row) => ({
            id: row.id as string,
            seller_display_name: row.seller_display_name,
            seller_org_id: (row as { seller_org_id?: string }).seller_org_id,
            currency: row.currency,
            strength: row.strength,
            pack_size: row.pack_size,
            price: row.price,
            inventory: row.inventory,
          })));
          setSelectedProductOfferId(offer?.id ?? null);
          setProductDetail(String(product.title ?? productSlug));
          setProductItemId(typeof product.id === 'string' ? product.id : null);
          setProductRxRequired(Boolean(product.rx_required));
          setProductReviewSummary(
            (product.review_summary as { avg_rating: number | null; review_count: number } | undefined) ?? null,
          );
          setProductServiceability(
            (product.serviceability as { purchasable?: boolean; message?: string; medicine_eta?: string } | null) ?? null,
          );
          setRows([]);
        }
      } else if (screen === 'cart') {
        if (!token) {
          const items = guestLinesAsCartItems(readGuestCart(country));
          setCartItems(items);
          setRows(
            items.map(
              (item) =>
                `${item.title} × ${item.qty} — ${formatMoney(Number(item.sell_minor ?? 0) * item.qty, item.currency ?? 'XXX')}`,
            ),
          );
          setSummary(items.length ? `${items.length} items in cart` : 'Your cart is empty');
        } else {
        const cart = (await fetchCart(token, country)) as CustomerCart;
        setCartItems(cart.items ?? []);
        setRows(
          (cart.items ?? []).map(
            (item) =>
              `${item.title} × ${item.qty} — ${formatMoney(Number(item.sell_minor ?? 0) * item.qty, item.currency ?? 'XXX')}`,
          ),
        );
        setSummary(cart.items?.length ? `${cart.items.length} items in cart` : 'Your cart is empty');
        }
      } else if (screen === 'orders') {
        if (!token) {
          return;
        }
        const orders = await fetchOrders(token);
        setOrderRows(orders.data);
        setRows(orders.data.map((row) => `${row.order_number} — ${row.status}`));
        setSummary(`${orders.data.length} orders`);
      } else if (screen === 'checkout') {
        setSummary('Review delivery and pay');
        setRows([]);
      }
      setViewState('idle');
    } catch (err) {
      handleApiError(err);
    }
  }, [country, handleApiError, productSlug, screen, searchQuery, searchScope, token]);

  useEffect(() => {
    if (guestCommerceScreens.includes(screen) || (session.status === 'authenticated' && commerceScreens.includes(screen))) {
      void loadCommerce();
    }
  }, [loadCommerce, screen, session.status]);

  async function sendOtp(purpose: 'LOGIN' | 'REGISTER' = screen === 'sign-up' ? 'REGISTER' : 'LOGIN') {
    setSignInLoading(true);
    setSignInError(null);
    try {
      const result = await requestOtp(email, purpose);
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
      await sendOtp(screen === 'sign-up' ? 'REGISTER' : 'LOGIN');
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
      const pending = readGuestCart(country);
      if (pending.length) {
        try {
          for (const line of pending) {
            try {
              await addCartItem(result.accessToken, country, line.offer_id, line.qty, newIdempotencyKey('guest-merge'));
              removeGuestCartLine(country, line.offer_id);
            } catch (err) {
              if (err instanceof CommerceApiError && (err.code === 'CART_SELLER_CONFLICT' || err.status === 409)) {
                continue;
              }
              throw err;
            }
          }
          setRoute('cart');
        } catch {
          setRoute('cart');
        }
      } else {
        setRoute('home');
      }
    } catch {
      setSignInError('Invalid or expired code.');
    } finally {
      setSignInLoading(false);
    }
  }

  const authForm = {
    email,
    otpCode,
    challengeId,
    loading: signInLoading,
    error: signInError,
    onEmail: setEmail,
    onOtp: setOtpCode,
    onSendOtp: () => void sendOtp(screen === 'sign-up' ? 'REGISTER' : 'LOGIN'),
    onVerify: () => void verifySignIn(),
    onClearError: () => setSignInError(null),
  };

  if (showSplash) {
    return (
      <CustomerSplashScreen
        onDone={() => {
          setShowSplash(false);
          if (session.status !== 'authenticated') {
            setRoute('welcome');
          }
        }}
      />
    );
  }

  if (screen === 'welcome') {
    return <AuthWelcomeScreen onSignIn={openSignIn} onSignUp={openSignUp} onBrowse={() => setRoute('home')} />;
  }

  if (screen === 'sign-in') {
    return (
      <AuthSignInScreen
        {...authForm}
        onBack={openWelcome}
        onGoSignUp={openSignUp}
      />
    );
  }

  if (screen === 'sign-up') {
    return (
      <AuthSignUpScreen
        {...authForm}
        displayName={displayName}
        onDisplayName={setDisplayName}
        onBack={openWelcome}
        onGoSignIn={openSignIn}
      />
    );
  }

  if (PUBLIC_GUEST_SCREENS.includes(screen) && screen === 'track-order') {
    return (
      <SafeAreaView style={{ flex: 1 }} accessibilityLabel="Track order">
        <View style={{ flex: 1, padding: 16, gap: 12 }}>
          <TrackOrderScreen onBack={() => setRoute('home')} />
        </View>
      </SafeAreaView>
    );
  }

  if (PUBLIC_GUEST_SCREENS.includes(screen) && screen === 'stores' && session.status !== 'authenticated') {
    return (
      <SafeAreaView style={{ flex: 1 }} accessibilityLabel="Home delivery">
        <View style={{ flex: 1, padding: 16, gap: 12 }}>
          <StoresScreen country={country} />
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
    'inbox',
    'privacy',
    'consent',
    'preferences',
    'wishlist',
    'recently-viewed',
    'support',
    'addresses',
    'profile-edit',
    'doctors',
    'appointments',
    'appointment-detail',
    'prescriptions',
    'prescription-detail',
    'subscriptions',
    'reminders',
    'family',
    'buy-again',
    'stores',
    'lab',
    'lab-bookings',
    'lab-booking-detail',
    'shipments',
    'shipment-detail',
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
    'deals',
    'loyalty',
    'care-plan',
    'programs',
    'pet-care',
    'cancer-care',
    'ayurveda',
    'vaccines',
    'track-order',
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: nativeCanvas }} accessibilityLabel="World Pharma customer">
      <View style={{ flex: 1 }}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 28 }} keyboardShouldPersistTaps="handled">
        {screen !== 'home' ? (
          <NativeText variant="caption" style={{ color: '#767676' }}>
            {mobileBreadcrumbLabel(screen)}
          </NativeText>
        ) : null}

        {!featureScreens.includes(screen) || screen === 'account' || screen === 'inbox' || TAB_ROOT_SCREENS.has(screen) ? null : (
          <NativeButton label="← Back" variant="secondary" onPress={() => setRoute('home')} />
        )}

        {screen === 'privacy' ? <PrivacyScreen ctx={featureCtx} /> : null}
        {screen === 'consent' ? <ConsentScreen ctx={featureCtx} /> : null}
        {screen === 'preferences' ? <PreferencesScreen ctx={featureCtx} /> : null}
        {screen === 'inbox' ? (
          <InboxScreen
            ctx={featureCtx}
            onOpenDestination={(target: InboxDestination) => {
              if (typeof target === 'object' && target.screen === 'lab-booking-detail') {
                setLabBookingId(target.bookingId);
                setRoute('lab-booking-detail');
                return;
              }
              if (typeof target === 'object' && target.screen === 'imaging-booking-detail') {
                setImagingBookingId(target.bookingId);
                setRoute('imaging-booking-detail');
                return;
              }
              if (typeof target === 'object' && target.screen === 'appointment-detail') {
                setAppointmentId(target.appointmentId);
                setRoute('appointment-detail');
                return;
              }
              if (typeof target === 'object' && target.screen === 'shipment-detail') {
                setShipmentId(target.shipmentId);
                setRoute('shipment-detail');
                return;
              }
              if (typeof target === 'object' && target.screen === 'order-detail') {
                setOrderId(target.orderId);
                setRoute('order-detail');
                return;
              }
              if (typeof target === 'object' && target.screen === 'health-artifact-detail') {
                setHealthArtifactId(target.artifactId);
                setRoute('health-artifact-detail');
                return;
              }
              setRoute(target);
            }}
          />
        ) : null}
        {screen === 'wishlist' ? <WishlistScreen ctx={featureCtx} country={country} /> : null}
        {screen === 'recently-viewed' ? <RecentlyViewedScreen ctx={featureCtx} country={country} /> : null}
        {screen === 'support' ? <SupportScreen ctx={featureCtx} /> : null}
        {screen === 'addresses' ? <AddressesScreen ctx={featureCtx} country={country} /> : null}
        {screen === 'profile-edit' ? <ProfileEditScreen ctx={featureCtx} /> : null}
        {screen === 'account' ? (
          <AccountHubScreen
            ctx={featureCtx}
            country={country}
            onSignIn={openSignIn}
            onSignUp={openSignUp}
            onNavigate={(target) => {
              setRoute(target);
            }}
          />
        ) : null}
        {screen === 'loyalty' ? <LoyaltyScreen ctx={featureCtx} country={country} /> : null}
        {screen === 'care-plan' ? (
          <CarePlanScreen
            ctx={featureCtx}
            country={country}
            onOpenLoyalty={() => setRoute(token ? 'loyalty' : 'sign-in')}
            onNeedAuth={openSignIn}
          />
        ) : null}
        {screen === 'programs' ? (
          <SpecialityProgramsScreen ctx={featureCtx} onNeedAuth={openSignIn} />
        ) : null}
        {screen === 'track-order' ? (
          <TrackOrderScreen onBack={() => setRoute('account')} />
        ) : null}
        {screen === 'doctors' ? (
          <DoctorsScreen ctx={featureCtx} onBooked={() => setRoute('appointments')} onNeedAuth={openSignIn} />
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
            onOpenSubscriptions={() => setRoute('subscriptions')}
          />
        ) : null}
        {screen === 'subscriptions' ? (
          <SubscriptionsListScreen
            ctx={featureCtx}
            onOpenPrescription={(id) => {
              setPrescriptionId(id);
              setRoute('prescription-detail');
            }}
          />
        ) : null}
        {screen === 'reminders' ? (
          <MedicationRemindersScreen
            ctx={featureCtx}
            country={country}
            onOpenSubscriptions={() => setRoute('subscriptions')}
          />
        ) : null}
        {screen === 'family' ? <FamilyMembersScreen ctx={featureCtx} country={country} /> : null}
        {screen === 'buy-again' ? <BuyAgainScreen ctx={featureCtx} country={country} /> : null}
        {screen === 'stores' ? <StoresScreen country={country} /> : null}
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
          <LabBrowseScreen
            ctx={featureCtx}
            onOpenBookings={() => setRoute(token ? 'lab-bookings' : 'sign-in')}
            onOpenPrograms={() => setRoute('programs')}
            onNeedAuth={openSignIn}
            onSignUp={openSignUp}
          />
        ) : null}
        {screen === 'pet-care' ? (
          <MobilePetCareScreen
            ctx={featureCtx}
            country={country}
            onOpenProduct={(slug) => {
              setProductSlug(slug);
              setRoute('product');
            }}
          />
        ) : null}
        {screen === 'cancer-care' ? (
          <MobileCancerCareScreen
            ctx={featureCtx}
            country={country}
            onOpenProduct={(slug) => {
              setProductSlug(slug);
              setRoute('product');
            }}
            onNavigate={(target) => setRoute(target as typeof route)}
          />
        ) : null}
        {screen === 'ayurveda' ? (
          <MobileAyurvedaScreen
            ctx={featureCtx}
            country={country}
            onOpenProduct={(slug) => {
              setProductSlug(slug);
              setRoute('product');
            }}
            onNavigate={(target) => setRoute(target as typeof route)}
          />
        ) : null}
        {screen === 'vaccines' ? (
          <MobileVaccinesScreen
            ctx={featureCtx}
            country={country}
            onOpenProduct={(slug) => {
              setProductSlug(slug);
              setRoute('product');
            }}
            onNavigate={(target) => setRoute(target as typeof route)}
          />
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
        {screen === 'shipments' ? (
          <ShipmentsListScreen
            ctx={featureCtx}
            onOpen={(id) => {
              setShipmentId(id);
              setRoute('shipment-detail');
            }}
          />
        ) : null}
        {screen === 'shipment-detail' && shipmentId ? (
          <ShipmentDetailScreen
            ctx={featureCtx}
            shipmentId={shipmentId}
            onBack={() => {
              setShipmentId(null);
              setRoute('shipments');
            }}
          />
        ) : null}
        {screen === 'order-detail' && orderId ? (
          <OrderDetailScreen ctx={featureCtx} orderId={orderId} country={country} />
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
            onNavigate={handleHealthNavigate}
            onOpenAppointments={() => setRoute('appointments')}
            onOpenPrescriptions={() => setRoute('prescriptions')}
            onOpenLabBookings={() => setRoute('lab-bookings')}
            onOpenImagingBookings={() => setRoute('imaging-bookings')}
            onOpenOrders={() => setRoute('orders')}
            onOpenReminders={() => setRoute('reminders')}
            onOpenCarePlan={() => setRoute('care-plan')}
            onOpenProfile={() => setRoute('health-profile')}
          />
        ) : null}
        {screen === 'health-profile' ? (
          <HealthProfileScreen ctx={featureCtx} onBack={() => setRoute('health-home')} />
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
                <SearchScopeChips value={searchScope} onChange={setSearchScope} />
                <NativeInput
                  label={MOBILE_SEARCH_SCOPES.find((row) => row.id === searchScope)?.placeholder ?? 'Search'}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                />
                <NativeButton label="Search" onPress={() => void loadCommerce()} />
              </NativeCard>
            ) : null}
            {screen === 'search' && viewState === 'idle' && !searchQuery.trim() && discoveryResults.length === 0 ? (
              <SearchEmptyHints onPick={setSearchQuery} />
            ) : null}
            {screen === 'home' && viewState === 'idle' ? (
              <>
                <CountryPickerRow
                  countries={countries}
                  country={country}
                  countryName={countryName}
                  onSelect={setCountry}
                />
                <MobileHomeHeader
                  countryName={countryName}
                  onSearch={() => setRoute('search')}
                  onNavigate={(target) => {
                    if (target === 'home') return;
                    if ((target === 'appointments' || target === 'health-home' || target === 'prescriptions') && !token) {
                      openSignIn();
                      return;
                    }
                    setRoute(target as MobileScreen);
                  }}
                />
                {token && session.status === 'authenticated' ? (
                  <MobileHomeSummary
                    token={token}
                    countryCode={country}
                    onUnauthorized={onUnauthorized}
                    onOpenAppointments={() => setRoute('appointments')}
                    onOpenOrders={() => setRoute('orders')}
                    onOpenHealth={() => setRoute('health-home')}
                    onOpenPrescriptions={() => setRoute('prescriptions')}
                    onOpenLabBooking={(bookingId) => {
                      setLabBookingId(bookingId);
                      setRoute('lab-booking-detail');
                    }}
                  />
                ) : null}
                <ProductRail
                  items={catalogItems}
                  onSelect={(item) => {
                    setProductSlug(item.slug);
                    setRoute('product');
                  }}
                  onAdd={(item) => addCatalogToCart(item)}
                />
              </>
            ) : null}
            {screen === 'search' && viewState === 'idle' && !searchQuery.trim() && catalogItems.length > 0 ? (
              <ProductGrid
                items={catalogItems}
                onSelect={(item) => {
                  setProductSlug(item.slug);
                  setRoute('product');
                }}
                onAdd={(item) => addCatalogToCart(item)}
              />
            ) : null}
            {screen === 'search' && viewState === 'idle' && discoveryResults.length > 0 ? (
              <DiscoverySearchResults
                items={discoveryResults}
                onSelect={(row) => {
                  if (row.slug) {
                    setProductSlug(row.slug);
                    setRoute('product');
                  }
                }}
              />
            ) : null}
            {screen === 'product' && viewState === 'idle' && productDetail ? (
              <MobileProductDetailScreen
                ctx={featureCtx}
                country={country}
                title={productDetail}
                offers={productOffers}
                selectedOfferId={selectedProductOfferId}
                itemId={productItemId}
                rxRequired={productRxRequired}
                reviewSummary={productReviewSummary ?? undefined}
                serviceability={productServiceability}
                onSelectOffer={setSelectedProductOfferId}
                onBack={() => setRoute('search')}
                onAddToCart={() => {
                  const offerId = selectedProductOfferId;
                  if (!offerId) {
                    return;
                  }
                  const offer = productOffers.find((row) => row.id === offerId);
                  if (token) {
                    void addCartItem(token, country, offerId, 1, newIdempotencyKey('cart'))
                      .then(() => setRoute('cart'))
                      .catch(handleApiError);
                    return;
                  }
                  try {
                    addGuestCartLine({
                      offer_id: offerId,
                      qty: 1,
                      title: productDetail ?? 'Item',
                      currency: offer?.currency ?? 'XXX',
                      sell_minor: String(offer?.price?.sell_minor ?? '0'),
                      country,
                      seller_org_id: offer?.seller_org_id,
                    });
                    setRoute('cart');
                  } catch (err) {
                    handleApiError(err);
                  }
                }}
              />
            ) : null}
            {screen === 'cart' && viewState === 'idle' ? (
              <MobileCartPanel
                items={cartItems ?? []}
                checkoutLabel={token ? 'Proceed to checkout' : 'Sign in to checkout'}
                onCheckout={() => (token ? setRoute('checkout') : openSignIn())}
                onShop={() => setRoute('search')}
              />
            ) : null}
            {screen === 'deals' && viewState === 'idle' ? (
              <DealsScreen
                country={country}
                countryName={countryName}
                onOpenProduct={(slug) => {
                  setProductSlug(slug);
                  setRoute('product');
                }}
              />
            ) : null}
            {screen === 'checkout' && viewState === 'idle' ? (
              <MobileCheckoutScreen
                ctx={featureCtx}
                country={country}
                onComplete={() => setRoute('orders')}
              />
            ) : null}
            {screen === 'orders' && viewState === 'idle' && orderRows.length ? (
              <View style={{ gap: 10 }}>
                <NativeText variant="h2">My Orders</NativeText>
                {orderRows.map((row) => (
                  <OrderListCard
                    key={row.id}
                    orderNumber={row.order_number}
                    status={row.status}
                    totalLabel={formatMoney(row.total_minor, row.currency)}
                    onPress={() => {
                      setOrderId(row.id);
                      setRoute('order-detail');
                    }}
                  />
                ))}
              </View>
            ) : null}
            {viewState === 'idle' && summary && screen !== 'home' && screen !== 'deals' && screen !== 'checkout' && screen !== 'loyalty' && screen !== 'care-plan' && screen !== 'cart' && screen !== 'search' ? (
              <NativeText>{summary}</NativeText>
            ) : null}
            {viewState === 'idle' &&
            rows.length &&
            screen !== 'product' &&
            screen !== 'orders' &&
            screen !== 'deals' &&
            screen !== 'checkout' &&
            screen !== 'loyalty' &&
            screen !== 'care-plan' &&
            screen !== 'cart'
              ? rows.map((row) => (
                  <View key={row}>
                    <NativeText>{row}</NativeText>
                  </View>
                ))
              : null}
            {viewState === 'idle' &&
            !rows.length &&
            screen !== 'home' &&
            screen !== 'product' &&
            screen !== 'checkout' &&
            screen !== 'deals' &&
            screen !== 'loyalty' &&
            screen !== 'care-plan' &&
            screen !== 'orders' &&
            screen !== 'cart' &&
            screen !== 'search' ? (
              <NativeEmptyState title="Nothing here yet" description="Browse medicines from Home." actionLabel="Go home" onAction={() => setRoute('home')} />
            ) : null}
          </>
        ) : null}

        {screen === 'account' && session.status === 'authenticated' ? (
          <NativeButton label="Sign out" variant="secondary" onPress={signOut} />
        ) : null}
        </ScrollView>
        {showTabBar ? (
          <MobileTabBar
            cartCount={cartCount}
            active={
              route === 'health-home' ||
              route === 'health-profile' ||
              route === 'health-artifact-detail' ||
              route === 'prescriptions' ||
              route === 'prescription-detail'
                ? 'health-home'
                : route === 'order-detail' || route === 'orders'
                  ? 'account'
                  : route === 'checkout' || route === 'cart'
                    ? 'cart'
                    : route === 'product'
                      ? 'search'
                      : route === 'appointments' ||
                          route === 'appointment-detail' ||
                          route === 'doctors' ||
                          route === 'lab' ||
                          route === 'lab-bookings' ||
                          route === 'lab-booking-detail' ||
                          route === 'imaging' ||
                          route === 'imaging-bookings' ||
                          route === 'imaging-booking-detail'
                        ? 'home'
                        : TAB_ITEMS.some((tab) => tab.id === route)
                          ? (route as (typeof TAB_ITEMS)[number]['id'])
                          : 'home'
            }
            onSelect={(id) => {
              if (id === 'health-home' && !token) {
                openSignIn();
                return;
              }
              setRoute(id);
              setAppointmentId(null);
              setPrescriptionId(null);
            }}
          />
        ) : null}
      </View>
    </SafeAreaView>
  );
}
