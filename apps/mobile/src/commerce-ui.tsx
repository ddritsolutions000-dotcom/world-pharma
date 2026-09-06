import { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { NativeCard, NativeText } from '@world-pharma/ui-kit/native';
import type { CatalogCard, DiscoveryType } from './commerce-api';
import { discountPercent, formatMoney } from './format-money';

const PLACEHOLDER = 'https://placehold.co/240x240/F7FAFC/1A365D/png?text=Rx';
/** Native app palette — not the website coral. */
const NAVY = '#1A365D';
const TEAL = '#0D9488';
const INK = '#1A202C';
const MUTED = '#718096';
const LINE = '#E2E8F0';
const CANVAS = '#F7FAFC';

export const TAB_ITEMS = [
  { id: 'home' as const, label: 'Home', icon: '⌂' },
  { id: 'search' as const, label: 'Search', icon: '⌕' },
  { id: 'cart' as const, label: 'Cart', icon: '🛒' },
  { id: 'health-home' as const, label: 'Records', icon: '📁' },
  { id: 'account' as const, label: 'Profile', icon: '👤' },
];

export const TAB_ROOT_SCREENS = new Set<string>([
  ...TAB_ITEMS.map((tab) => tab.id),
  'appointments',
  'orders',
  'lab',
  'doctors',
  'imaging',
]);

/** Board home services — short set only (not the removed long promo strip). */
const SERVICE_CIRCLES: Array<{ label: string; route: string; icon: string }> = [
  { label: 'Medicines', route: 'search', icon: '💊' },
  { label: 'Lab', route: 'lab', icon: '🧪' },
  { label: 'Doctors', route: 'doctors', icon: '🩺' },
  { label: 'Imaging', route: 'imaging', icon: '🩻' },
];

export function MobileHomeHeader({
  onNavigate,
  onSearch,
  countryName,
}: {
  onNavigate: (target: string) => void;
  onSearch?: () => void;
  countryName?: string;
}) {
  return (
    <View style={styles.headerBlock}>
      <View style={styles.homeTopRow}>
        <View>
          <Text style={styles.homeHello}>World-Pharma™</Text>
          <Text style={styles.locationLine}>📍 {countryName ?? 'Select country'}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Profile"
          style={styles.homeAvatar}
          onPress={() => onNavigate('account')}
        >
          <Text style={styles.homeAvatarText}>👤</Text>
        </Pressable>
      </View>

      {onSearch ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Search" style={styles.searchBar} onPress={onSearch}>
          <Text style={styles.searchIcon}>⌕</Text>
          <Text style={styles.searchPlaceholder}>Search medicines, labs, doctors…</Text>
        </Pressable>
      ) : null}

      <Pressable style={styles.promoBanner} onPress={() => onNavigate('deals')} accessibilityRole="button" accessibilityLabel="Special offers">
        <Text style={styles.promoKicker}>SPECIAL OFFER</Text>
        <Text style={styles.promoTitle}>Health for People Everywhere.</Text>
        <Text style={styles.promoSub}>Licensed pharmacies · labs · doctors · tracked delivery</Text>
      </Pressable>

      <Text style={styles.sectionTitle}>Services</Text>
      <View style={styles.circleRow}>
        {SERVICE_CIRCLES.map((item) => (
          <Pressable
            key={item.route}
            style={styles.circleItem}
            onPress={() => onNavigate(item.route)}
            accessibilityRole="button"
            accessibilityLabel={item.label}
          >
            <View style={styles.circleIcon}>
              <Text style={{ fontSize: 22 }}>{item.icon}</Text>
            </View>
            <Text style={styles.circleLabel}>{item.label}</Text>
          </Pressable>
        ))}
      </View>

      <Pressable style={styles.rxCta} onPress={() => onNavigate('prescriptions')} accessibilityRole="button" accessibilityLabel="Upload prescription">
        <View style={styles.rxCtaIcon}>
          <Text style={styles.rxCtaIconText}>Rx</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.rxCtaTitle}>Upload a prescription</Text>
          <Text style={styles.rxCtaSub}>We’ll map medicines and show delivery options</Text>
        </View>
        <Text style={styles.rxCtaArrow}>›</Text>
      </Pressable>

      <Text style={styles.sectionTitle}>Popular medicines</Text>
    </View>
  );
}

