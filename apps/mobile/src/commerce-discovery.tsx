'use client';

import { useEffect } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import {
  NativeButton,
  NativeCard,
  NativeEmptyState,
  NativeLoadingState,
  NativeText,
} from '@world-pharma/ui-kit/native';
import type { CatalogCard, DiscoveryResultItem } from './commerce-api';
import { recordProductViewed } from './commerce-api';
import { discountPercent, formatMoney } from './format-money';
import { ProductReviewsPanel } from './reviews-features';
import type { FeatureCtx } from './customer-features';

const PLACEHOLDER = 'https://placehold.co/240x240/F7FAFC/1A365D/png?text=Medicine';

export function mapDiscoveryToCatalogCard(row: DiscoveryResultItem): CatalogCard {
  const sellMinor = row.min_sell_minor ?? undefined;
  const listMinor =
    sellMinor && row.max_discount_pct
      ? String(Math.round(Number(sellMinor) / (1 - row.max_discount_pct / 100)))
      : undefined;
  return {
    id: row.id,
    slug: row.slug ?? row.id,
    title: row.title,
    brand: row.brand ?? row.subtitle,
    category: row.category ?? null,
    rx_required: row.rx_required,
    assets: [],
    offers: sellMinor
      ? [
          {
            id: row.id,
            seller_display_name: row.manufacturer ?? undefined,
            currency: 'XXX',
            pack_size: row.composition ?? undefined,
            price: {
              sell_minor: sellMinor,
              list_minor: listMinor,
            },
          },
        ]
      : [],
  };
}

