'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useSession } from '@world-pharma/shell-web';
import { EmptyState, FormField, LoadingState, Select, Text, TextArea } from '@world-pharma/ui-kit/web';
import {
  fetchOrder,
  fetchOrderLiveTracking,
  reorderOrder,
  requestOrderCancel,
  requestOrderRefund,
  requestOrderReturn,
  type CustomerOrder,
  type LiveTrackingPayload,
  type ReorderResult,
  type ReturnReasonCode,
} from './commerce-api';
import { useSelectedCountry } from './use-selected-country';
import { formatMoney } from './format-money';
import {
  canRequestRefund,
  canRequestReturn,
  canReviewOrder,
  RETURN_REASON_OPTIONS,
  returnReasonLabel,
} from './order-after-sales';
import {
  orderLifecycleSummary,
  orderStatusLabel,
  orderTrackStepIndex,
  orderTrackSteps,
} from './order-status-labels';
import { shipmentLifecycleSummary, shipmentStatusLabel } from './shipment-status-labels';
import { shouldPollLiveTracking } from './live-tracking';
import { LiveTrackingPanel } from './live-tracking-panel';
import { AccountHubNav } from './ui/account-hub-nav';
import { OrderItemReviewPanel } from './order-item-review';
import { MgBtn, MgCard, MgBackLink, Page, ServiceHero } from './ui/mg-ui';

const LIVE_TRACK_POLL_MS = 12_000;

function paymentStatusLabel(order: CustomerOrder): string {
  const orderStatus = order.status;
  if (orderStatus === 'REFUND_PENDING') return 'refund pending';
  if (orderStatus === 'REFUNDED') return 'refund completed';
  if (orderStatus === 'PARTIALLY_REFUNDED') return 'partially refunded';
  const status = order.payment?.status;
  if (status === 'CAPTURED' || status === 'AUTHORIZED' || status === 'AUTHORIZED_COD') {
    return 'payment successful';
  }
  if (status === 'FAILED' || status === 'CANCELLED' || status === 'EXPIRED') {
    return 'payment failed';
  }
  if (status === 'PROCESSING' || status === 'REQUIRES_ACTION' || status === 'CREATED') {
    return 'payment pending';
  }
  if (status) return status.replaceAll('_', ' ').toLowerCase();
  if (order.payment?.payment_intent_id || order.payment_intent_id) return 'payment successful';
  return 'payment pending';
}