export function MobileTabBar({
  active,
  onSelect,
  cartCount = 0,
}: {
  active: string;
  onSelect: (id: (typeof TAB_ITEMS)[number]['id']) => void;
  cartCount?: number;
}) {
  const current =
    active === 'cart' || active === 'checkout'
      ? 'cart'
      : active === 'product'
        ? 'search'
        : active === 'health-home' ||
            active === 'health-profile' ||
            active === 'health-artifact-detail' ||
            active === 'prescriptions' ||
            active === 'prescription-detail'
          ? 'health-home'
          : active === 'orders' || active === 'order-detail'
            ? 'account'
            : active === 'appointments' ||
                active === 'appointment-detail' ||
                active === 'doctors' ||
                active === 'lab' ||
                active === 'lab-bookings' ||
                active === 'lab-booking-detail' ||
                active === 'imaging' ||
                active === 'imaging-bookings' ||
                active === 'imaging-booking-detail'
              ? 'home'
              : active;
  return (
    <View style={styles.tabBar}>
      {TAB_ITEMS.map((tab) => {
        const isActive = current === tab.id;
        return (
          <Pressable
            key={tab.id}
            accessibilityRole="button"
            accessibilityLabel={tab.label}
            style={styles.tab}
            onPress={() => onSelect(tab.id)}
          >
            <View>
              <Text style={{ fontSize: 20, lineHeight: 24, color: isActive ? NAVY : MUTED }}>{tab.icon}</Text>
              {tab.id === 'cart' && cartCount > 0 ? (
                <View style={styles.cartBadge}>
                  <Text style={styles.cartBadgeText}>{cartCount > 9 ? '9+' : String(cartCount)}</Text>
                </View>
              ) : null}
            </View>
            <Text style={isActive ? styles.tabLabelActive : styles.tabLabel}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function MobileHomeTopBar({
  countryName,
  onSearch,
}: {
  countryName: string;
  onSearch: () => void;
}) {
  return (
    <View style={styles.topBar}>
      <Text style={styles.locationLine}>📍 {countryName}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Search" onPress={onSearch} style={styles.searchBar}>
        <Text style={styles.searchIcon}>⌕</Text>
        <Text style={styles.searchPlaceholder}>Search for medicines</Text>
      </Pressable>
    </View>
  );
}

export type MobileSearchScope = 'all' | 'commerce' | 'test' | 'doctor';

export const MOBILE_SEARCH_SCOPES: Array<{
  id: MobileSearchScope;
  label: string;
  placeholder: string;
  types: DiscoveryType[];
}> = [
  { id: 'all', label: 'All', placeholder: 'Search medicines, doctors, lab tests…', types: ['commerce', 'help', 'doctor', 'lab', 'test', 'pharmacy'] },
  { id: 'commerce', label: 'Medicines', placeholder: 'Search medicines and health products', types: ['commerce'] },
  { id: 'test', label: 'Lab tests', placeholder: 'Search lab tests and packages', types: ['test', 'lab'] },
  { id: 'doctor', label: 'Doctors', placeholder: 'Search doctors and specialties', types: ['doctor'] },
];

export function SearchScopeChips({
  value,
  onChange,
}: {
  value: MobileSearchScope;
  onChange: (id: MobileSearchScope) => void;
}) {
  return (
    <View style={styles.scopeRow}>
      {MOBILE_SEARCH_SCOPES.map((row) => {
        const active = row.id === value;
        return (
          <Pressable key={row.id} onPress={() => onChange(row.id)} style={active ? [styles.scopeChip, styles.scopeChipActive] : styles.scopeChip}>
            <Text style={active ? styles.scopeChipLabelActive : styles.scopeChipLabel}>{row.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function ProductRail({
  items,
  onSelect,
  onAdd,
}: {
  items: CatalogCard[];
  onSelect: (item: CatalogCard) => void;
  onAdd?: (item: CatalogCard) => void | Promise<void>;
}) {
  if (!items.length) {
    return (
      <NativeCard>
        <NativeText variant="h3">No products yet</NativeText>
        <NativeText variant="caption">Check back soon for medicines and health products.</NativeText>
      </NativeCard>
    );
  }
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
      {items.slice(0, 12).map((item) => (
        <ProductThumb key={item.id} item={item} onSelect={onSelect} onAdd={onAdd} width={148} />
      ))}
    </ScrollView>
  );
}

export function ProductGrid({
  items,
  onSelect,
  onAdd,
}: {
  items: CatalogCard[];
  onSelect: (item: CatalogCard) => void;
  onAdd?: (item: CatalogCard) => void | Promise<void>;
}) {
  if (!items.length) {
    return (
      <NativeCard>
        <NativeText variant="h3">No products yet</NativeText>
        <NativeText variant="caption">Check back soon for medicines and health products.</NativeText>
      </NativeCard>
    );
  }
  return (
    <View style={styles.grid}>
      {items.map((item) => (
        <View key={item.id} style={styles.gridItem}>
          <ProductThumb item={item} onSelect={onSelect} onAdd={onAdd} width="100%" />
        </View>
      ))}
    </View>
  );
}

function ProductThumb({
  item,
  onSelect,
  onAdd,
  width,
}: {
  item: CatalogCard;
  onSelect: (item: CatalogCard) => void;
  onAdd?: (item: CatalogCard) => void | Promise<void>;
  width: number | `${number}%` | '100%';
}) {
  const [addLabel, setAddLabel] = useState('Add');
  const offer = item.offers?.[0];
  const image = item.assets?.[0]?.url ?? PLACEHOLDER;
  const sell = offer?.price?.sell_minor;
  const list = offer?.price?.list_minor;
  const discount = sell && list ? discountPercent(sell, list) : null;
  const canAdd = Boolean(offer?.id && onAdd);
  return (
    <Pressable style={[styles.productCard, { width }]} onPress={() => onSelect(item)}>
      <View style={styles.imageWrap}>
        <Image source={{ uri: image }} style={styles.image} resizeMode="contain" />
        {discount ? (
          <View style={styles.discountBadge}>
            <Text style={styles.discountText}>{discount}% OFF</Text>
          </View>
        ) : null}
      </View>
      <Text numberOfLines={2} style={styles.productTitle}>
        {item.title}
      </Text>
      <Text style={styles.price}>{sell ? formatMoney(sell, offer?.currency) : '—'}</Text>
      {list && sell && list !== sell ? (
        <Text style={styles.mrp}>MRP {formatMoney(list, offer?.currency)}</Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add to cart"
        disabled={!canAdd || addLabel === 'Adding…'}
        style={[styles.addBtn, !canAdd ? styles.addBtnDisabled : null]}
        onPress={() => {
          if (!canAdd || !onAdd) return;
          setAddLabel('Adding…');
          void Promise.resolve(onAdd(item))
            .then(() => {
              setAddLabel('Added');
              setTimeout(() => setAddLabel('Add'), 1600);
            })
            .catch(() => setAddLabel('Retry'));
        }}
      >
        <Text style={styles.addBtnText}>{addLabel}</Text>
      </Pressable>
    </Pressable>
  );
}

export function MobileCartPanel({
  items,
  checkoutLabel,
  onCheckout,
  onShop,
}: {
  items: Array<{ id: string; title: string; qty: number; currency: string; sell_minor: string | null }>;
  checkoutLabel: string;
  onCheckout: () => void;
  onShop: () => void;
}) {
  if (!items.length) {
    return (
      <View style={{ gap: 12 }}>
        <Text style={styles.sectionTitle}>My Cart</Text>
        <NativeCard>
          <NativeText variant="h3">Your cart is empty</NativeText>
          <NativeText variant="caption">Add medicines from Home or Search.</NativeText>
        </NativeCard>
        <Pressable accessibilityRole="button" style={styles.primaryBtn} onPress={onShop}>
          <Text style={styles.primaryBtnText}>Browse medicines</Text>
        </Pressable>
      </View>
    );
  }
  const total = items.reduce((sum, row) => sum + Number(row.sell_minor ?? 0) * row.qty, 0);
  const currency = items[0]?.currency ?? 'XXX';
  return (
    <View style={{ gap: 12 }}>
      <Text style={styles.sectionTitle}>My Cart</Text>
      {items.map((row) => (
        <View key={row.id} style={styles.cartLine}>
          <View style={styles.cartThumb}>
            <Text style={{ fontSize: 18 }}>💊</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cartLineTitle} numberOfLines={2}>
              {row.title}
            </Text>
            <Text style={styles.price}>{formatMoney(Number(row.sell_minor ?? 0), row.currency)}</Text>
            <View style={styles.qtyRow}>
              <Text style={styles.qtyChip}>−</Text>
              <Text style={styles.qtyValue}>{row.qty}</Text>
              <Text style={styles.qtyChip}>+</Text>
            </View>
          </View>
          <Text style={styles.price}>{formatMoney(Number(row.sell_minor ?? 0) * row.qty, row.currency)}</Text>
        </View>
      ))}
      <View style={styles.cartTotal}>
        <Text style={styles.cartTotalLabel}>Total Amount</Text>
        <Text style={styles.cartTotalValue}>{formatMoney(total, currency)}</Text>
      </View>
      <Pressable accessibilityRole="button" style={styles.primaryBtn} onPress={onCheckout}>
        <Text style={styles.primaryBtnText}>{checkoutLabel}</Text>
      </Pressable>
    </View>
  );
}

/** Board search empty: recent / trending chips. */
export function SearchEmptyHints({
  onPick,
}: {
  onPick: (query: string) => void;
}) {
  const recent = ['Paracetamol', 'Vitamin D', 'Full body checkup', 'Cardiologist'];
  return (
    <View style={{ gap: 10 }}>
      <Text style={styles.sectionTitle}>Trending</Text>
      {recent.map((q) => (
        <Pressable key={q} style={styles.trendRow} onPress={() => onPick(q)} accessibilityRole="button">
          <Text style={styles.trendIcon}>⌕</Text>
          <Text style={styles.trendLabel}>{q}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function OrderStatusBadge({ status }: { status: string }) {
  const upper = status.toUpperCase();
  const tone =
    upper.includes('DELIVER') || upper.includes('COMPLETE') || upper.includes('FULFILL')
      ? { bg: '#C6F6D5', fg: '#22543D' }
      : upper.includes('CANCEL') || upper.includes('FAIL')
        ? { bg: '#FED7D7', fg: '#9B2C2C' }
        : { bg: '#BEE3F8', fg: '#2A4365' };
  return (
    <View style={[styles.statusBadge, { backgroundColor: tone.bg }]}>
      <Text style={[styles.statusBadgeText, { color: tone.fg }]}>{status.replaceAll('_', ' ')}</Text>
    </View>
  );
}

export function OrderListCard({
  orderNumber,
  status,
  totalLabel,
  onPress,
}: {
  orderNumber: string;
  status: string;
  totalLabel: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.orderCard} onPress={onPress} accessibilityRole="button">
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={styles.cartLineTitle}>{orderNumber}</Text>
        <Text style={styles.actionHint}>{totalLabel}</Text>
      </View>
      <OrderStatusBadge status={status} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: LINE,
    backgroundColor: '#fff',
    paddingTop: 8,
    paddingBottom: 10,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  cartBadge: {
    position: 'absolute',
    top: -4,
    right: -10,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: TEAL,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  cartBadgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '800',
  },
  cartLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: LINE,
    borderRadius: 14,
    padding: 14,
  },
  cartLineTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: INK,
  },
  cartTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  tabLabel: {
    color: MUTED,
    fontSize: 11,
    fontWeight: '600',
  },
  tabLabelActive: {
    color: NAVY,
    fontSize: 11,
    fontWeight: '700',
  },
  topBar: {
    gap: 10,
  },
  locationLine: {
    fontSize: 14,
    fontWeight: '600',
    color: INK,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: CANVAS,
  },
  searchIcon: {
    fontSize: 16,
  },
  searchPlaceholder: {
    fontSize: 15,
    color: MUTED,
  },
  headerBlock: {
    gap: 14,
  },
  homeTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  homeHello: {
    fontSize: 18,
    fontWeight: '800',
    color: NAVY,
    letterSpacing: -0.3,
  },
  homeAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E8EEF2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  homeAvatarText: {
    fontSize: 18,
  },
  promoBanner: {
    backgroundColor: NAVY,
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 16,
    gap: 6,
  },
  promoKicker: {
    color: TEAL,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  promoTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  promoSub: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 13,
    lineHeight: 18,
  },
  circleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  circleItem: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
  },
  circleIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#E6FFFA',
    borderWidth: 1,
    borderColor: LINE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: INK,
    textAlign: 'center',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: INK,
    letterSpacing: -0.3,
    marginTop: 4,
  },
  actionHint: {
    color: MUTED,
    fontSize: 12,
    marginTop: 4,
  },
  primaryBtn: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: NAVY,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
  cartThumb: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: CANVAS,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
  },
  qtyChip: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: LINE,
    textAlign: 'center',
    lineHeight: 26,
    color: NAVY,
    fontWeight: '700',
    overflow: 'hidden',
  },
  qtyValue: {
    fontSize: 14,
    fontWeight: '700',
    color: INK,
    minWidth: 16,
    textAlign: 'center',
  },
  cartTotalLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: MUTED,
  },
  cartTotalValue: {
    fontSize: 18,
    fontWeight: '800',
    color: NAVY,
  },
  trendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: LINE,
  },
  trendIcon: {
    fontSize: 16,
    color: NAVY,
    fontWeight: '700',
  },
  trendLabel: {
    fontSize: 15,
    color: INK,
    fontWeight: '600',
  },
  statusBadge: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'capitalize',
  },
  orderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: LINE,
    borderRadius: 14,
    padding: 14,
  },
  rxCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: LINE,
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  rxCtaIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rxCtaIconText: {
    color: '#C53030',
    fontWeight: '800',
    fontSize: 13,
  },
  rxCtaTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: INK,
  },
  rxCtaSub: {
    fontSize: 13,
    color: MUTED,
    marginTop: 4,
  },
  rxCtaArrow: {
    fontSize: 28,
    color: NAVY,
    fontWeight: '400',
  },
  rail: {
    gap: 10,
    paddingBottom: 8,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingBottom: 16,
  },
  gridItem: {
    width: '47%',
  },
  productCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: LINE,
    padding: 8,
  },
  imageWrap: {
    position: 'relative',
    marginBottom: 6,
  },
  image: {
    width: '100%',
    height: 110,
    borderRadius: 6,
    backgroundColor: '#fafafa',
  },
  discountBadge: {
    position: 'absolute',
    top: 4,
    left: 4,
    backgroundColor: TEAL,
    borderRadius: 3,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  discountText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  productTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: INK,
    lineHeight: 17,
    minHeight: 34,
  },
  price: {
    fontSize: 15,
    fontWeight: '700',
    color: NAVY,
    marginTop: 4,
  },
  mrp: {
    fontSize: 11,
    color: MUTED,
    textDecorationLine: 'line-through',
  },
  addBtn: {
    marginTop: 8,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: TEAL,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  addBtnDisabled: {
    opacity: 0.55,
  },
  addBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
  },
  scopeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  scopeChip: {
    borderWidth: 1,
    borderColor: LINE,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#fff',
  },
  scopeChipActive: {
    borderColor: NAVY,
    backgroundColor: '#E8EEF2',
  },
  scopeChipLabel: {
    fontSize: 13,
    color: INK,
  },
  scopeChipLabelActive: {
    fontSize: 13,
    color: NAVY,
    fontWeight: '700',
  },
});
