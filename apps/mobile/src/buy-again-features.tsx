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
import { addCartItem, fetchBuyAgain, newIdempotencyKey, type BuyAgainItem } from './commerce-api';
import type { FeatureCtx } from './customer-features';
import { formatMoney } from './format-money';

export function BuyAgainScreen({ ctx, country }: { ctx: FeatureCtx; country: string }) {
  const [rows, setRows] = useState<BuyAgainItem[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    ctx.setViewState('loading');
    try {
      const body = await fetchBuyAgain(ctx.token);
      setRows(body.data ?? []);
      ctx.setViewState('idle');
    } catch {
      ctx.setViewState('network');
    }
  }, [ctx]);

  useEffect(() => {
    void load();
  }, [load]);

  async function addAgain(item: BuyAgainItem) {
    if (!item.available) {
      return;
    }
    setBusyId(item.offer_id);
    setMessage(null);
    try {
      await addCartItem(ctx.token, country, item.offer_id, item.last_qty || 1, newIdempotencyKey());
      setMessage(`${item.product_title ?? item.title} added to cart`);
    } catch (err) {
      setMessage((err as Error).message ?? 'Could not add to cart');
    } finally {
      setBusyId(null);
    }
  }

  if (ctx.viewState === 'loading') {
    return <NativeLoadingState title="Loading buy again" />;
  }
  if (ctx.viewState === 'network') {
    return <NativeNetworkErrorState onRetry={() => void load()} />;
  }

  return (
    <View style={{ gap: 12 }}>
      <NativeText variant="h2">Buy again</NativeText>
      <NativeText variant="caption">Reorder medicines from past orders. Automatic payment stays off.</NativeText>
      {message ? <NativeText variant="caption">{message}</NativeText> : null}
      {rows.length === 0 ? (
        <NativeEmptyState title="No previous medicines" description="Complete an order, then reorder from here." />
      ) : (
        rows.map((item) => (
          <NativeCard key={item.offer_id}>
            <NativeText>{item.product_title ?? item.title}</NativeText>
            <NativeText variant="caption">
              {item.sku} · {item.times_ordered} order{item.times_ordered === 1 ? '' : 's'}
              {item.sell_minor && item.currency ? ` · ${formatMoney(item.sell_minor, item.currency)}` : ''}
            </NativeText>
            <NativeButton
              label={item.available ? (busyId === item.offer_id ? 'Adding…' : 'Add to cart') : 'Unavailable'}
              onPress={() => void addAgain(item)}
            />
          </NativeCard>
        ))
      )}
    </View>
  );
}

export function StoresScreen(_props: { country: string }) {
  return (
    <View style={{ gap: 12 }}>
      <NativeText variant="h2">Home delivery only</NativeText>
      <NativeEmptyState
        title="No physical stores"
        description="WorldPharma is fully online. Licensed partners deliver to your address — there is no store to visit nearby."
      />
    </View>
  );
}
