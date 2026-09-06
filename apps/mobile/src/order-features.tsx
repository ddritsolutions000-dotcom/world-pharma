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
import {
  fetchOrder,
  fetchOrderLiveTracking,
  reorderOrder,
  requestOrderRefund,
  requestOrderReturn,
  type CustomerOrderDetail,
  type LiveTrackingPayload,
  type ReorderResult,
} from './commerce-api';
import type { FeatureCtx } from './customer-features';
import type { ViewState } from './navigation';
import { NativeTrackTimeline } from './native-screens';
import {
  formatOrderMoney,
  formatPodCaption,
  formatReturnCaption,
  orderTrackIndex,
} from './order-display';
import {
  formatLiveCoords,
  liveJobStatusLabel,
  shouldPollLiveTracking,
} from './live-tracking';

const TRACK_STEPS = ['CONFIRMED', 'ALLOCATED', 'PICKING', 'PACKED', 'SHIPPED', 'DELIVERED'] as const;
const LIVE_TRACK_POLL_MS = 12_000;

export function OrderDetailScreen({
  ctx,
  orderId,
  country,
}: {
  ctx: FeatureCtx;
  orderId: string;
  country: string;
}) {
  const [order, setOrder] = useState<CustomerOrderDetail | null>(null);
  const [viewState, setViewState] = useState<ViewState>('loading');
  const [reorderBusy, setReorderBusy] = useState(false);
  const [afterSalesBusy, setAfterSalesBusy] = useState(false);
  const [reorderResult, setReorderResult] = useState<ReorderResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [live, setLive] = useState<LiveTrackingPayload | null>(null);
  const [liveRefreshing, setLiveRefreshing] = useState(false);

  const load = useCallback(async () => {
    setViewState('loading');
    try {
      const body = await fetchOrder(ctx.token, orderId);
      setOrder(body);
      setLive(body.tracking?.live ?? null);
      setViewState('idle');
    } catch {
      setViewState('network');
    }
  }, [ctx.token, orderId]);

  useEffect(() => {
    void load();
  }, [load]);

  const pollLive = order ? shouldPollLiveTracking(order.status, live) : false;

  useEffect(() => {
    if (!pollLive || !order) return;
    let cancelled = false;
    const tick = () => {
      setLiveRefreshing(true);
      void fetchOrderLiveTracking(ctx.token, order.id)
        .then((body) => {
          if (!cancelled) setLive(body);
        })
        .catch(() => {
          /* keep last snapshot */
        })
        .finally(() => {
          if (!cancelled) setLiveRefreshing(false);
        });
    };
    const id = setInterval(tick, LIVE_TRACK_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [ctx.token, order, pollLive]);

  async function submitReorder() {
    if (!order) return;
    setReorderBusy(true);
    setMessage(null);
    setReorderResult(null);
    try {
      const result = await reorderOrder(ctx.token, order.id, country, `m-reorder-${order.id}-${Date.now()}`);
      setReorderResult(result);
      setMessage(result.message ?? 'Items added to cart.');
    } catch (err) {
      setMessage((err as Error).message ?? 'Reorder failed.');
    } finally {
      setReorderBusy(false);
    }
  }

  async function submitReturn() {
    if (!order) return;
    setAfterSalesBusy(true);
    setMessage(null);
    try {
      await requestOrderReturn(ctx.token, order.id, { reason: 'DAMAGED' });
      setMessage('Return request submitted.');
      await load();
    } catch (err) {
      setMessage((err as Error).message ?? 'Return failed.');
    } finally {
      setAfterSalesBusy(false);
    }
  }

  async function submitRefund() {
    if (!order) return;
    setAfterSalesBusy(true);
    setMessage(null);
    try {
      await requestOrderRefund(ctx.token, order.id);
      setMessage('Refund request submitted (sandbox).');
      await load();
    } catch (err) {
      setMessage((err as Error).message ?? 'Refund failed.');
    } finally {
      setAfterSalesBusy(false);
    }
  }

  if (viewState === 'loading') {
    return <NativeLoadingState title="Loading order" />;
  }
  if (viewState === 'network') {
    return <NativeNetworkErrorState onRetry={() => void load()} />;
  }
  if (!order) {
    return <NativeEmptyState title="Order unavailable" description="Could not load this order." />;
  }

  const index = orderTrackIndex(order.status);
  const canReturn = order.status === 'DELIVERED' && !(order.returns?.length);
  const canRefund =
    order.status === 'DELIVERED' ||
    order.status === 'RETURNED' ||
    order.status === 'REFUND_PENDING' ||
    order.status === 'PARTIALLY_REFUNDED';

  return (
    <View style={{ gap: 12 }}>
      <NativeButton label="Back" variant="secondary" onPress={ctx.onBack} />
      <NativeText variant="h1">{`Order ${order.order_number}`}</NativeText>
      <NativeCard>
        <NativeText>{`Status ${order.status}`}</NativeText>
        {order.seller_name ? <NativeText variant="caption">{`Seller ${order.seller_name}`}</NativeText> : null}
        {order.payment_status ? <NativeText variant="caption">{`Payment ${order.payment_status}`}</NativeText> : null}
        {order.delivery_status ? <NativeText variant="caption">{`Delivery ${order.delivery_status}`}</NativeText> : null}
        <NativeText>{formatOrderMoney(order)}</NativeText>
        <NativeText variant="caption">Sandbox order — same records as customer web.</NativeText>
      </NativeCard>
      {index >= 0 ? (
        <NativeCard>
          <NativeText variant="h2">Progress</NativeText>
          <NativeTrackTimeline steps={[...TRACK_STEPS]} activeIndex={index} />
        </NativeCard>
      ) : null}
      <NativeCard>
        <NativeText variant="h2">{`Live track${liveRefreshing ? ' · updating…' : ''}`}</NativeText>
        {live ? (
          <>
            <NativeText variant="caption">{live.message}</NativeText>
            {live.shipments.length ? (
              live.shipments.map((row) => {
                const coords = formatLiveCoords(row.last_lat, row.last_lng);
                return (
                  <View key={row.shipment_id} style={{ gap: 4, marginTop: 8 }}>
                    <NativeText>{liveJobStatusLabel(row.job_status)}</NativeText>
                    <NativeText variant="caption">
                      {row.assignee_id
                        ? `Rider assigned · ${row.assignee_id.slice(0, 8)}…`
                        : 'Rider not assigned yet'}
                    </NativeText>
                    {row.drop ? (
                      <NativeText variant="caption">
                        {`Drop: ${row.drop.city ?? '—'}${row.drop.postal_code ? ` ${row.drop.postal_code}` : ''}`}
                      </NativeText>
                    ) : null}
                    {coords ? (
                      <NativeText variant="caption">
                        {`Last GPS: ${coords}${row.last_event_type ? ` · ${row.last_event_type}` : ''}`}
                      </NativeText>
                    ) : (
                      <NativeText variant="caption">
                        Rider GPS not reported yet — updates after go-online or arrive/pickup/POD.
                      </NativeText>
                    )}
                  </View>
                );
              })
            ) : (
              <NativeText variant="caption">No shipment job yet.</NativeText>
            )}
          </>
        ) : (
          <NativeText variant="caption">
            Live courier position appears after pack and rider assignment.
          </NativeText>
        )}
      </NativeCard>
      {order.timeline?.length ? (
        <NativeCard>
          <NativeText variant="h2">Timeline</NativeText>
          {order.timeline.map((row) => (
            <NativeText key={`${row.status}-${row.at}`} variant="caption">
              {`${row.status}${row.reason ? ` · ${row.reason}` : ''}`}
            </NativeText>
          ))}
        </NativeCard>
      ) : null}
      {order.items?.length ? (
        <NativeCard>
          <NativeText variant="h2">Items</NativeText>
          {order.items.map((item) => (
            <View key={item.id}>
              <NativeText>{`${item.qty}× ${item.title ?? item.sku}`}</NativeText>
              <NativeText variant="caption">{`${order.currency} ${item.line_minor}${item.rx_required ? ' · Rx required' : ''}`}</NativeText>
            </View>
          ))}
        </NativeCard>
      ) : null}
      {order.shipments?.length ? (
        <NativeCard>
          <NativeText variant="h2">Shipments</NativeText>
          {order.shipments.map((shipment) => (
            <View key={shipment.id}>
              <NativeText>{`${shipment.status}${shipment.tracking_number ? ` · ${shipment.tracking_number}` : ''}`}</NativeText>
              {shipment.pod?.delivered ? (
                <NativeText variant="caption">{formatPodCaption(shipment.pod)}</NativeText>
              ) : null}
            </View>
          ))}
        </NativeCard>
      ) : null}
      {order.returns?.length ? (
        <NativeCard>
          <NativeText variant="h2">Returns</NativeText>
          {order.returns.map((row) => (
            <NativeText key={row.id} variant="caption">
              {formatReturnCaption({
                status: row.status ?? order.return_status,
                reason: row.reason,
              })}
            </NativeText>
          ))}
        </NativeCard>
      ) : null}
      {reorderResult ? (
        <NativeCard>
          <NativeText variant="h2">Reorder summary</NativeText>
          {reorderResult.added.map((line) => (
            <NativeText key={line.offer_id} variant="caption">
              {`Added ${line.qty}× ${line.title}`}
            </NativeText>
          ))}
          {reorderResult.unavailable.map((line) => (
            <NativeText key={`${line.offer_id}-${line.reason_code}`} variant="caption">
              {`${line.title}: ${line.reason}`}
            </NativeText>
          ))}
        </NativeCard>
      ) : null}
      {message ? <NativeText variant="caption">{message}</NativeText> : null}
      {order.reorder_eligible ? (
        <NativeButton
          label={reorderBusy ? 'Adding…' : 'Reorder'}
          disabled={reorderBusy}
          onPress={() => void submitReorder()}
        />
      ) : null}
      {canReturn ? (
        <NativeButton
          label={afterSalesBusy ? 'Submitting…' : 'Request return'}
          variant="secondary"
          disabled={afterSalesBusy}
          onPress={() => void submitReturn()}
        />
      ) : null}
      {canRefund ? (
        <NativeButton
          label={afterSalesBusy ? 'Submitting…' : 'Request refund'}
          variant="secondary"
          disabled={afterSalesBusy}
          onPress={() => void submitRefund()}
        />
      ) : null}
    </View>
  );
}
