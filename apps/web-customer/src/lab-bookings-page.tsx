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
import { CustomerShell } from './customer-shell';
import {
  cancelLabBooking,
  fetchLabBooking,
  fetchLabBookingCollection,
  fetchLabReport,
  fetchPhysicalReportEligibility,
  fetchPhysicalReportStatus,
  requestPhysicalReport,
  cancelPhysicalReport,
  fetchLabBookings,
  LabCustomerApiError,
  type LabBooking,
  type LabBookingCollection,
  type PhysicalReportEligibility,
  type PhysicalReportStatus,
} from './lab-api';

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

  return (
    <CustomerShell apiReachable={true} countryLabel="session">
      <Heading level={2}>Lab bookings</Heading>
      <Text tone="secondary">Your diagnostics bookings. Collection status appears after payment confirmation.</Text>
      <Button onClick={() => (window.location.href = '/lab')}>Browse lab tests</Button>
      {loading ? <LoadingState label="Loading lab bookings…" /> : null}
      {error === 'network' ? <NetworkErrorState action={{ label: 'Retry', onClick: () => void load() }} /> : null}
      {error === 'forbidden' ? <PermissionDeniedState /> : null}
      {!loading && !error && rows.length === 0 ? (
        <EmptyState title="No lab bookings" description="Book a lab test to see status here." />
      ) : null}
      {rows.map((row) => (
        <Card key={row.id}>
          <Text>{row.lines[0]?.title ?? 'Lab booking'}</Text>
          <Text>
            {row.status} · {row.collection_mode} · {row.currency} {row.total_minor}
          </Text>
          <Text size="caption">{row.lab_display_name}</Text>
          <Button size="sm" variant="secondary" onClick={() => (window.location.href = `/lab/bookings/${row.id}`)}>
            Details
          </Button>
          {row.status === 'BOOKED' || row.status === 'PAYMENT_FAILED' ? (
            <Button
              size="sm"
              variant="tertiary"
              onClick={() => void cancelLabBooking(getAccessToken() ?? '', row.id).then(load)}
            >
              Cancel
            </Button>
          ) : null}
        </Card>
      ))}
    </CustomerShell>
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

  if (session.status === 'expired') {
    return <SessionExpiredState action={{ label: 'Sign in again', onClick: () => signOut() }} />;
  }

  return (
    <CustomerShell apiReachable={true} countryLabel="session">
      <Button variant="tertiary" size="sm" onClick={() => (window.location.href = '/lab/bookings')}>
        Back to bookings
      </Button>
      {loading ? <LoadingState label="Loading booking…" /> : null}
      {error === 'network' ? <NetworkErrorState action={{ label: 'Retry', onClick: () => void load() }} /> : null}
      {error === 'forbidden' ? <PermissionDeniedState /> : null}
      {error === 'generic' ? <EmptyState title="Booking unavailable" description="Could not load this booking." /> : null}
      {row ? (
        <Card>
          <Heading level={2}>{row.lines[0]?.title ?? 'Lab booking'}</Heading>
          <Text>Status: {row.status}</Text>
          <Text>
            {row.collection_mode} · {row.currency} {row.total_minor}
          </Text>
          <Text size="caption">{row.lab_display_name}</Text>
          {row.slot_starts_at ? <Text>Slot: {new Date(row.slot_starts_at).toLocaleString()}</Text> : null}
          {row.lab_location ? <Text>Center: {row.lab_location.name}</Text> : null}
          <Text size="caption">
            Sandbox={String(row.sandbox)} · Creates order={String(row.boundary?.creates_order ?? false)} · Specimen=
            {String(row.boundary?.creates_specimen ?? false)}
          </Text>
          {(row.status === 'BOOKED' || row.status === 'PAYMENT_FAILED') && (
            <Button
              variant="secondary"
              onClick={() => void cancelLabBooking(getAccessToken() ?? '', row.id).then(load)}
            >
              Cancel booking
            </Button>
          )}
          {collection ? (
            <Card>
              <Heading level={3}>Collection status</Heading>
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
                        void fetchLabReport(token, id)
                          .then((body) => {
                            setReport(body);
                            setReportError(null);
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
                          void fetchLabReport(token, id)
                            .then((body) => {
                              setReport(body);
                              setReportError(null);
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
            </Card>
          ) : null}
        </Card>
      ) : null}
    </CustomerShell>
  );
}
