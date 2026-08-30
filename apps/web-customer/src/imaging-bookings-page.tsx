'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from '@world-pharma/shell-web';
import {
  Button,
  Card,
  EmptyState,
  FormField,
  Heading,
  LoadingState,
  NetworkErrorState,
  PermissionDeniedState,
  SessionExpiredState,
  Text,
} from '@world-pharma/ui-kit/web';
import { CustomerShell } from './customer-shell';
import {
  cancelImagingBooking,
  cancelImagingPhysicalReport,
  fetchImagingBooking,
  fetchImagingBookings,
  fetchImagingPhysicalReportEligibility,
  fetchImagingPhysicalReportStatus,
  fetchImagingPreparation,
  fetchImagingProgress,
  fetchImagingReport,
  fetchImagingReportStatus,
  ImagingCustomerApiError,
  payImagingBooking,
  requestImagingPhysicalReport,
  type ImagingBooking,
  type ImagingCustomerReport,
  type ImagingPhysicalReportEligibility,
  type ImagingPhysicalReportStatus,
  type ImagingReportStatus,
} from './imaging-api';
import { fetchAddresses, type CustomerAddress } from './account-api';

function newIdempotencyKey(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function ImagingBookingsScreen() {
  const { session, getAccessToken, signOut, expire } = useSession();
  const [rows, setRows] = useState<ImagingBooking[]>([]);
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
      const body = await fetchImagingBookings(token);
      setRows(body.data);
    } catch (err) {
      if (err instanceof ImagingCustomerApiError) {
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
      <Heading level={2}>Imaging bookings</Heading>
      <Text tone="secondary">Your radiology bookings and published imaging reports.</Text>
      <Button onClick={() => (window.location.href = '/radiology')}>Browse imaging studies</Button>
      {loading ? <LoadingState label="Loading imaging bookings…" /> : null}
      {error === 'network' ? <NetworkErrorState action={{ label: 'Retry', onClick: () => void load() }} /> : null}
      {error === 'forbidden' ? <PermissionDeniedState /> : null}
      {!loading && !error && rows.length === 0 ? (
        <EmptyState title="No imaging bookings" description="Book an imaging study to see status here." />
      ) : null}
      {rows.map((row) => (
        <Card key={row.id}>
          <Text>{row.lines[0]?.title ?? 'Imaging booking'}</Text>
          <Text>
            {row.status} · {row.currency} {row.total_minor}
          </Text>
          <Text size="caption">{row.imaging_display_name}</Text>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => (window.location.href = `/radiology/bookings/${row.id}`)}
          >
            Details
          </Button>
          {row.status === 'BOOKED' || row.status === 'PAYMENT_FAILED' ? (
            <Button
              size="sm"
              variant="tertiary"
              onClick={() => void cancelImagingBooking(getAccessToken() ?? '', row.id).then(load)}
            >
              Cancel
            </Button>
          ) : null}
        </Card>
      ))}
    </CustomerShell>
  );
}

