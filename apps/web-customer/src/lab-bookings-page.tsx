'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from '@world-pharma/shell-web';
import {
  Button,
  Card,
  EmptyState,
  Heading,
  LoadingState,
  NetworkErrorState,
  PermissionDeniedState,
  SessionExpiredState,
  Text,
} from '@world-pharma/ui-kit/web';
import {
  cancelLabBooking,
  fetchLabBooking,
  fetchLabBookingCollection,
  fetchLabReport,
  fetchLabReportStatus,
  fetchPhysicalReportEligibility,
  fetchPhysicalReportStatus,
  requestPhysicalReport,
  cancelPhysicalReport,
  fetchLabBookings,
  payLabBooking,
  LabCustomerApiError,
  type LabBooking,
  type LabBookingCollection,
  type PhysicalReportEligibility,
  type PhysicalReportStatus,
} from './lab-api';
import { LAB_TRACK_STEPS, labBookingStatusLabel, labLifecycleSummary, labTrackStepIndex } from './lab-status-labels';
import { formatMoney } from './format-money';
import { MgBackLink, MgBtn, MgCard, Page, PageIntro, ServiceHero } from './ui/mg-ui';

function newIdempotencyKey(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function LabBookingsScreen() {
  const { session, getAccessToken, signOut, expire } = useSession();
  const [rows, setRows] = useState<LabBooking[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<'network' | 'forbidden' | 'generic' | null>(null);

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const body = await fetchLabBookings(token);
      setRows(body.data);
    } catch (err) {
      if (err instanceof LabCustomerApiError) {
        if (err.status === 401) {
          expire();
          return;
        }
        if (err.status === 403) {
          setError('forbidden');
          return;
        }
        if (err.status === 0) {
          setError('network');
          return;
        }
      }
      setError('generic');
    } finally {
      setLoading(false);
    }
  }, [expire, getAccessToken]);

  useEffect(() => {
    if (session.status === 'authenticated') {
      void load();
    }
  }, [load, session.status]);

  if (session.status === 'expired') {
    return <SessionExpiredState action={{ label: 'Sign in again', onClick: () => signOut() }} />;
  }

  if (session.status !== 'authenticated') {
    return (
      <Page>
        <ServiceHero
          kicker="Diagnostics"
          title="Lab bookings"
          subtitle="Track sample collection and view reports."
          tone="lab"
          compact
        />
        <EmptyState title="Sign in required" description="Login to view your lab bookings." action={{ label: 'Sign in', onClick: () => (window.location.href = '/login') }} />
        <MgBtn href="/lab" variant="secondary">Browse lab tests</MgBtn>
      </Page>
    );
  }

  return (
    <Page>
      <ServiceHero
        kicker="Diagnostics"
        title="Lab bookings"
        subtitle="Diagnostics bookings — collection status after payment."
        tone="lab"
        compact
      />
      <PageIntro>
        <p>Home collection and center visits. Final reports unlock in booking details when the lab publishes results.</p>
      </PageIntro>
      <MgBtn href="/lab" variant="secondary">Browse lab tests</MgBtn>
      {loading ? <LoadingState label="Loading lab bookings" /> : null}
      {error === 'network' ? <NetworkErrorState action={{ label: 'Retry', onClick: () => void load() }} /> : null}
      {error === 'forbidden' ? <PermissionDeniedState /> : null}
      {!loading && !error && rows.length === 0 ? (
        <EmptyState title="No lab bookings" description="Book a lab test to see status here." action={{ label: 'Book a test', onClick: () => (window.location.href = '/lab') }} />
      ) : null}
      <ul className="mg-order-list">
        {rows.map((row) => (
          <li key={row.id}>
            <MgCard className="mg-order-card">
              <div className="mg-order-card-top">
                <div>
                  <p className="mg-list-title">{row.lines[0]?.title ?? 'Lab booking'}</p>
                  <p className="mg-list-meta">
                    {row.collection_mode} · {formatMoney(row.total_minor, row.currency)}
                  </p>
                  <p className="mg-order-track-hint">{row.lab_display_name}</p>
                </div>
                <span className="mg-status">{labBookingStatusLabel(row.status)}</span>
              </div>
              <div className="mg-list-actions">
                <MgBtn size="sm" variant="secondary" href={`/lab/bookings/${row.id}`}>
                  Details
                </MgBtn>
                {row.status === 'BOOKED' || row.status === 'PAYMENT_FAILED' ? (
                  <MgBtn size="sm" variant="ghost" onClick={() => void cancelLabBooking(getAccessToken() ?? '', row.id).then(load)}>
                    Cancel
                  </MgBtn>
                ) : null}
              </div>
            </MgCard>
          </li>
        ))}
      </ul>
    </Page>
  );
}