export function DiscoverySearchResults({
  items,
  onSelect,
}: {
  items: DiscoveryResultItem[];
  onSelect: (item: DiscoveryResultItem) => void;
}) {
  const commerce = items.filter((row) => row.type === 'commerce');
  if (!commerce.length) {
    return <NativeEmptyState title="No medicines found" description="Try a different search term." />;
  }
  return (
    <ScrollView contentContainerStyle={styles.grid}>
      {commerce.map((row) => {
        const sell = row.min_sell_minor;
        const discount = sell && row.max_discount_pct ? row.max_discount_pct : null;
        return (
          <Pressable key={row.id} style={styles.gridItem} onPress={() => onSelect(row)}>
            <View style={styles.productCard}>
              <View style={styles.imageWrap}>
                <Image source={{ uri: PLACEHOLDER }} style={styles.image} resizeMode="contain" />
                {discount ? (
                  <View style={styles.discountBadge}>
                    <NativeText variant="caption" style={styles.discountText}>
                      {discount}% OFF
                    </NativeText>
                  </View>
                ) : null}
                {row.rx_required ? (
                  <View style={styles.rxBadge}>
                    <NativeText variant="caption" style={styles.rxText}>
                      Rx
                    </NativeText>
                  </View>
                ) : null}
              </View>
              <NativeText variant="label" numberOfLines={2}>
                {row.title}
              </NativeText>
              {row.brand ? <NativeText variant="caption">{row.brand}</NativeText> : null}
              {row.composition ? <NativeText variant="caption">{row.composition}</NativeText> : null}
              {sell ? (
                <NativeText variant="h3">{formatMoney(sell, 'XXX')}</NativeText>
              ) : (
                <NativeText variant="caption">Price unavailable</NativeText>
              )}
              {row.avg_rating != null && row.review_count ? (
                <NativeText variant="caption">{`${row.avg_rating.toFixed(1)} ★ (${row.review_count})`}</NativeText>
              ) : null}
              <NativeText variant="caption">
                {row.in_stock ? 'In stock' : 'Out of stock'}
              </NativeText>
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function MobileProductDetailScreen({
  ctx,
  country,
  title,
  offers,
  selectedOfferId,
  itemId,
  rxRequired,
  reviewSummary,
  serviceability,
  onSelectOffer,
  onAddToCart,
  onBack,
}: {
  ctx: FeatureCtx;
  country: string;
  title: string;
  offers: Array<{
    id: string;
    seller_display_name?: string;
    seller_org_id?: string;
    currency?: string;
    strength?: string | null;
    pack_size?: string | null;
    price?: { sell_minor?: string; list_minor?: string | null };
    inventory?: { available?: boolean; qty?: number };
  }>;
  selectedOfferId: string | null;
  itemId: string | null;
  rxRequired?: boolean;
  reviewSummary?: { avg_rating: number | null; review_count: number };
  serviceability?: { purchasable?: boolean; message?: string; medicine_eta?: string } | null;
  onSelectOffer: (id: string) => void;
  onAddToCart: () => void;
  onBack: () => void;
}) {
  const offer = offers.find((row) => row.id === selectedOfferId) ?? offers[0];
  const purchasable =
    offer?.inventory?.available !== false &&
    (serviceability?.purchasable !== false);
  const sell = offer?.price?.sell_minor;
  const list = offer?.price?.list_minor;
  const stars =
    reviewSummary?.avg_rating != null
      ? `${reviewSummary.avg_rating.toFixed(1)} ★ · ${reviewSummary.review_count} reviews`
      : 'New · No reviews yet';

  useEffect(() => {
    if (ctx.token && itemId) {
      void recordProductViewed(ctx.token, itemId, country).catch(() => undefined);
    }
  }, [ctx.token, itemId, country]);

  return (
    <View style={{ gap: 14 }}>
      <NativeButton label="← Back" variant="secondary" onPress={onBack} />
      <Image source={{ uri: PLACEHOLDER }} style={styles.detailImage} resizeMode="contain" />
      <NativeText variant="h2">{title}</NativeText>
      {rxRequired ? <NativeText variant="caption">Prescription required</NativeText> : null}
      {offer?.strength || offer?.pack_size ? (
        <NativeText variant="caption">{[offer?.strength, offer?.pack_size].filter(Boolean).join(' · ')}</NativeText>
      ) : null}
      {sell ? (
        <NativeText variant="h2" style={{ color: '#1A365D' }}>
          {formatMoney(sell, offer?.currency ?? 'XXX')}
        </NativeText>
      ) : (
        <NativeText variant="caption">Price unavailable</NativeText>
      )}
      {list && sell && list !== sell ? (
        <NativeText variant="caption">{`MRP ${formatMoney(list, offer?.currency ?? 'XXX')}`}</NativeText>
      ) : null}
      <NativeText variant="caption">{stars}</NativeText>
      {serviceability ? (
        <NativeText variant="caption">
          {serviceability.purchasable ? `Deliverable · ${serviceability.medicine_eta ?? 'ETA varies'}` : serviceability.message}
        </NativeText>
      ) : null}
      {offers.length > 1
        ? offers.map((row) => (
            <NativeButton
              key={row.id}
              label={`${row.id === selectedOfferId ? '✓ ' : ''}${row.seller_display_name ?? 'Seller'} · ${
                row.price?.sell_minor ? formatMoney(row.price.sell_minor, row.currency ?? 'XXX') : 'Price n/a'
              }${row.inventory?.available === false ? ' · Out of stock' : ''}`}
              variant={row.id === selectedOfferId ? 'primary' : 'secondary'}
              onPress={() => onSelectOffer(row.id)}
            />
          ))
        : offer?.seller_display_name ? (
            <NativeText variant="caption">{`Sold by ${offer.seller_display_name}`}</NativeText>
          ) : null}
      <NativeButton
        label={purchasable ? (rxRequired ? 'Add to Cart (Rx at checkout)' : 'Add to Cart') : 'Unavailable'}
        disabled={!purchasable || !selectedOfferId}
        onPress={onAddToCart}
      />
      <NativeCard>
        <NativeText variant="h3">Description</NativeText>
        <NativeText variant="caption">Product information from the catalog listing for this country.</NativeText>
        <NativeText variant="h3" style={{ marginTop: 10 }}>
          Usage
        </NativeText>
        <NativeText variant="caption">Follow your doctor or pharmacist instructions. Not medical advice.</NativeText>
        <NativeText variant="h3" style={{ marginTop: 10 }}>
          Side effects
        </NativeText>
        <NativeText variant="caption">See the package leaflet. Seek care for unexpected reactions.</NativeText>
      </NativeCard>
      {itemId ? <ProductReviewsPanel ctx={ctx} itemId={itemId} country={country} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  gridItem: { width: '47%' },
  productCard: { gap: 4, padding: 8, backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#eee' },
  imageWrap: { position: 'relative' },
  image: { width: '100%', height: 120, backgroundColor: '#fafafa' },
  discountBadge: { position: 'absolute', top: 4, left: 4, backgroundColor: '#208376', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  discountText: { color: '#fff' },
  rxBadge: { position: 'absolute', top: 4, right: 4, backgroundColor: '#C53030', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  rxText: { color: '#fff' },
  detailImage: { width: '100%', height: 220, backgroundColor: '#F7FAFC', borderRadius: 16, marginBottom: 4 },
});
