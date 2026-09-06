import { useEffect, useState } from 'react';
import { View } from 'react-native';
import {
  NativeButton,
  NativeLoadingState,
  NativeText,
} from '@world-pharma/ui-kit/native';
import { addCartItem, fetchRecentlyViewed, newIdempotencyKey, type RecentlyViewedProduct } from './commerce-api';
import type { FeatureCtx } from './customer-features';
import { formatMoney } from './format-money';

export function RecentlyViewedScreen({ ctx, country }: { ctx: FeatureCtx; country: string }) {
  const [items, setItems] = useState<RecentlyViewedProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    void fetchRecentlyViewed(ctx.token, country)
      .then((body) => setItems(body.data ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [ctx.token, country]);

  async function addToCart(item: RecentlyViewedProduct) {
    if (!item.available || !item.in_stock || !item.best_offer_id) {
      setMessage(item.unavailable_reason ?? 'Unavailable');
      return;
    }
    setMessage(null);
    try {
      await addCartItem(ctx.token, country, item.best_offer_id, 1, newIdempotencyKey('recent-cart'));
      setMessage('Added to cart.');
    } catch (err) {
      setMessage((err as Error).message ?? 'Could not add to cart.');
    }
  }

  if (loading) {
    return <NativeLoadingState title="Loading recently viewed" />;
  }

  return (
    <View style={{ gap: 12 }}>
      <NativeButton label="Back" variant="secondary" onPress={ctx.onBack} />
      <NativeText variant="h2">Recently viewed</NativeText>
      {message ? <NativeText variant="caption">{message}</NativeText> : null}
      {!items.length ? (
        <NativeText variant="caption">Products you view will appear here.</NativeText>
      ) : (
        items.map((item) => (
          <View key={item.item_id} style={{ gap: 4 }}>
            <NativeText>{item.title}</NativeText>
            <NativeText variant="caption">
              {item.sell_minor ? formatMoney(item.sell_minor, item.currency) : 'Price unavailable'}
              {item.rx_required ? ' · Rx required' : ''}
              {!item.available ? ` · ${item.unavailable_reason ?? 'Unavailable'}` : !item.in_stock ? ' · Out of stock' : ''}
            </NativeText>
            <NativeButton
              label={item.available && item.in_stock ? 'Add to cart' : 'Unavailable'}
              disabled={!item.available || !item.in_stock}
              variant="secondary"
              onPress={() => void addToCart(item)}
            />
          </View>
        ))
      )}
    </View>
  );
}