export function ImagingBookingDetailScreen({ id }: { id: string }) {
  const { session, getAccessToken, signOut, expire } = useSession();
  const [row, setRow] = useState<ImagingBooking | null>(null);
  const [prep, setPrep] = useState<Awaited<ReturnType<typeof fetchImagingPreparation>> | null>(null);
  const [progress, setProgress] = useState<Awaited<ReturnType<typeof fetchImagingProgress>> | null>(null);
  const [reportStatus, setReportStatus] = useState<ImagingReportStatus | null>(null);
  const [report, setReport] = useState<ImagingCustomerReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<'network' | 'forbidden' | 'unavailable' | 'generic' | null>(null);
  const [physicalEligibility, setPhysicalEligibility] = useState<ImagingPhysicalReportEligibility | null>(null);
  const [physicalStatus, setPhysicalStatus] = useState<ImagingPhysicalReportStatus | null>(null);
  const [physicalLoading, setPhysicalLoading] = useState(false);
  const [physicalError, setPhysicalError] = useState<'network' | 'forbidden' | 'unavailable' | 'generic' | null>(null);
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<'network' | 'forbidden' | 'generic' | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [booking, preparation, prog, status] = await Promise.all([
        fetchImagingBooking(token, id),
        fetchImagingPreparation(token, id),
        fetchImagingProgress(token, id),
        fetchImagingReportStatus(token, id),
      ]);
      setRow(booking);
      setPrep(preparation);
      setProgress(prog);
      setReportStatus(status);
      setReport(null);
      setReportError(null);
      const addrRes = await fetchAddresses({ token });
      const addressRows = addrRes.ok && Array.isArray(addrRes.data) ? addrRes.data : [];
      setAddresses(addressRows);
      if (addressRows.length === 1) {
        setSelectedAddressId(addressRows[0]!.id);
      }
    } catch (err) {
      if (err instanceof ImagingCustomerApiError) {
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

  function loadReport() {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setReportLoading(true);
    setReportError(null);
    setReport(null);
    void fetchImagingReport(token, id)
      .then((body) => {
        setReport(body);
        setReportError(null);
      })
      .catch((err) => {
        if (err instanceof ImagingCustomerApiError) {
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
  }

  async function retryPay(scenario: 'success' | 'failed') {
    const token = getAccessToken();
    if (!token || !row) {
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      const paid = await payImagingBooking(token, row.id, newIdempotencyKey('img-repay'), scenario);
      if (paid.status === 'CAPTURED') {
        await load();
        return;
      }
      setFormError(`Sandbox payment ended as ${paid.status}.`);
      await load();
    } catch (err) {
      if (err instanceof ImagingCustomerApiError) {
        setFormError(err.message);
      }
    } finally {
      setBusy(false);
    }
  }

  if (session.status === 'expired') {
    return <SessionExpiredState action={{ label: 'Sign in again', onClick: () => signOut() }} />;
  }

  return (
    <CustomerShell apiReachable={true} countryLabel="session">
      <Button variant="tertiary" size="sm" onClick={() => (window.location.href = '/radiology/bookings')}>
        Back to bookings
      </Button>
      {loading ? <LoadingState label="Loading booking…" /> : null}
      {error === 'network' ? <NetworkErrorState action={{ label: 'Retry', onClick: () => void load() }} /> : null}
      {error === 'forbidden' ? <PermissionDeniedState /> : null}
      {error === 'generic' ? <EmptyState title="Booking unavailable" description="Could not load this booking." /> : null}
      {row ? (
        <Card>
          <Heading level={2}>{row.lines[0]?.title ?? 'Imaging booking'}</Heading>
          <Text>Status: {row.status}</Text>
          <Text>
            {row.currency} {row.total_minor}
          </Text>
          <Text size="caption">{row.imaging_display_name}</Text>
          {row.slot_starts_at ? <Text>Slot: {new Date(row.slot_starts_at).toLocaleString()}</Text> : null}
          {row.imaging_location ? (
            <Text>
              Center: {row.imaging_location.name}
              {row.imaging_location.city ? ` · ${row.imaging_location.city}` : ''}
            </Text>
          ) : null}
          {progress ? (
            <>
              <Text size="caption">Progress: {progress.progress}</Text>
              {progress.accession_number ? <Text size="caption">Accession: {progress.accession_number}</Text> : null}
              <Text size="caption">{progress.note}</Text>
            </>
          ) : null}
          {reportStatus ? (
            <Card>
              <Heading level={3}>Imaging report</Heading>
              <Text size="caption">{reportStatus.note}</Text>
              {reportStatus.report_available ? (
                <>
                  <Text size="caption">
                    Version {reportStatus.version_number}
                    {reportStatus.amendment_reason ? ` · Amended` : ''}
                  </Text>
                  <Button size="sm" variant="secondary" disabled={reportLoading} onClick={loadReport}>
                    {reportLoading ? 'Loading report…' : 'View final report'}
                  </Button>
                </>
              ) : (
                <Text size="caption">Final report not available yet.</Text>
              )}
              {reportError === 'forbidden' ? <PermissionDeniedState /> : null}
              {reportError === 'unavailable' ? (
                <EmptyState
                  title="Report not available"
                  description="The final imaging report is not published yet or is no longer available."
                />
              ) : null}
              {reportError === 'network' ? (
                <NetworkErrorState action={{ label: 'Retry', onClick: loadReport }} />
              ) : null}
              {reportError === 'generic' ? (
                <EmptyState title="Could not load report" description="An unexpected error occurred." />
              ) : null}
              {report ? (
                <>
                  <Text>{report.summary}</Text>
                  {report.amendment_reason ? (
                    <Text size="caption">Amendment: {report.amendment_reason}</Text>
                  ) : null}
                  {report.findings.map((line) => (
                    <Text key={`${line.finding_code}-${line.finding_text}`} size="caption">
                      {line.finding_code}: {line.finding_text}
                    </Text>
                  ))}
                  {report.note ? <Text size="caption">{report.note}</Text> : null}
                </>
              ) : null}
            </Card>
          ) : null}
          {reportStatus?.report_available ? (
            <Card>
              <Heading level={3}>Physical report delivery</Heading>
              <Text size="caption">
                Request a hard copy of your published imaging report. Tracking only — no clinical content in transit.
              </Text>
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
                  void fetchImagingPhysicalReportEligibility(token, id)
                    .then((body) => {
                      setPhysicalEligibility(body);
                      if (body.existing_request_id) {
                        return fetchImagingPhysicalReportStatus(token, id).then(setPhysicalStatus);
                      }
                      return null;
                    })
                    .catch((err) => {
                      if (err instanceof ImagingCustomerApiError) {
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
                <>
                  {addresses.length ? (
                    <FormField label="Delivery address">
                      {({ id }) => (
                        <select
                          id={id}
                          className="wp-input"
                          value={selectedAddressId}
                          onChange={(e) => setSelectedAddressId(e.target.value)}
                          aria-label="Delivery address"
                        >
                          <option value="">Select address…</option>
                          {addresses.map((row) => (
                            <option key={row.id} value={row.id}>
                              {row.recipient_name} · {row.line1}, {row.city}
                            </option>
                          ))}
                        </select>
                      )}
                    </FormField>
                  ) : (
                    <Text size="caption">
                      Add a delivery address in your account before requesting physical delivery.
                    </Text>
                  )}
                  <Button
                    size="sm"
                    disabled={physicalLoading || !selectedAddressId}
                    onClick={() => {
                      const token = getAccessToken();
                      if (!token || !selectedAddressId) {
                        return;
                      }
                      setPhysicalLoading(true);
                      void requestImagingPhysicalReport(token, id, newIdempotencyKey('img-phys'), selectedAddressId)
                        .then((body) => {
                          setPhysicalStatus(body);
                          setPhysicalError(null);
                        })
                        .catch((err) => {
                          if (err instanceof ImagingCustomerApiError && err.status === 403) {
                            setPhysicalError('forbidden');
                          } else if (err instanceof ImagingCustomerApiError && err.status === 0) {
                            setPhysicalError('network');
                          } else {
                            setPhysicalError('generic');
                          }
                        })
                        .finally(() => setPhysicalLoading(false));
                    }}
                  >
                    Request physical report (sandbox fee on dispatch)
                  </Button>
                </>
              ) : null}
              {physicalStatus ? (
                <>
                  <Text>Status: {physicalStatus.status}</Text>
                  {physicalStatus.logistics_job_status ? (
                    <Text size="caption">Delivery: {physicalStatus.logistics_job_status}</Text>
                  ) : null}
                  {physicalStatus.failure_reason ? (
                    <Text size="caption">Issue: {physicalStatus.failure_reason}</Text>
                  ) : null}
                  {['REQUESTED', 'ACCEPTED', 'PREPARING', 'PACKED'].includes(physicalStatus.status) ? (
                    <Button
                      size="sm"
                      variant="tertiary"
                      onClick={() => {
                        const token = getAccessToken();
                        if (!token) {
                          return;
                        }
                        void cancelImagingPhysicalReport(token, id).then(setPhysicalStatus);
                      }}
                    >
                      Cancel request
                    </Button>
                  ) : null}
                  {['FAILED', 'CANCELLED'].includes(physicalStatus.status) && physicalEligibility?.eligible ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={physicalLoading || !selectedAddressId}
                      onClick={() => {
                        const token = getAccessToken();
                        if (!token || !selectedAddressId) {
                          return;
                        }
                        setPhysicalLoading(true);
                        void requestImagingPhysicalReport(token, id, newIdempotencyKey('img-phys-retry'), selectedAddressId)
                          .then(setPhysicalStatus)
                          .finally(() => setPhysicalLoading(false));
                      }}
                    >
                      Retry request
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="tertiary"
                    onClick={() => {
                      const token = getAccessToken();
                      if (!token) {
                        return;
                      }
                      void fetchImagingPhysicalReportStatus(token, id).then(setPhysicalStatus);
                    }}
                  >
                    Refresh status
                  </Button>
                </>
              ) : null}
            </Card>
          ) : null}
          {prep ? (
            <>
              <Heading level={3}>Preparation</Heading>
              <ul>
                {prep.instructions.map((line) => (
                  <li key={line}>
                    <Text size="caption">{line}</Text>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {row.boundary ? (
            <Text size="caption">
              Sandbox={String(row.sandbox)} · Order={String(row.boundary.creates_order)} · Acquisition=
              {String(row.boundary.acquisition)}
            </Text>
          ) : null}
          {formError ? <Text>{formError}</Text> : null}
          {busy ? <LoadingState label="Processing sandbox payment…" /> : null}
          {row.status === 'BOOKED' || row.status === 'PAYMENT_FAILED' ? (
            <>
              <Button disabled={busy} onClick={() => void retryPay('success')}>
                Pay (sandbox success)
              </Button>
              <Button variant="secondary" disabled={busy} onClick={() => void retryPay('failed')}>
                Simulate payment failure
              </Button>
              <Button
                variant="tertiary"
                onClick={() => void cancelImagingBooking(getAccessToken() ?? '', row.id).then(() => void load())}
              >
                Cancel booking
              </Button>
            </>
          ) : null}
        </Card>
      ) : null}
    </CustomerShell>
  );
}
