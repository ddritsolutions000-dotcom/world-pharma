'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from '@world-pharma/shell-web';
import {
  EmptyState,
  LoadingState,
  NetworkErrorState,
  PermissionDeniedState,
  Text,
} from '@world-pharma/ui-kit/web';

import {
  fetchCustomerPrescriptions,
  fetchCustomerSubscriptions,
  fetchRefillRequests,
  type Prescription,
  type RefillRequest,
  type RxSubscriptionListItem,
} from './care-api';
import {
  activeSubscriptions,
  openRefillRequests,
  refillRequestStatusLabel,
  rxSubscriptionStatusLabel,
  subscriptionSummaryLine,
} from './refill-subscription-ui';
import { RxSubscriptionPanel } from './rx-subscription-panel';
import { MgBtn, MgCard, Page, PageIntro, Section, ServiceHero } from './ui/mg-ui';

export function SubscriptionsScreen() {
  const { session, getAccessToken, expire } = useSession();
  const [subscriptions, setSubscriptions] = useState<RxSubscriptionListItem[]>([]);
  const [refillRequests, setRefillRequests] = useState<RefillRequest[]>([]);
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<'network' | 'forbidden' | null>(null);

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token || session.status !== 'authenticated') {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [subsBody, refillBody, rxBody] = await Promise.all([
        fetchCustomerSubscriptions(token),
        fetchRefillRequests(token),
        fetchCustomerPrescriptions(token),
      ]);
      setSubscriptions(subsBody.subscriptions ?? []);
      setRefillRequests(refillBody.requests ?? []);
      setPrescriptions(rxBody.prescriptions ?? []);
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      if (status === 403) {
        setError('forbidden');
      } else if (status === 401) {
        expire();
      } else {
        setError('network');
      }
      setSubscriptions([]);
      setRefillRequests([]);
      setPrescriptions([]);
    } finally {
      setLoading(false);
    }
  }, [expire, getAccessToken, session.status]);

  useEffect(() => {
    if (session.status === 'authenticated') {
      void load();
    }
  }, [session.status, load]);

  const token = getAccessToken();
  const openRequests = openRefillRequests(refillRequests);
  const activeSubs = activeSubscriptions(subscriptions);
  const eligibleRx = prescriptions.filter(
    (row) => row.status !== 'DRAFT' && row.status !== 'CANCELLED' && row.status !== 'EXPIRED',
  );
  const withoutReminder = eligibleRx.filter(
    (row) => !subscriptions.some((sub) => sub.prescription_id === row.id && sub.status === 'ACTIVE'),
  );

  return (
    <Page>
      <ServiceHero
        kicker="Refill reminders"
        title="Medicine subscriptions"
        subtitle="Get notified when it is time to reorder. Auto-payment stays off; you approve each refill."
        compact
      />
      <PageIntro>
        <p>
          Turn on reminders for chronic medicines. When your supply runs low, we nudge you to request a refill from your
          doctor — no surprise charges in sandbox.
        </p>
      </PageIntro>

      {session.status !== 'authenticated' ? (
        <MgCard>
          <Text tone="secondary">Sign in to manage refill reminders for your prescriptions.</Text>
          <MgBtn href="/login">Sign in</MgBtn>
        </MgCard>
      ) : null}

      {session.status === 'authenticated' && session.audience !== 'customer' ? <PermissionDeniedState /> : null}

      {session.status === 'authenticated' && session.audience === 'customer' ? (
        <>
          {loading ? <LoadingState label="Loading subscriptions" /> : null}
          {error === 'forbidden' ? <PermissionDeniedState /> : null}
          {error === 'network' ? (
            <NetworkErrorState action={{ label: 'Retry', onClick: () => void load() }} />
          ) : null}

          {!loading && !error ? (
            <>
              <Section title="Open refill requests">
                {openRequests.length === 0 ? (
                  <MgCard flat>
                    <Text tone="secondary">No pending refill requests.</Text>
                    <MgBtn href="/prescriptions" variant="ghost" size="sm">
                      View prescriptions
                    </MgBtn>
                  </MgCard>
                ) : (
                  <ul className="mg-order-list">
                    {openRequests.map((row) => (
                      <li key={row.id}>
                        <MgCard>
                          <span className="mg-status">{refillRequestStatusLabel(row.status)}</span>
                          <strong>Prescription {row.prescription_id.slice(0, 8)}</strong>
                          <span className="mg-list-meta">
                            {row.created_at ? new Date(row.created_at).toLocaleDateString() : '—'}
                          </span>
                          <MgBtn href="/prescriptions" variant="ghost" size="sm">
                            Manage
                          </MgBtn>
                        </MgCard>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>

              <Section title={`Active reminders (${activeSubs.length})`}>
                {activeSubs.length === 0 ? (
                  <MgCard flat>
                    <Text tone="secondary">No refill reminders turned on yet.</Text>
                  </MgCard>
                ) : (
                  <ul className="mg-order-list">
                    {activeSubs.map((row) => (
                      <li key={row.prescription_id}>
                        <MgCard>
                          <span className={`mg-subscription-badge is-${row.status.toLowerCase()}`}>
                            {rxSubscriptionStatusLabel(row.status)}
                          </span>
                          <strong>{row.medicine_label ?? `Prescription v${row.prescription_version_number ?? '—'}`}</strong>
                          <p className="mg-list-meta">{subscriptionSummaryLine(row)}</p>
                          <MgBtn
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setSelectedId(selectedId === row.prescription_id ? null : row.prescription_id)
                            }
                          >
                            {selectedId === row.prescription_id ? 'Hide' : 'Manage'}
                          </MgBtn>
                          {selectedId === row.prescription_id && token ? (
                            <RxSubscriptionPanel
                              prescriptionId={row.prescription_id}
                              token={token}
                              onUnauthorized={expire}
                              compact
                            />
                          ) : null}
                        </MgCard>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>

              <Section title="Add reminders">
                {withoutReminder.length === 0 ? (
                  <EmptyState
                    title="All set"
                    description="Eligible prescriptions already have reminders or none are available."
                    action={{ label: 'Upload prescription', onClick: () => (window.location.href = '/prescriptions') }}
                  />
                ) : (
                  <ul className="mg-order-list">
                    {withoutReminder.map((row) => (
                      <li key={row.id}>
                        <MgCard>
                          <strong>Prescription · v{row.current_version_number ?? '—'}</strong>
                          <span className="mg-list-meta">{row.status.replace(/_/g, ' ')}</span>
                          <MgBtn
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedId(selectedId === row.id ? null : row.id)}
                          >
                            {selectedId === row.id ? 'Hide' : 'Set up reminders'}
                          </MgBtn>
                          {selectedId === row.id && token ? (
                            <RxSubscriptionPanel
                              prescriptionId={row.id}
                              token={token}
                              onUnauthorized={expire}
                              compact
                            />
                          ) : null}
                        </MgCard>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>

              <div className="mg-toolbar">
                <MgBtn href="/prescriptions" variant="secondary">
                  All prescriptions
                </MgBtn>
                <MgBtn href="/orders" variant="ghost">
                  My orders
                </MgBtn>
              </div>
            </>
          ) : null}
        </>
      ) : null}
    </Page>
  );
}
