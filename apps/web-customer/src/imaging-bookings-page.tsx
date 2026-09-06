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
  fetchImagingStudyMetadata,
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
import { formatMoney } from './format-money';
import {
  IMAGING_TRACK_STEPS,
  imagingBookingStatusLabel,
  imagingProgressLabel,
  imagingTrackStepIndex,
} from './imaging-status-labels';
import { MgBackLink, MgBtn, MgCard, Page, PageIntro, ServiceHero } from './ui/mg-ui';

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

  if (session.status !== 'authenticated') {
    return (
      <Page>
        <ServiceHero
          kicker="Radiology"
          title="Imaging bookings"
          subtitle="Track radiology appointments and reports."
          tone="scan"
          compact
        />
        <EmptyState title="Sign in required" description="Login to view your imaging bookings." action={{ label: 'Sign in', onClick: () => (window.location.href = '/login') }} />
        <MgBtn href="/radiology" variant="secondary">Browse imaging studies</MgBtn>
      </Page>
    );
  }

  return (
    <Page>
      <ServiceHero
        kicker="Radiology"
        title="Imaging bookings"
        subtitle="Radiology appointments — reports unlock when published."
        tone="scan"
        compact
      />
      <PageIntro>
        <p>MRI, CT, ultrasound, and X-ray bookings. Preparation instructions and final reports appear in booking details.</p>
      </PageIntro>
      <MgBtn href="/radiology" variant="secondary">Browse imaging studies</MgBtn>
      {loading ? <LoadingState label="Loading imaging bookings" /> : null}
      {error === 'network' ? <NetworkErrorState action={{ label: 'Retry', onClick: () => void load() }} /> : null}
      {error === 'forbidden' ? <PermissionDeniedState /> : null}
      {!loading && !error && rows.length === 0 ? (
        <EmptyState
          title="No imaging bookings"
          description="Book an imaging study to see status here."
          action={{ label: 'Browse studies', onClick: () => (window.location.href = '/radiology') }}
        />
      ) : null}
      <ul className="mg-order-list">
        {rows.map((row) => (
          <li key={row.id}>
            <MgCard className="mg-order-card">
              <div className="mg-order-card-top">
                <div>
                  <p className="mg-list-title">{row.lines[0]?.title ?? 'Imaging booking'}</p>
                  <p className="mg-list-meta">{formatMoney(row.total_minor, row.currency)}</p>
                  <p className="mg-order-track-hint">{row.imaging_display_name}</p>
                </div>
                <span className="mg-status">{imagingBookingStatusLabel(row.status)}</span>
              </div>
              <div className="mg-list-actions">
                <MgBtn size="sm" variant="secondary" href={`/radiology/bookings/${row.id}`}>
                  Details
                </MgBtn>
                {row.status === 'BOOKED' || row.status === 'PAYMENT_FAILED' ? (
                  <MgBtn
                    size="sm"
                    variant="ghost"
                    onClick={() => void cancelImagingBooking(getAccessToken() ?? '', row.id).then(load)}
                  >
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

export function ImagingBookingDetailScreen({ id }: { id: string }) {
  const { session, getAccessToken, signOut, expire } = useSession();
  const [row, setRow] = useState<ImagingBooking | null>(null);
  const [prep, setPrep] = useState<Awaited<ReturnType<typeof fetchImagingPreparation>> | null>(null);
  const [progress, setProgress] = useState<Awaited<ReturnType<typeof fetchImagingProgress>> | null>(null);
  const [reportStatus, setReportStatus] = useState<ImagingReportStatus | null>(null);
  const [report, setReport] = useState<ImagingCustomerReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<'network' | 'forbidden' | 'unavailable' | 'generic' | null>(null);
  const [viewerAvailable, setViewerAvailable] = useState(false);
  const [viewerReason, setViewerReason] = useState<string | null>(null);
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
      const [booking, preparation, prog, status, studyMeta] = await Promise.all([
        fetchImagingBooking(token, id),
        fetchImagingPreparation(token, id),
        fetchImagingProgress(token, id),
        fetchImagingReportStatus(token, id),
        fetchImagingStudyMetadata(token, id).catch(() => null),
      ]);
      setRow(booking);
      setPrep(preparation);
      setProgress(prog);
      setReportStatus(status);
      setReport(null);
      setReportError(null);
      setViewerAvailable(Boolean(studyMeta?.viewer?.available));
      setViewerReason(studyMeta?.viewer?.reason ?? null);
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

  if (session.status !== 'authenticated') {
    return (
      <Page>
        <MgBackLink href="/radiology/bookings">← Back to bookings</MgBackLink>
        <EmptyState title="Sign in required" description="Login to view your imaging bookings." action={{ label: 'Sign in', onClick: () => (window.location.href = '/login') }} />
      </Page>
    );
  }

  return (
    <Page>
      <MgBackLink href="/radiology/bookings">← Back to bookings</MgBackLink>
      {loading ? <LoadingState label="Loading booking…" /> : null}
      {error === 'network' ? <NetworkErrorState action={{ label: 'Retry', onClick: () => void load() }} /> : null}
      {error === 'forbidden' ? <PermissionDeniedState /> : null}
      {error === 'generic' ? <EmptyState title="Booking unavailable" description="Could not load this booking." /> : null}
      {row ? (
        <>
          <MgCard className="mg-order-hero">
            <h2 className="mg-section-title">{row.lines[0]?.title ?? 'Imaging booking'}</h2>
            <span className="mg-status">{imagingBookingStatusLabel(row.status)}</span>
            <p className="mg-text-muted">{formatMoney(row.total_minor, row.currency)}</p>
            <p className="mg-text-muted">{row.imaging_display_name}</p>
            {row.slot_starts_at ? (
              <p className="mg-detail-datetime">Slot: {new Date(row.slot_starts_at).toLocaleString()}</p>
            ) : null}
            {row.imaging_location ? (
              <p className="mg-text-muted">
                Center: {row.imaging_location.name}
                {row.imaging_location.city ? ` · ${row.imaging_location.city}` : ''}
              </p>
            ) : null}
            {progress ? (
              <p className="mg-list-meta">
                {imagingProgressLabel(progress.progress)}
                {progress.accession_number ? ` · Accession ${progress.accession_number}` : ''}
              </p>
            ) : null}
            {progress?.note ? <p className="mg-text-muted">{progress.note}</p> : null}
            {(() => {
              const trackIndex = imagingTrackStepIndex({
                bookingStatus: row.status,
                progress: progress?.progress,
                reportAvailable: Boolean(reportStatus?.report_available),
                viewerAvailable,
                boundary: progress?.boundary ?? null,
              });
              if (trackIndex < 0) return null;
              return (
                <div className="mg-track" aria-label="Imaging booking progress">
                  {IMAGING_TRACK_STEPS.map((step, index) => (
                    <div
                      key={step}
                      className={`mg-track-step${index <= trackIndex ? ' is-done' : ''}${index === trackIndex ? ' is-current' : ''}`}
                    >
                      <span className="mg-track-dot" aria-hidden />
                      <span className="mg-track-label">{step}</span>
                    </div>
                  ))}
                </div>
              );
            })()}
          </MgCard>

          {prep && prep.instructions.length ? (
            <MgCard>
              <h2 className="mg-section-title">Preparation</h2>
              <ul className="mg-rx-steps">
                {prep.instructions.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </MgCard>
          ) : null}

          {viewerAvailable ? (
            <MgCard>
              <h2 className="mg-section-title">Study images</h2>
              <p className="mg-text-muted">
                Open the diagnostic viewer for this study. Images are separate from the written report. Sandbox
                frames only — not a certified diagnostic workstation.
              </p>
              <MgBtn href={`/radiology/bookings/${id}/viewer`} size="sm">
                View study
              </MgBtn>
            </MgCard>
          ) : row.status !== 'BOOKED' && row.status !== 'PAYMENT_FAILED' && row.status !== 'CANCELLED' ? (
            <MgCard>
              <h2 className="mg-section-title">Study images</h2>
              <p className="mg-text-muted">
                {viewerReason
                  ? viewerReason.replaceAll('_', ' ').toLowerCase()
                  : 'Study images are not available yet. The written report, when published, remains separate from image viewing.'}
              </p>
              <p className="mg-text-muted">
                Live PACS remains external-gated. No public DICOM URLs are exposed.
              </p>
            </MgCard>
          ) : null}

          {reportStatus ? (
            <MgCard>
              <h2 className="mg-section-title">Imaging report</h2>
              {reportStatus.note ? <p className="mg-text-muted">{reportStatus.note}</p> : null}
              {reportStatus.report_available ? (
                <>
                  <p className="mg-list-meta">
                    Version {reportStatus.version_number}
                    {reportStatus.amendment_reason ? ' · Amended' : ''}
                  </p>
                  <MgBtn size="sm" variant="secondary" disabled={reportLoading} onClick={loadReport}>
                    {reportLoading ? 'Loading report…' : 'View final report'}
                  </MgBtn>
                </>
              ) : (
                <p className="mg-text-muted">Final report not available yet.</p>
              )}
              {reportError === 'forbidden' ? <PermissionDeniedState /> : null}
              {reportError === 'unavailable' ? (
                <EmptyState
                  title="Report not available"
                  description="The final imaging report is not published yet or is no longer available."
                />
              ) : null}
              {reportError === 'network' ? <NetworkErrorState action={{ label: 'Retry', onClick: loadReport }} /> : null}
              {reportError === 'generic' ? (
                <EmptyState title="Could not load report" description="An unexpected error occurred." />
              ) : null}
              {report ? (
                <div className="mg-prose">
                  {report.summary ? <p>{report.summary}</p> : null}
                  {report.amendment_reason ? (
                    <p className="mg-text-muted">Amendment: {report.amendment_reason}</p>
                  ) : null}
                  <ul>
                    {report.findings.map((line) => (
                      <li key={`${line.finding_code}-${line.finding_text}`}>
                        {line.finding_code}: {line.finding_text}
                      </li>
                    ))}
                  </ul>
                  {report.note ? <p className="mg-text-muted">{report.note}</p> : null}
                  <div className="mg-toolbar">
                    <MgBtn href="/doctors" variant="secondary">
                      Discuss report with a doctor
                    </MgBtn>
                    {viewerAvailable ? (
                      <MgBtn href={`/radiology/bookings/${id}/viewer`} variant="ghost">
                        View study images
                      </MgBtn>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </MgCard>
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
                      {({ id: fieldId }) => (
                        <select
                          id={fieldId}
                          className="wp-input"
                          value={selectedAddressId}
                          onChange={(e) => setSelectedAddressId(e.target.value)}
                          aria-label="Delivery address"
                        >
                          <option value="">Select address…</option>
                          {addresses.map((addr) => (
                            <option key={addr.id} value={addr.id}>
                              {addr.recipient_name} · {addr.line1}, {addr.city}
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

          {formError ? <p className="mg-text-muted">{formError}</p> : null}
          {busy ? <LoadingState label="Processing sandbox payment…" /> : null}
          {row.status === 'BOOKED' || row.status === 'PAYMENT_FAILED' ? (
            <MgCard>
              <h2 className="mg-section-title">Complete booking</h2>
              <div className="mg-toolbar">
                <MgBtn disabled={busy} onClick={() => void retryPay('success')}>
                  Pay (sandbox success)
                </MgBtn>
                <MgBtn variant="secondary" disabled={busy} onClick={() => void retryPay('failed')}>
                  Simulate payment failure
                </MgBtn>
                <MgBtn
                  variant="ghost"
                  onClick={() => void cancelImagingBooking(getAccessToken() ?? '', row.id).then(() => void load())}
                >
                  Cancel booking
                </MgBtn>
              </div>
            </MgCard>
          ) : null}
        </>
      ) : null}
    </Page>
  );
}
