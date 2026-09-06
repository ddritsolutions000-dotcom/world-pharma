'use client';

import { useState } from 'react';
import { EmptyState, FormField, Input, LoadingState, Text } from '@world-pharma/ui-kit/web';
import { apiCall } from '@world-pharma/shell-core';
import { formatMoney } from './format-money';
import {
  guestTrackStepIndex,
  orderLifecycleSummary,
  orderStatusLabel,
  orderTrackSteps,
} from './order-status-labels';
import { shipmentLifecycleSummary, shipmentStatusLabel } from './shipment-status-labels';
import { MgBtn, MgCard, Page, ServiceHero } from './ui/mg-ui';

type TrackResult = {
  order_number: string;
  status: string;
  created_at: string;
  currency: string;
  total_minor: string;
  eta_hint: string;
  items: Array<{ title: string; qty: number; line_minor: string }>;
  shipments: Array<{ id: string; status: string; tracking_number: string | null }>;
  history: Array<{ to_status: string; created_at: string }>;
  message: string;
};

export function TrackOrderPage() {
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
      if (response.status === 404) {
        setError('Order not found. Check your order number.');
        return;
      }
      if (response.kind === 'forbidden') {
        setError('Postal code does not match this order.');
        return;
      }
      setError(response.error ?? 'Could not track order.');
      return;
    }
    setResult(response.data);
  }

  const trackIndex = result ? guestTrackStepIndex(result.status) : -1;
  const lifecycle = result ? orderLifecycleSummary(result.status) : null;

  return (
    <Page>
      <ServiceHero
        kicker="Guest tracking"
        title="Track your order"
        subtitle="Enter order number and delivery postal code. Live map + timeline — no login required."
      />
      <MgCard>
        <div className="mg-track-form">
          <FormField label="Order number">
            {({ id }) => (
              <Input
                id={id}
                value={orderNumber}
                onChange={(e) => setOrderNumber(e.target.value)}
                placeholder="e.g. WP-XX-… or DEMO-SBX-001"
              />
            )}
          </FormField>
          <FormField label="Delivery postal code">
            {({ id }) => (
              <Input id={id} value={postalCode} onChange={(e) => setPostalCode(e.target.value)} placeholder="Pincode / postal code" />
            )}
          </FormField>
          <MgBtn onClick={() => void track()} disabled={loading}>
            Track order
          </MgBtn>
        </div>
        {loading ? <LoadingState label="Looking up order…" /> : null}
        {error ? <Text tone="secondary">{error}</Text> : null}
      </MgCard>
      {result ? (
        <MgCard>
          <h2 className="mg-section-title">{result.order_number}</h2>
          <span className="mg-status">{orderStatusLabel(result.status)}</span>
          {lifecycle ? (
            <p className="mg-list-meta">
              {lifecycle.headline}
              {lifecycle.detail ? ` — ${lifecycle.detail}` : ''}
            </p>
          ) : null}
          <p className="mg-list-meta">{result.eta_hint}</p>
          <p className="mg-text-muted">
            Placed {new Date(result.created_at).toLocaleString()} · Total{' '}
            {formatMoney(result.total_minor, result.currency)}
          </p>
          {trackIndex >= 0 ? (
            <>
              <div className="wp-track-live" aria-label="Live delivery map">
                <div className="wp-track-map">
                  <div className="wp-track-route" />
                  <span className="wp-track-pin wp-track-pin--pickup">P</span>
                  <span className="wp-track-pin wp-track-pin--drop">D</span>
                  <span
                    className="wp-track-vehicle"
                    style={{ left: `${Math.min(88, 12 + trackIndex * 18)}%` }}
                  >
                    🚚
                  </span>
                </div>
                <p className="mg-list-meta">
                  Live map view — vehicle position follows order status until carrier GPS is attached.
                </p>
              </div>
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
            </>
          ) : null}
          <ul className="mg-order-list">
            {result.items.map((line, i) => (
              <li key={`${line.title}-${i}`}>
                <MgCard className="mg-order-card" flat>
                  <div className="mg-order-card-top">
                    <p className="mg-list-title">{line.title}</p>
                    <span className="mg-status">× {line.qty}</span>
                  </div>
                  <p className="mg-order-track-hint">{formatMoney(line.line_minor, result.currency)}</p>
                </MgCard>
              </li>
            ))}
          </ul>
          {result.shipments.length ? (
            <>
              <h3 className="mg-section-title">Shipments</h3>
              <ul className="mg-order-list">
                {result.shipments.map((s) => {
                  const shipLife = shipmentLifecycleSummary(s.status);
                  return (
                    <li key={s.id}>
                      <MgCard className="mg-order-card" flat>
                        <div className="mg-order-card-top">
                          <p className="mg-list-title">{shipLife.headline}</p>
                          <span className="mg-status">{shipmentStatusLabel(s.status)}</span>
                        </div>
                        <p className="mg-order-track-hint">
                          {s.tracking_number ? s.tracking_number : 'Tracking pending'}
                        </p>
                      </MgCard>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <p className="mg-text-muted">
              No shipment yet. Fulfillment is in progress at the pharmacy — live carrier tracking remains
              unavailable until a shipment is created (sandbox when present).
            </p>
          )}
          {result.history.length ? (
            <>
              <h3 className="mg-section-title">Status timeline</h3>
              <ol className="mg-timeline">
                {result.history.map((row, index) => (
                  <li key={`${row.to_status}-${row.created_at}-${index}`}>
                    <strong>{orderStatusLabel(row.to_status)}</strong>
                    <span className="mg-text-muted"> · {new Date(row.created_at).toLocaleString()}</span>
                  </li>
                ))}
              </ol>
            </>
          ) : null}
          <p className="mg-text-muted">{result.message}</p>
          <p className="mg-text-muted">Sandbox / guest track only. Live carrier events remain external-gated.</p>
          <MgBtn href="/login" variant="secondary">
            Sign in for full details
          </MgBtn>
        </MgCard>
      ) : null}
      {!result && !loading ? (
        <EmptyState
          title="Have an account?"
          description="Signed-in customers see live updates under Orders and Shipments."
          action={{ label: 'View orders', onClick: () => (window.location.href = '/orders') }}
        />
      ) : null}
    </Page>
  );
}