export function LabBookingDetailScreen({ id }: { id: string }) {
  const { session, getAccessToken, signOut, expire } = useSession();
  const [row, setRow] = useState<LabBooking | null>(null);
  const [collection, setCollection] = useState<LabBookingCollection | null>(null);
  const [report, setReport] = useState<Awaited<ReturnType<typeof fetchLabReport>> | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<'network' | 'forbidden' | 'unavailable' | 'generic' | null>(null);
  const [physicalEligibility, setPhysicalEligibility] = useState<PhysicalReportEligibility | null>(null);
  const [physicalStatus, setPhysicalStatus] = useState<PhysicalReportStatus | null>(null);
  const [physicalLoading, setPhysicalLoading] = useState(false);
  const [physicalError, setPhysicalError] = useState<'network' | 'forbidden' | 'unavailable' | 'generic' | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [error, setError] = useState<'network' | 'forbidden' | 'generic' | null>(null);

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [booking, collectionBody] = await Promise.all([
        fetchLabBooking(token, id),
        fetchLabBookingCollection(token, id),
      ]);
      setRow(booking);
      setCollection(collectionBody);
    } catch (err) {
      if (err instanceof LabCustomerApiError) {
        if (err.status === 401) {
          expire();
          return;
        }
        if (err.status === 403) {
          setError('forbidden');
          return;
        }
        if (err.status === 0) {
          setError('network');
          return;
        }
      }
      setError('generic');
    } finally {
      setLoading(false);
    }
  }, [expire, getAccessToken, id]);

  useEffect(() => {
    if (session.status === 'authenticated') {
      void load();
    }
  }, [load, session.status]);

  async function retryPay(scenario: 'success' | 'failed') {
    const token = getAccessToken();
    if (!token || !row) {
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      const paid = await payLabBooking(token, row.id, newIdempotencyKey('lab-repay'), scenario);
      if (paid.status === 'CAPTURED') {
        await load();
        return;
      }
      setFormError(`Sandbox payment ended as ${paid.status}.`);
      await load();
    } catch (err) {
      if (err instanceof LabCustomerApiError) {
        setFormError(err.message);
      } else {
        setFormError('Payment could not be completed.');
      }
    } finally {
      setBusy(false);
    }
  }

  if (session.status === 'expired') {
    return <SessionExpiredState action={{ label: 'Sign in again', onClick: () => signOut() }} />;
  }

  if (session.status !== 'authenticated') {
    return (
      <Page>
        <MgBackLink href="/lab/bookings">← Back to bookings</MgBackLink>
        <EmptyState title="Sign in required" description="Login to view your lab bookings." action={{ label: 'Sign in', onClick: () => (window.location.href = '/login') }} />
      </Page>
    );
  }

  const lifecycle = row && collection ? labLifecycleSummary(row.status, collection) : null;
  const trackIndex = row ? labTrackStepIndex(row.status, collection) : -1;

  return (
    <Page>
      <MgBackLink href="/lab/bookings">← Back to bookings</MgBackLink>
      {loading ? <LoadingState label="Loading booking…" /> : null}
      {error === 'network' ? <NetworkErrorState action={{ label: 'Retry', onClick: () => void load() }} /> : null}
      {error === 'forbidden' ? <PermissionDeniedState /> : null}
      {error === 'generic' ? <EmptyState title="Booking unavailable" description="Could not load this booking." /> : null}
      {row ? (
        <MgCard className="mg-order-hero">
          <h2 className="mg-section-title">{row.lines[0]?.title ?? 'Lab booking'}</h2>
          <span className="mg-status">{labBookingStatusLabel(row.status)}</span>
          {lifecycle ? (
            <p className="mg-list-meta">
              {lifecycle.headline}
              {lifecycle.detail ? ` — ${lifecycle.detail}` : ''}
            </p>
          ) : null}
          <p className="mg-text-muted">
            {row.collection_mode} · {formatMoney(row.total_minor, row.currency)}
          </p>
          <p className="mg-text-muted">{row.lab_display_name}</p>
          {row.slot_starts_at ? <p className="mg-detail-datetime">Slot: {new Date(row.slot_starts_at).toLocaleString()}</p> : null}
          {row.lab_location ? <p className="mg-text-muted">Center: {row.lab_location.name}</p> : null}
          {trackIndex >= 0 ? (
            <div className="mg-track" aria-label="Lab booking progress">
              {LAB_TRACK_STEPS.map((step, index) => (
                <div
                  key={step}
                  className={`mg-track-step${index <= trackIndex ? ' is-done' : ''}${index === trackIndex ? ' is-current' : ''}`}
                >
                  <span className="mg-track-dot" aria-hidden />
                  <span className="mg-track-label">{step}</span>
                </div>
              ))}
            </div>
          ) : null}
        </MgCard>
      ) : null}
      {row && (row.status === 'BOOKED' || row.status === 'PAYMENT_FAILED') ? (
        <MgCard>
          <h2 className="mg-section-title">Complete booking</h2>
          <p className="mg-text-muted">
            Sandbox payment only. Live lab network settlement remains external-gated until a provider is selected.
          </p>
          {formError ? <p className="mg-text-muted">{formError}</p> : null}
          {busy ? <LoadingState label="Processing sandbox payment…" /> : null}
          <div className="mg-toolbar">
            <MgBtn disabled={busy} onClick={() => void retryPay('success')}>
              Pay (sandbox success)
            </MgBtn>
            <MgBtn variant="secondary" disabled={busy} onClick={() => void retryPay('failed')}>
              Simulate payment failure
            </MgBtn>
            <MgBtn
              variant="ghost"
              disabled={busy}
              onClick={() => void cancelLabBooking(getAccessToken() ?? '', row.id).then(load)}
            >
              Cancel booking
            </MgBtn>
          </div>
        </MgCard>
      ) : null}
      {row && collection ? (
        <MgCard>
          <h2 className="mg-section-title">Collection status</h2>
              {collection.phlebotomist ? (
                <div className="mg-phlebo-track">
                  <strong>{collection.phlebotomist.eta_label}</strong>
                  {collection.phlebotomist.live_tracking ? (
                    <span className="mg-phlebo-live">Live tracking</span>
                  ) : null}
                  <Text size="caption">Status: {collection.phlebotomist.status.replaceAll('_', ' ')}</Text>
                </div>
              ) : null}
              {collection.collection_started ? (
                <>
                  <Text>Status: {collection.status}</Text>
                  {collection.transport_in_progress ? <Text size="caption">Sample in transit to lab</Text> : null}
                  {collection.lab_received ? <Text size="caption">Received at laboratory</Text> : null}
                  {collection.accession_number ? (
                    <Text size="caption">Accession: {collection.accession_number}</Text>
                  ) : null}
                  {collection.processing_status ? (
                    <Text size="caption">Processing: {collection.processing_status}</Text>
                  ) : null}
                  {collection.report_status ? (
                    <Text size="caption">Report: {collection.report_status}</Text>
                  ) : null}
                  {collection.boundary?.results_available ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={reportLoading}
                      onClick={() => {
                        const token = getAccessToken();
                        if (!token) {
                          return;
                        }
                        setReportLoading(true);
                        setReportError(null);
                        setReport(null);
                        void fetchLabReportStatus(token, id)
                          .then((statusBody) => {
                            if (!statusBody.report_available) {
                              setReportError('unavailable');
                              return;
                            }
                            return fetchLabReport(token, id);
                          })
                          .then((body) => {
                            if (body) {
                              setReport(body);
                              setReportError(null);
                            }
                          })
                          .catch((err) => {
                            if (err instanceof LabCustomerApiError) {
                              if (err.status === 401) {
                                expire();
                                return;
                              }
                              if (err.status === 403) {
                                setReportError('forbidden');
                                return;
                              }
                              if (err.status === 404) {
                                setReportError('unavailable');
                                return;
                              }
                              if (err.status === 0) {
                                setReportError('network');
                                return;
                              }
                            }
                            setReportError('generic');
                          })
                          .finally(() => setReportLoading(false));
                      }}
                    >
                      {reportLoading ? 'Loading report…' : 'View final report'}
                    </Button>
                  ) : (
                    <Text size="caption">Final report not available yet.</Text>
                  )}
                  <div className="mg-toolbar">
                    <MgBtn href="/doctors" variant="secondary">
                      Discuss report with a doctor
                    </MgBtn>
                    <MgBtn href="/pharmacist" variant="ghost">
                      Ask a pharmacist
                    </MgBtn>
                  </div>
                  {reportError === 'forbidden' ? <PermissionDeniedState /> : null}
                  {reportError === 'unavailable' ? (
                    <EmptyState
                      title="Report not available"
                      description="The final diagnostic report is not published yet or is no longer available."
                    />
                  ) : null}
                  {reportError === 'network' ? (
                    <NetworkErrorState
                      action={{
                        label: 'Retry',
                        onClick: () => {
                          const token = getAccessToken();
                          if (!token) {
                            return;
                          }
                          setReportLoading(true);
                          setReportError(null);
                          void fetchLabReportStatus(token, id)
                            .then((statusBody) => {
                              if (!statusBody.report_available) {
                                setReportError('unavailable');
                                return;
                              }
                              return fetchLabReport(token, id);
                            })
                            .then((body) => {
                              if (body) {
                                setReport(body);
                                setReportError(null);
                              }
                            })
                            .catch((err) => {
                              if (err instanceof LabCustomerApiError) {
                                if (err.status === 401) {
                                  expire();
                                  return;
                                }
                                if (err.status === 403) {
                                  setReportError('forbidden');
                                  return;
                                }
                                if (err.status === 404) {
                                  setReportError('unavailable');
                                  return;
                                }
                                if (err.status === 0) {
                                  setReportError('network');
                                  return;
                                }
                              }
                              setReportError('generic');
                            })
                            .finally(() => setReportLoading(false));
                        },
                      }}
                    />
                  ) : null}
                  {reportError === 'generic' ? (
                    <EmptyState title="Could not load report" description="An unexpected error occurred." />
                  ) : null}
                  {collection.custody_timeline.length ? (
                    <ul>
                      {collection.custody_timeline.map((event, index) => (
                        <li key={`${event.created_at}-${index}`}>
                          <Text size="caption">
                            {new Date(event.created_at).toLocaleString()} · {event.to_status} · {event.action_code}
                          </Text>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <Text size="caption">Collection scheduled. Awaiting phlebotomist assignment.</Text>
                  )}
                </>
              ) : (
                <Text size="caption">{collection.note ?? 'Collection has not started yet.'}</Text>
              )}
              {report ? (
                <Card>
                  <Heading level={3}>Diagnostic report</Heading>
                  <Text size="caption">Accession {report.accession_number} · v{report.version_number}</Text>
                  {report.summary ? <Text>{report.summary}</Text> : null}
                  {report.results.map((line) => (
                    <Text key={line.analyte_name} size="caption">
                      {line.analyte_name}: {line.value} {line.unit ?? ''}
                      {line.reference_range ? ` (ref ${line.reference_range})` : ''}
                    </Text>
                  ))}
                  <Text size="caption">{report.note}</Text>
                </Card>
              ) : null}
              {collection.boundary?.results_available ? (
                <Card>
                  <Heading level={3}>Physical report delivery</Heading>
                  <Text size="caption">Request a hard copy of your published report. Tracking only — no clinical content in transit.</Text>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={physicalLoading}
                    onClick={() => {
                      const token = getAccessToken();
                      if (!token) {
                        return;
                      }
                      setPhysicalLoading(true);
                      setPhysicalError(null);
                      void fetchPhysicalReportEligibility(token, id)
                        .then((body) => {
                          setPhysicalEligibility(body);
                          if (body.existing_request_id) {
                            return fetchPhysicalReportStatus(token, id).then(setPhysicalStatus);
                          }
                          return null;
                        })
                        .catch((err) => {
                          if (err instanceof LabCustomerApiError) {
                            if (err.status === 401) {
                              expire();
                              return;
                            }
                            if (err.status === 403) {
                              setPhysicalError('forbidden');
                              return;
                            }
                            if (err.status === 0) {
                              setPhysicalError('network');
                              return;
                            }
                          }
                          setPhysicalError('generic');
                        })
                        .finally(() => setPhysicalLoading(false));
                    }}
                  >
                    {physicalLoading ? 'Loading…' : 'Check physical report options'}
                  </Button>
                  {physicalError === 'forbidden' ? <PermissionDeniedState /> : null}
                  {physicalError === 'unavailable' ? (
                    <EmptyState title="Physical delivery unavailable" description="This service is not enabled for your region." />
                  ) : null}
                  {physicalError === 'network' ? (
                    <NetworkErrorState action={{ label: 'Retry', onClick: () => setPhysicalError(null) }} />
                  ) : null}
                  {physicalEligibility && !physicalEligibility.eligible ? (
                    <Text size="caption">{physicalEligibility.reason ?? 'Physical report delivery is not available.'}</Text>
                  ) : null}
                  {physicalEligibility?.eligible && !physicalStatus ? (
                    <Button
                      size="sm"
                      onClick={() => {
                        const token = getAccessToken();
                        if (!token) {
                          return;
                        }
                        setPhysicalLoading(true);
                        void requestPhysicalReport(token, id, `phys-${id}`)
                          .then((body) => {
                            setPhysicalStatus(body);
                            setPhysicalError(null);
                          })
                          .catch((err) => {
                            if (err instanceof LabCustomerApiError && err.status === 403) {
                              setPhysicalError('forbidden');
                            } else if (err instanceof LabCustomerApiError && err.status === 0) {
                              setPhysicalError('network');
                            } else {
                              setPhysicalError('generic');
                            }
                          })
                          .finally(() => setPhysicalLoading(false));
                      }}
                    >
                      Request hard copy
                    </Button>
                  ) : null}
                  {physicalStatus ? (
                    <>
                      <Text>Status: {physicalStatus.status}</Text>
                      {physicalStatus.sealed_package_id ? (
                        <Text size="caption">Package: {physicalStatus.sealed_package_id}</Text>
                      ) : null}
                      {physicalStatus.logistics_job_status ? (
                        <Text size="caption">Delivery: {physicalStatus.logistics_job_status}</Text>
                      ) : null}
                      {physicalStatus.failure_reason ? (
                        <Text size="caption">Issue: {physicalStatus.failure_reason}</Text>
                      ) : null}
                      {physicalStatus.status !== 'DELIVERED' &&
                      physicalStatus.status !== 'CANCELLED' &&
                      physicalStatus.status !== 'FAILED' ? (
                        <Button
                          size="sm"
                          variant="tertiary"
                          onClick={() => {
                            const token = getAccessToken();
                            if (!token) {
                              return;
                            }
                            void fetchPhysicalReportStatus(token, id).then(setPhysicalStatus);
                          }}
                        >
                          Refresh status
                        </Button>
                      ) : null}
                      {physicalStatus.status === 'REQUESTED' || physicalStatus.status === 'ACCEPTED' ? (
                        <Button
                          size="sm"
                          variant="tertiary"
                          onClick={() => {
                            const token = getAccessToken();
                            if (!token) {
                              return;
                            }
                            void cancelPhysicalReport(token, id).then(setPhysicalStatus);
                          }}
                        >
                          Cancel request
                        </Button>
                      ) : null}
                      <Text size="caption">{physicalStatus.note}</Text>
                    </>
                  ) : null}
                </Card>
              ) : null}
        </MgCard>
      ) : null}
    </Page>
  );
}
