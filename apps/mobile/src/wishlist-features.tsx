import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import {
  NativeButton,
  NativeCard,
  NativeEmptyState,
  NativeLoadingState,
  NativeNetworkErrorState,
  NativeText,
} from '@world-pharma/ui-kit/native';
import type { FeatureCtx } from './customer-features';
import { fetchWishlist, removeWishlistItem, type WishlistItem } from './commerce-api';

export function WishlistScreen({ ctx, country }: { ctx: FeatureCtx; country: string }) {
  const [items, setItems] = useState<WishlistItem[]>([]);

  const load = useCallback(async () => {
    ctx.setViewState('loading');
    try {
      const body = await fetchWishlist(ctx.token, country);
      setItems(body.data ?? []);
      ctx.setViewState('idle');
    } catch {
      ctx.setViewState('network');
    }
  }, [ctx, country]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <View style={{ gap: 12 }}>
      <NativeButton label="Back" variant="secondary" onPress={ctx.onBack} />
      <NativeText variant="h2">Wishlist</NativeText>
      {ctx.viewState === 'loading' ? <NativeLoadingState title="Loading wishlist…" /> : null}
      {ctx.viewState === 'network' ? (
        <NativeNetworkErrorState onRetry={() => void load()} />
      ) : null}
      {ctx.viewState === 'idle' && !items.length ? (
        <NativeEmptyState title="Wishlist empty" description="Save products from the store to see them here." />
      ) : null}
      {ctx.viewState === 'idle'
        ? items.map((item) => (
            <View key={item.id}>
              <NativeCard>
                <NativeText>{item.product_title}</NativeText>
                <NativeText variant="caption">
                  {item.available ? `${item.currency} ${item.sell_minor ?? '—'}` : 'Unavailable'}
                </NativeText>
                <NativeButton
                  label="Remove"
                  variant="secondary"
                  onPress={() => {
                    void removeWishlistItem(ctx.token, country, item.catalog_offer_id).then(() => void load());
                  }}
                />
              </NativeCard>
            </View>
          ))
        : null}
    </View>
  );
}