export function OrderDetailScreen({ orderNumber }: { orderNumber: string }) {
  const { session, getAccessToken } = useSession();
  const { country } = useSelectedCountry();
  const [order, setOrder] = useState<CustomerOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [reorderBusy, setReorderBusy] = useState(false);
  const [reorderResult, setReorderResult] = useState<ReorderResult | null>(null);
  const [returnReason, setReturnReason] = useState<ReturnReasonCode>('DAMAGED');
  const [returnNote, setReturnNote] = useState('');
  const [afterSalesBusy, setAfterSalesBusy] = useState(false);
  const [live, setLive] = useState<LiveTrackingPayload | null>(null);
  const [liveRefreshing, setLiveRefreshing] = useState(false);

  const load = useCallback(() => {
    const token = getAccessToken();
    if (!token || session.status !== 'authenticated') {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    void fetchOrder(token, orderNumber)
      .then((body) => {
        const next = body as CustomerOrder;
        setOrder(next);
        setLive(next.tracking?.live ?? null);
      })
      .catch((err: { message?: string }) => setError(err.message ?? 'Order could not be loaded.'))
      .finally(() => setLoading(false));
  }, [getAccessToken, orderNumber, session.status]);

  useEffect(() => {
    load();
  }, [load]);

  const pollLive = order ? shouldPollLiveTracking(order.status, live) : false;

  useEffect(() => {
    const token = getAccessToken();
    if (!token || session.status !== 'authenticated' || !order || !pollLive) return;

    let cancelled = false;
    const tick = () => {
      setLiveRefreshing(true);
      void fetchOrderLiveTracking(token, order.id)
        .then((body) => {
          if (!cancelled) setLive(body);
        })
        .catch(() => {
          /* keep last good snapshot */
        })
        .finally(() => {
          if (!cancelled) setLiveRefreshing(false);
        });
    };

    const id = window.setInterval(tick, LIVE_TRACK_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [getAccessToken, order, pollLive, session.status]);

  if (session.status !== 'authenticated') {
    return (
      <Page>
        <EmptyState title="Sign in required" description="Login to view this order." action={{ label: 'Sign in', onClick: () => (window.location.href = '/login') }} />
      </Page>
    );
  }
  if (loading) return <LoadingState label="Loading order" />;
  if (error) {
    return (
      <Page>
        <AccountHubNav />
        <ServiceHero kicker="Order tracking" title="Order detail" subtitle="We could not load this order." compact />
        <EmptyState
          title="Order unavailable"
          description={
            error.includes('unexpected')
              ? 'This order could not be loaded. It may have been renamed or removed. Return to My Orders and open it from the list.'
              : error
          }
          action={{ label: 'Back to My Orders', onClick: () => (window.location.href = '/orders') }}
        />
        <MgBtn variant="ghost" onClick={load}>
          Retry
        </MgBtn>
      </Page>
    );
  }
  if (!order) {
    return (
      <Page>
        <EmptyState title="Order unavailable" description="Could not load this order." />
      </Page>
    );
  }

  async function cancel() {
    const token = getAccessToken();
    if (!token || !order) return;
    try {
      await requestOrderCancel(token, order.id, `cancel-${Date.now()}`);
      setMessage('Cancellation requested.');
      load();
    } catch (err) {
      setMessage((err as { message?: string }).message ?? 'Cancel was not allowed.');
    }
  }

  async function submitReturn() {
    const token = getAccessToken();
    if (!token || !order) return;
    setAfterSalesBusy(true);
    setMessage(null);
    try {
      await requestOrderReturn(token, order.id, { reason: returnReason, note: returnNote.trim() || undefined });
      setMessage('Return request submitted.');
      setReturnNote('');
      load();
    } catch (err) {
      setMessage((err as { message?: string }).message ?? 'Return could not be submitted.');
    } finally {
      setAfterSalesBusy(false);
    }
  }

  async function submitRefund() {
    const token = getAccessToken();
    if (!token || !order) return;
    setAfterSalesBusy(true);
    setMessage(null);
    try {
      await requestOrderRefund(token, order.id);
      setMessage('Refund request submitted. Processing may take a few days in sandbox.');
      load();
    } catch (err) {
      setMessage((err as { message?: string }).message ?? 'Refund could not be requested.');
    } finally {
      setAfterSalesBusy(false);
    }
  }

  async function submitReorder() {
    const token = getAccessToken();
    if (!token || !order) return;
    setReorderBusy(true);
    setMessage(null);
    setReorderResult(null);
    try {
      const result = await reorderOrder(token, order.id, country, `reorder-${order.id}-${Date.now()}`);
      setReorderResult(result);
      setMessage(result.message ?? 'Items added to cart.');
    } catch (err) {
      setMessage((err as { message?: string }).message ?? 'Reorder could not be completed.');
    } finally {
      setReorderBusy(false);
    }
  }

  const lifecycle = orderLifecycleSummary(order.status);
  const trackIndex = orderTrackStepIndex(order.status);
  const showTrack = trackIndex >= 0;
  const showReturnForm = canRequestReturn(order.status) && !order.returns?.length;
  const showRefundAction = canRequestRefund(order.status);
  const showReviewPanel = canReviewOrder(order.status);
  const refundInProgress =
    order.status === 'REFUND_PENDING' || order.status === 'REFUNDED' || order.status === 'PARTIALLY_REFUNDED';

  return (
    <Page>
      <AccountHubNav />
      <MgBackLink href="/orders">← My orders</MgBackLink>
      <ServiceHero
        kicker="Order tracking"
        title={`Order #${order.order_number}`}
        subtitle={lifecycle.headline}
        compact
      />

      <MgCard className="mg-order-hero">
        <span className="mg-status">{orderStatusLabel(order.status)}</span>
        {lifecycle.detail ? <p className="mg-list-meta">{lifecycle.detail}</p> : null}
        {order.seller_name ? <p className="mg-list-meta">Seller · {order.seller_name}</p> : null}
        <div className="mg-summary-row">
          <span>Order total</span>
          <strong>{formatMoney(order.total_minor, order.currency)}</strong>
        </div>
        {(order.goods_minor || order.tax_minor || order.shipping_minor || order.discount_minor) && (
          <dl className="mg-order-breakdown">
            {order.goods_minor ? (
              <div>
                <dt>Items</dt>
                <dd>{formatMoney(order.goods_minor, order.currency)}</dd>
              </div>
            ) : null}
            {order.discount_minor && order.discount_minor !== '0' ? (
              <div>
                <dt>Discount</dt>
                <dd>−{formatMoney(order.discount_minor, order.currency)}</dd>
              </div>
            ) : null}
            {order.shipping_minor && order.shipping_minor !== '0' ? (
              <div>
                <dt>Delivery</dt>
                <dd>{formatMoney(order.shipping_minor, order.currency)}</dd>
              </div>
            ) : null}
            {order.tax_minor && order.tax_minor !== '0' ? (
              <div>
                <dt>Tax</dt>
                <dd>{formatMoney(order.tax_minor, order.currency)}</dd>
              </div>
            ) : null}
          </dl>
        )}
        <p className="mg-text-muted">
          Payment {paymentStatusLabel(order)}
          {order.sandbox !== false ? ' · Sandbox' : ''}
          {order.prescription_id ? ' · Prescription order' : ''}
        </p>
      </MgCard>

      {showTrack ? (
        <div className="mg-track" aria-label="Order progress">
          {orderTrackSteps().map((step, index) => (
            <div
              key={step}
              className={`mg-track-step${index <= trackIndex ? ' is-done' : ''}${index === trackIndex ? ' is-current' : ''}`}
            >
              <span className="mg-track-dot" aria-hidden />
              <span className="mg-track-label">{orderStatusLabel(step)}</span>
            </div>
          ))}
        </div>
      ) : null}

      <LiveTrackingPanel live={live} refreshing={liveRefreshing} />

      {order.history?.length ? (
        <MgCard>
          <h2 className="mg-section-title">Status history</h2>
          <ol className="mg-timeline">
            {order.history.map((row, index) => (
              <li key={`${row.toStatus}-${row.createdAt}-${index}`}>
                <strong>{orderStatusLabel(row.toStatus)}</strong>
                <span className="mg-text-muted">
                  {' '}
                  · {new Date(row.createdAt).toLocaleString()}
                  {row.reason ? ` · ${row.reason}` : ''}
                </span>
              </li>
            ))}
          </ol>
        </MgCard>
      ) : null}

      {order.shipments?.length ? (
        <MgCard>
          <h2 className="mg-section-title">Delivery</h2>
          <ul className="mg-order-list">
            {order.shipments.map((shipment) => {
              const shipLifecycle = shipmentLifecycleSummary(shipment.status);
              return (
                <li key={shipment.id}>
                  <div className="mg-list-item">
                    <div>
                      <p className="mg-list-title">{shipLifecycle.headline}</p>
                      <p className="mg-list-meta">{shipmentStatusLabel(shipment.status)}</p>
                      {shipment.tracking_number ? (
                        <p className="mg-text-muted">Tracking {shipment.tracking_number}</p>
                      ) : null}
                      {shipment.pod?.delivered ? (
                        <p className="mg-text-muted">
                          POD · OTP {shipment.pod.otp_recorded ? 'recorded' : 'not recorded'}
                          {shipment.pod.photo_attached ? ' · photo' : ''}
                          {shipment.pod.signature_attached ? ' · signature' : ''}
                          {shipment.pod.sandbox !== false ? ' · sandbox' : ''}
                        </p>
                      ) : null}
                    </div>
                    <MgBtn size="sm" href={`/shipments/${shipment.id}`}>
                      Track
                    </MgBtn>
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="mg-text-muted">Sandbox carrier tracking. Live carrier events remain external-gated.</p>
        </MgCard>
      ) : (
        <MgCard>
          <h2 className="mg-section-title">Delivery</h2>
          <p className="mg-list-meta">No shipment yet</p>
          <p className="mg-text-muted">
            A shipment appears after the pharmacy packs and hands off to the carrier abstraction. Until then,
            use the order status timeline above. Live carrier tracking is not available.
          </p>
          <div className="mg-toolbar">
            <MgBtn href="/shipments" size="sm" variant="secondary">
              Open shipments
            </MgBtn>
            <MgBtn href="/track-order" size="sm" variant="ghost">
              Guest track
            </MgBtn>
          </div>
        </MgCard>
      )}

      {order.returns?.length ? (
        <MgCard>
          <h2 className="mg-section-title">Returns</h2>
          <ul className="mg-order-list">
            {order.returns.map((row) => (
              <li key={row.id}>
                <p className="mg-list-title">
                  {row.status ?? order.return_status ?? 'REQUESTED'} · {returnReasonLabel(row.reason as ReturnReasonCode)}
                </p>
                <p className="mg-text-muted">
                  {row.created_at || row.createdAt
                    ? new Date(row.created_at ?? row.createdAt!).toLocaleString()
                    : ''}
                </p>
                {row.pickup_slot_start ? (
                  <p className="mg-text-muted">
                    Pickup:{' '}
                    {new Date(row.pickup_slot_start).toLocaleString()}
                    {row.pickup_slot_end ? ` – ${new Date(row.pickup_slot_end).toLocaleString()}` : ''}
                  </p>
                ) : null}
                {row.tracking_number ? (
                  <p className="mg-text-muted">Return tracking: {row.tracking_number}</p>
                ) : null}
                {row.note ? <p>{row.note}</p> : null}
              </li>
            ))}
          </ul>
        </MgCard>
      ) : null}

      {refundInProgress ? (
        <MgCard flat>
          <p className="mg-list-title">{orderStatusLabel(order.status)}</p>
          <p className="mg-text-muted">
            Refunds are processed to your original payment method. Internal finance details are not shown here.
          </p>
        </MgCard>
      ) : null}

      {order.prescription_id ? (
        <MgCard flat>
          <p className="mg-text-muted">
            This order used a prescription. View details under <Link href="/prescriptions">My prescriptions</Link>.
          </p>
        </MgCard>
      ) : null}

      {order.items?.length ? (
        <MgCard>
          <h2 className="mg-section-title">Items</h2>
          <ul className="mg-order-list">
            {order.items.map((item) => (
              <li key={item.id}>
                <div className="mg-order-card-top">
                  <p className="mg-list-title">
                    {item.title ?? item.sku} × {item.qty}
                    {item.rx_required ? ' · Rx required' : ''}
                  </p>
                  <span className="mg-status">{formatMoney(item.line_minor, order.currency)}</span>
                </div>
              </li>
            ))}
          </ul>
        </MgCard>
      ) : null}

      {showReviewPanel && order.items?.length ? (
        <MgCard>
          <OrderItemReviewPanel
            token={getAccessToken() ?? ''}
            orderId={order.id}
            items={order.items}
          />
        </MgCard>
      ) : null}

      {showReturnForm ? (
        <MgCard>
          <h2 className="mg-section-title">Request a return</h2>
          <p className="mg-text-muted">Returns follow your market&apos;s policy. Prescription items may have restrictions.</p>
          <FormField label="Reason">
            {({ id }) => (
              <Select id={id} value={returnReason} onChange={(e) => setReturnReason(e.target.value as ReturnReasonCode)}>
                {RETURN_REASON_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
          <FormField label="Notes (optional)">
            {({ id }) => (
              <TextArea id={id} rows={3} value={returnNote} onChange={(e) => setReturnNote(e.target.value)} />
            )}
          </FormField>
          <MgBtn variant="secondary" disabled={afterSalesBusy} onClick={() => void submitReturn()}>
            Submit return request
          </MgBtn>
        </MgCard>
      ) : null}

      {reorderResult ? (
        <MgCard>
          <h2 className="mg-section-title">Reorder summary</h2>
          {reorderResult.added.length ? (
            <ul className="mg-order-list">
              {reorderResult.added.map((line) => (
                <li key={line.offer_id}>
                  Added {line.qty}× {line.title}
                  {line.current_sell_minor ? ` at ${formatMoney(line.current_sell_minor, order.currency)} each` : ''}
                  {line.rx_required ? ' (Rx required at checkout)' : ''}
                </li>
              ))}
            </ul>
          ) : null}
          {reorderResult.unavailable.length ? (
            <>
              <p className="mg-text-muted">Unavailable items</p>
              <ul className="mg-order-list">
                {reorderResult.unavailable.map((line) => (
                  <li key={`${line.offer_id}-${line.reason_code}`}>
                    {line.qty}× {line.title}: {line.reason}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {reorderResult.added.length ? (
            <MgBtn href="/cart">Review cart & checkout</MgBtn>
          ) : null}
        </MgCard>
      ) : null}

      <div className="mg-toolbar mg-toolbar-wrap">
        {order.reorder_eligible ? (
          <MgBtn disabled={reorderBusy} onClick={() => void submitReorder()}>
            {reorderBusy ? 'Adding to cart…' : 'Reorder'}
          </MgBtn>
        ) : (
          <>
            <Text size="caption" tone="secondary">
              Reorder is available after delivery only. Current status:{' '}
              <strong>{orderStatusLabel(order.status)}</strong>
              {order.status !== 'DELIVERED'
                ? ' — track this order until it is delivered, then return here to reorder.'
                : ' — this order has no reorderable line items.'}
            </Text>
            {order.items?.[0] ? (
              <MgBtn href="/buy-again" variant="ghost">
                Browse buy again
              </MgBtn>
            ) : null}
          </>
        )}
        {showRefundAction ? (
          <MgBtn variant="secondary" disabled={afterSalesBusy} onClick={() => void submitRefund()}>
            Request refund
          </MgBtn>
        ) : null}
        {order.status === 'CONFIRMED' || order.status === 'ALLOCATED' ? (
          <MgBtn variant="secondary" onClick={() => void cancel()}>
            Request cancellation
          </MgBtn>
        ) : null}
        <MgBtn href="/account/support" variant="ghost">
          Get help
        </MgBtn>
        <MgBtn href="/" variant="ghost">
          Continue shopping
        </MgBtn>
      </div>
      {message ? <Text>{message}</Text> : null}
      {!showReturnForm && !showRefundAction && order.status === 'DELIVERED' ? (
        <p className="mg-text-muted">
          Need help with this order?{' '}
          <Link href="/legal/returns">View return policy</Link> or <Link href="/account/support">contact support</Link>.
        </p>
      ) : null}
    </Page>
  );
}
