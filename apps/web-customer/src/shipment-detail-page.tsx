'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from '@world-pharma/shell-web';
import {
  EmptyState,
  LoadingState,
  NetworkErrorState,
  PermissionDeniedState,
  SessionExpiredState,
} from '@world-pharma/ui-kit/web';
import { fetchShipment, type CustomerShipmentDetail } from './commerce-api';
import { shipmentLifecycleSummary, shipmentStatusLabel } from './shipment-status-labels';
import { AccountHubNav } from './ui/account-hub-nav';
import { MgBtn, MgCard, MgBackLink, Page, PageIntro, ServiceHero } from './ui/mg-ui';

const TRACK_STEPS = ['LABEL_CREATED', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED'];

function stepIndex(status: string): number {
  const i = TRACK_STEPS.indexOf(status);
  return i >= 0 ? i : 0;
}

export function ShipmentDetailScreen({ shipmentId }: { shipmentId: string }) {
  const { session, getAccessToken, signOut, expire } = useSession();
  const [row, setRow] = useState<CustomerShipmentDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<'network' | 'forbidden' | null>(null);

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      setRow((await fetchShipment(token, shipmentId)) as CustomerShipmentDetail);
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status === 401) {
        expire();
        return;
      }
      if (status === 403) setError('forbidden');
      else setError('network');
    } finally {
      setLoading(false);
    }
  }, [expire, getAccessToken, shipmentId]);

  useEffect(() => {
    if (session.status === 'authenticated') void load();
  }, [load, session.status]);

  if (session.status === 'expired') {
    return <SessionExpiredState action={{ label: 'Sign in again', onClick: () => signOut() }} />;
  }
  if (session.status !== 'authenticated' || session.audience !== 'customer') {
    return (
      <Page>
        <ServiceHero
          kicker="Fulfilment rail"
          title="Track delivery"
          subtitle="Sign in to see shipment status from the fulfillment rail."
          compact
        />
        <EmptyState title="Sign in required" description="Login to track your delivery." action={{ label: 'Sign in', onClick: () => (window.location.href = '/login') }} />
      </Page>
    );
  }

  const lifecycle = row ? shipmentLifecycleSummary(row.status) : null;
  const currentStep = row ? stepIndex(row.status) : 0;

  return (
    <Page>
      <AccountHubNav />
      <MgBackLink href="/shipments">← All deliveries</MgBackLink>
      <ServiceHero
        kicker="Fulfilment rail"
        title="Track delivery"
        subtitle={lifecycle?.headline ?? 'Loading status…'}
        compact
      />

      {loading ? <LoadingState label="Loading shipment" /> : null}
      {error === 'forbidden' ? <PermissionDeniedState /> : null}
      {error === 'network' ? <NetworkErrorState action={{ label: 'Retry', onClick: () => void load() }} /> : null}

      {row ? (
        <>
          <MgCard className="mg-order-hero">
            <span className="mg-status">{shipmentStatusLabel(row.status)}</span>
            {lifecycle?.detail ? <p className="mg-list-meta">{lifecycle.detail}</p> : null}
            <p className="mg-detail-datetime">Tracking ID: {row.tracking_number ?? 'Pending assignment'}</p>
            {row.service_level ? <p className="mg-text-muted">Service: {row.service_level}</p> : null}
            {row.message ? <p className="mg-text-muted">{row.message}</p> : null}
            {row.live_tracking === true ? (
              <p className="mg-text-muted">Carrier-provided tracking timestamps are shown below.</p>
            ) : (
              <p className="mg-text-muted">Sandbox / mock carrier — live tracking is external-gated.</p>
            )}
            {row.expected_delivery ? (
              <p className="mg-text-muted">Estimated delivery: {row.expected_delivery}</p>
            ) : null}
            {row.latest_event ? (
              <p className="mg-detail-datetime">
                Latest: {shipmentStatusLabel(row.latest_event.status)} · {String(row.latest_event.at)}
              </p>
            ) : null}
          </MgCard>

          {row.pod ? (
            <MgCard>
              <h2 className="mg-section-title">Proof of delivery</h2>
              <p className="mg-list-meta">
                {row.pod.delivered ? 'Delivered' : 'Not delivered'}
                {row.pod.otp_recorded ? ' · OTP confirmed' : ' · OTP pending'}
                {row.pod.photo_attached ? ' · photo on file (private)' : ' · no photo yet'}
                {row.pod.signature_attached ? ' · signature on file' : ''}
              </p>
              <p className="mg-text-muted">
                {row.pod.note ??
                  'POD metadata only. Private evidence requires an authorized worker ticket — no public URLs.'}
              </p>
            </MgCard>
          ) : null}

          <PageIntro>
            <p>Delivery progress updates when the carrier scans your package. Estimated arrival is shown only when the carrier provides it.</p>
          </PageIntro>

          <div className="mg-track" aria-label="Delivery progress">
            {TRACK_STEPS.map((step, index) => (
              <div
                key={step}
                className={`mg-track-step${index <= currentStep ? ' is-done' : ''}${index === currentStep ? ' is-current' : ''}`}
              >
                <span className="mg-track-dot" aria-hidden />
                <span className="mg-track-label">{shipmentStatusLabel(step)}</span>
              </div>
            ))}
          </div>

          {row.timeline.length > 0 ? (
            <MgCard>
              <h2 className="mg-section-title">Updates</h2>
              <ul className="mg-timeline-list">
                {row.timeline.map((event, index) => (
                  <li key={`${event.status}-${event.at}-${index}`} className="mg-timeline-item">
                    <strong>{shipmentStatusLabel(event.status)}</strong>
                    {event.description ? <span>{event.description}</span> : null}
                    <time>{event.at}</time>
                  </li>
                ))}
              </ul>
            </MgCard>
          ) : !loading ? (
            <EmptyState title="No updates yet" description="Tracking events appear when your order ships." />
          ) : null}

          {row.attempts.length > 0 ? (
            <MgCard>
              <h2 className="mg-section-title">Delivery attempts</h2>
              <ul className="mg-order-list">
                {row.attempts.map((attempt) => (
                  <li key={attempt.attempt_no}>
                    <p className="mg-text-muted">
                      Attempt {attempt.attempt_no}: {attempt.status}
                      {attempt.reason ? ` — ${attempt.reason}` : ''}
                    </p>
                  </li>
                ))}
              </ul>
            </MgCard>
          ) : null}

          <MgBtn href="/orders" variant="ghost">
            View my orders
          </MgBtn>
        </>
      ) : null}
    </Page>
  );
}
