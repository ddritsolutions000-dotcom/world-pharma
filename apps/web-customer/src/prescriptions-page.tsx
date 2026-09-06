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
  cancelRefillRequest,
  fetchCommerceEligibility,
  fetchCustomerPrescription,
  fetchCustomerPrescriptions,
  fetchRefillEligibility,
  fetchRefillRequests,
  refillEligibilityLabel,
  requestRefill,
  startRxHandoff,
  type CommerceEligibility,
  type Prescription,
  type RefillEligibility,
  type RefillRequest,
} from './care-api';
import { uploadHealthDocument } from './health-api';
import { useSelectedCountry } from './use-selected-country';
import { RxSubscriptionPanel } from './rx-subscription-panel';
import { MgBtn, MgCard, Page, PageIntro, Section } from './ui/mg-ui';

const RX_STEPS = [
  {
    title: 'Upload or consult',
    body: 'Upload a paper Rx photo/PDF, or get a digital prescription from an online doctor consultation.',
  },
  {
    title: 'Pharmacy review',
    body: 'Our licensed partner verifies the prescription and prepares your medicines — usually within a few hours.',
  },
  {
    title: 'Home delivery',
    body: 'Track your order and shipment in real time. Cold-chain items are handled per pharmacy regulations.',
  },
] as const;

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

function newIdempotencyKey(prefix = 'rx'): string {
  return globalThis.crypto?.randomUUID?.() ?? `${prefix}-${Date.now()}`;
}

const CANCELLABLE_REFILL_STATUSES = new Set(['REQUESTED', 'PENDING_REAUTH']);

export function PrescriptionsScreen() {
  const { session, getAccessToken, expire } = useSession();
  const { country: countryCode } = useSelectedCountry();
  const [rows, setRows] = useState<Prescription[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Prescription | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<'network' | 'forbidden' | 'error' | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [orderBusy, setOrderBusy] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [eligibility, setEligibility] = useState<CommerceEligibility | null>(null);
  const [eligibilityLoading, setEligibilityLoading] = useState(false);
  const [refillEligibility, setRefillEligibility] = useState<RefillEligibility | null>(null);
  const [refillLoading, setRefillLoading] = useState(false);
  const [refillHistory, setRefillHistory] = useState<RefillRequest[]>([]);
  const [refillBusy, setRefillBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [refillError, setRefillError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token || session.status !== 'authenticated') {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const body = await fetchCustomerPrescriptions(token);
      setRows(body.prescriptions ?? []);
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      if (status === 403) {
        setError('forbidden');
      } else if (status === 401) {
        expire();
      } else {
        setError('network');
      }
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [expire, getAccessToken, session.status]);

  const loadDetail = useCallback(
    async (id: string) => {
      const token = getAccessToken();
      if (!token) {
        return;
      }
      setSelectedId(id);
      setDetailLoading(true);
      setShowHistory(false);
      setOrderError(null);
      setEligibility(null);
      setRefillEligibility(null);
      setRefillHistory([]);
      setRefillError(null);
      try {
        const loaded = await fetchCustomerPrescription(token, id);
        setDetail(loaded);
        if (loaded.status !== 'DRAFT' && loaded.status !== 'CANCELLED') {
          setRefillLoading(true);
          try {
            const [refill, requests] = await Promise.all([
              fetchRefillEligibility(token, id),
              fetchRefillRequests(token),
            ]);
            setRefillEligibility(refill);
            setRefillHistory((requests.requests ?? []).filter((row) => row.prescription_id === id));
          } catch {
            setRefillEligibility(null);
            setRefillHistory([]);
          } finally {
            setRefillLoading(false);
          }
        }
        if (loaded.dispensing_status === 'DISPENSED') {
          setEligibilityLoading(true);
          try {
            setEligibility(await fetchCommerceEligibility(token, id));
          } catch {
            setEligibility(null);
          } finally {
            setEligibilityLoading(false);
          }
        }
      } catch (err: unknown) {
        const status = (err as { status?: number }).status;
        if (status === 401) {
          expire();
        }
        setDetail(null);
      } finally {
        setDetailLoading(false);
      }
    },
    [expire, getAccessToken],
  );

  const orderMedicines = useCallback(async () => {
    const token = getAccessToken();
    if (!token || !detail?.id) {
      return;
    }
    setOrderBusy(true);
    setOrderError(null);
    try {
      const currentEligibility =
        eligibility ?? (await fetchCommerceEligibility(token, detail.id));
      if (!currentEligibility.eligible || !currentEligibility.dispensing_case_id) {
        if (currentEligibility.reason === 'order_already_exists' && currentEligibility.order_id) {
          setOrderError(`These medicines already have an order (${currentEligibility.order_id.slice(0, 8)}).`);
        } else {
          setOrderError('These medicines are not ready to order yet.');
        }
        return;
      }
      await startRxHandoff(token, currentEligibility.dispensing_case_id, newIdempotencyKey());
      window.location.href = '/checkout';
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      if (status === 401) {
        expire();
        return;
      }
      setOrderError((err as { message?: string }).message ?? 'Could not prepare medicines for order.');
    } finally {
      setOrderBusy(false);
    }
  }, [detail?.id, eligibility, expire, getAccessToken]);

  const submitRefillRequest = useCallback(async () => {
    const token = getAccessToken();
    if (!token || !detail?.id || !refillEligibility?.eligible) {
      return;
    }
    setRefillBusy(true);
    setRefillError(null);
    try {
      const created = await requestRefill(token, detail.id, newIdempotencyKey('refill'));
      setRefillHistory((prev) => [created, ...prev.filter((row) => row.id !== created.id)]);
      setRefillEligibility((prev) =>
        prev
          ? {
              ...prev,
              open_request_id: created.id,
              open_request_status: created.status,
            }
          : prev,
      );
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      if (status === 401) {
        expire();
        return;
      }
      setRefillError((err as { message?: string }).message ?? 'Could not submit refill request.');
    } finally {
      setRefillBusy(false);
    }
  }, [detail?.id, expire, getAccessToken, refillEligibility?.eligible]);

  const cancelOpenRefill = useCallback(async () => {
    const token = getAccessToken();
    const openId = refillEligibility?.open_request_id;
    if (!token || !openId || !detail?.id) {
      return;
    }
    setRefillBusy(true);
    setRefillError(null);
    try {
      const cancelled = await cancelRefillRequest(token, openId, newIdempotencyKey('refill-cancel'));
      setRefillHistory((prev) => [cancelled, ...prev.filter((row) => row.id !== cancelled.id)]);
      const refreshed = await fetchRefillEligibility(token, detail.id);
      setRefillEligibility(refreshed);
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      if (status === 401) {
        expire();
        return;
      }
      setRefillError((err as { message?: string }).message ?? 'Could not cancel refill request.');
    } finally {
      setRefillBusy(false);
    }
  }, [detail, expire, getAccessToken, refillEligibility?.open_request_id]);

  const onUploadRx = useCallback(
    async (file: File) => {
      const token = getAccessToken();
      if (!token || session.status !== 'authenticated') {
        return;
      }
      const allowed = new Set(['application/pdf', 'image/jpeg', 'image/png']);
      if (!allowed.has(file.type)) {
        setUploadError('Only PDF, JPEG, and PNG files are supported.');
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        setUploadError('File exceeds the 10 MB upload limit.');
        return;
      }
      setUploading(true);
      setUploadError(null);
      setUploadMessage(null);
      const bytes = await file.arrayBuffer();
      const result = await uploadHealthDocument({
        token,
        onUnauthorized: expire,
        countryCode,
        artifactType: 'PRESCRIPTION_UPLOAD',
        originalName: file.name,
        contentType: file.type,
        contentBase64: arrayBufferToBase64(bytes),
        idempotencyKey: `rx-upload-${file.name}-${file.size}-${file.lastModified}`,
      });
      setUploading(false);
      if (!result.ok) {
        setUploadError(result.error || 'Upload failed.');
        return;
      }
      setUploadMessage('Prescription uploaded — visible in Health records and used at checkout when required.');
    },
    [countryCode, expire, getAccessToken, session.status],
  );

  useEffect(() => {
    if (session.status === 'authenticated') {
      void load();
    }
  }, [session.status, load]);

  const currentLines =
    detail?.versions?.find((v) => v.id === detail.current_version_id)?.lines ??
    detail?.versions?.[detail.versions.length - 1]?.lines ??
    [];

  return (
    <Page>
      <section className="mg-service-hero" aria-label="Prescriptions">
        <p className="mg-service-kicker">Digital + paper Rx</p>
        <h1 className="mg-service-title">My Prescriptions</h1>
        <p className="mg-service-sub">
          Upload paper Rx, view digital prescriptions, and order medicines for home delivery.
        </p>
      </section>

      <PageIntro>
        <p>
          Digital prescriptions from doctor consultations appear automatically. For paper prescriptions, upload a clear
          photo or PDF — our pharmacy team will verify before dispensing.
        </p>
      </PageIntro>

      <Section title="How it works">
        <ul className="mg-rx-steps">
          {RX_STEPS.map((step, index) => (
            <li key={step.title} className="mg-rx-step">
              <span className="mg-rx-step-num">{index + 1}</span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </li>
          ))}
        </ul>
      </Section>

      <MgCard className="mg-signin-card">
        <h2 className="mg-section-title">Upload paper prescription</h2>
        <Text tone="secondary">PDF, JPEG, or PNG up to 10 MB — stored securely in your health timeline.</Text>
        {session.status === 'authenticated' && session.audience === 'customer' ? (
          <div className="mg-upload-zone">
            <p className="mg-text-muted">Drag a file here or tap to browse</p>
            <input
              type="file"
              accept="application/pdf,image/jpeg,image/png"
              disabled={uploading}
              aria-label="Upload prescription file"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  void onUploadRx(file);
                  e.target.value = '';
                }
              }}
            />
            {uploading ? <LoadingState label="Uploading prescription" /> : null}
            {uploadMessage ? <Text>{uploadMessage}</Text> : null}
            {uploadError ? <Text tone="secondary">{uploadError}</Text> : null}
          </div>
        ) : (
          <>
            <Text tone="secondary">Sign in to upload a prescription image or PDF.</Text>
            <div className="mg-toolbar">
              <MgBtn href="/login">Sign in</MgBtn>
              <MgBtn href="/signup" variant="secondary">
                Create account
              </MgBtn>
            </div>
          </>
        )}
        <div className="mg-toolbar">
          <MgBtn href="/doctors" variant="ghost" size="sm">
            Consult a doctor
          </MgBtn>
          <MgBtn href="/health" variant="ghost" size="sm">
            Health records
          </MgBtn>
          <MgBtn href="/account/support" variant="ghost" size="sm">
            Need help?
          </MgBtn>
        </div>
      </MgCard>

      {session.status !== 'authenticated' ? (
        <MgCard flat>
          <h2 className="mg-section-title">Your digital prescriptions</h2>
          <Text tone="secondary">After sign-in, medicines prescribed during online consultations appear here with refill and order options.</Text>
          <MgBtn href="/login">Sign in to view</MgBtn>
        </MgCard>
      ) : null}

      {session.status === 'authenticated' && session.audience !== 'customer' ? <PermissionDeniedState /> : null}

      {session.status === 'authenticated' && session.audience === 'customer' ? (
        <>
          {loading ? <LoadingState label="Loading prescriptions" /> : null}
          {error === 'forbidden' ? <PermissionDeniedState /> : null}
          {error === 'network' || error === 'error' ? (
            <NetworkErrorState action={{ label: 'Retry', onClick: () => void load() }} />
          ) : null}

          {!loading && !error && rows.length === 0 ? (
            <EmptyState
              title="No prescriptions yet"
              description="After a doctor consultation, your prescribed medicines will show up here."
              action={{ label: 'Consult a doctor', onClick: () => (window.location.href = '/doctors') }}
            />
          ) : null}

          {!loading && !error && rows.length > 0 ? (
            <Section title={`${rows.length} prescription${rows.length === 1 ? '' : 's'}`}>
              <ul className="mg-order-list">
                {rows.map((row) => (
                  <li key={row.id}>
                    <MgCard>
                      <button
                        type="button"
                        className={`mg-rx-list-btn${selectedId === row.id ? ' is-selected' : ''}`}
                        onClick={() => void loadDetail(row.id)}
                        aria-pressed={selectedId === row.id}
                      >
                        <span className="mg-status">{row.status.replace(/_/g, ' ')}</span>
                        <strong>Prescription · v{row.current_version_number ?? '—'}</strong>
                        <span className="mg-list-meta">
                          {row.created_at ? new Date(row.created_at).toLocaleDateString() : row.id.slice(0, 8)}
                        </span>
                      </button>
                    </MgCard>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          {detailLoading ? <LoadingState label="Loading prescription" /> : null}

          {detail && !detailLoading ? (
            <MgCard>
              <h2 className="mg-section-title">Medicines on this prescription</h2>
              {detail.dispensing_status ? (
                <p className="mg-list-meta">Pharmacy status: {detail.dispensing_status.replace(/_/g, ' ')}</p>
              ) : null}
              {currentLines.length === 0 ? (
                <Text tone="secondary">No medication lines on this prescription.</Text>
              ) : (
                <ul className="mg-rx-lines">
                  {currentLines.map((line, index) => (
                    <li key={`${line.clinical_concept_code}-${index}`}>
                      <strong>{line.clinical_concept_label}</strong>
                      <span>{line.dosage_instructions} · Qty {line.quantity_authorized}</span>
                    </li>
                  ))}
                </ul>
              )}
              {(detail.versions?.length ?? 0) > 1 ? (
                <MgBtn variant="ghost" size="sm" onClick={() => setShowHistory((v) => !v)}>
                  {showHistory ? 'Hide history' : 'View history'}
                </MgBtn>
              ) : null}
              {showHistory
                ? detail.versions?.map((v) => (
                    <Text key={v.id} size="caption">
                      Version {v.version_number}
                      {v.id === detail.current_version_id ? ' (current)' : ''}
                    </Text>
                  ))
                : null}
            </MgCard>
          ) : null}

          {detail && !detailLoading && detail.status !== 'DRAFT' && detail.status !== 'CANCELLED' ? (
            <MgCard>
              <h2 className="mg-section-title">Refill reminders</h2>
              <Text tone="secondary">
                Get notified when it is time to reorder. Automatic payment stays off.
              </Text>
              {session.status === 'authenticated' && getAccessToken() ? (
                <RxSubscriptionPanel
                  prescriptionId={detail.id}
                  token={getAccessToken()!}
                  onUnauthorized={expire}
                />
              ) : null}
              <MgBtn href="/subscriptions" variant="ghost" size="sm">
                All subscriptions
              </MgBtn>
            </MgCard>
          ) : null}

          {detail && !detailLoading && detail.status !== 'DRAFT' && detail.status !== 'CANCELLED' ? (
            <MgCard>
              <h2 className="mg-section-title">Request refill</h2>
              <Text tone="secondary">Ask your doctor to re-authorize when you need more medicines.</Text>
              {refillLoading ? <LoadingState label="Checking refill eligibility" /> : null}
              {!refillLoading && refillEligibility ? (
                <>
                  <p>{refillEligibilityLabel(refillEligibility.reason)}</p>
                  {refillEligibility.open_request_id ? (
                    <p className="mg-list-meta">
                      Request status: {refillEligibility.open_request_status?.replace(/_/g, ' ') ?? '—'}
                    </p>
                  ) : null}
                  {refillError ? <Text tone="secondary">{refillError}</Text> : null}
                  {!refillBusy && refillEligibility.eligible && !refillEligibility.open_request_id ? (
                    <MgBtn onClick={() => void submitRefillRequest()}>Request refill</MgBtn>
                  ) : null}
                  {!refillBusy &&
                  refillEligibility.open_request_id &&
                  refillEligibility.open_request_status &&
                  CANCELLABLE_REFILL_STATUSES.has(refillEligibility.open_request_status) ? (
                    <MgBtn variant="secondary" onClick={() => void cancelOpenRefill()}>
                      Cancel request
                    </MgBtn>
                  ) : null}
                </>
              ) : null}
            </MgCard>
          ) : null}

          {detail && !detailLoading && detail.dispensing_status === 'DISPENSED' ? (
            <MgCard>
              <h2 className="mg-section-title">Order these medicines</h2>
              <Text tone="secondary">Your prescription is ready — add medicines to cart and checkout.</Text>
              {eligibilityLoading ? <LoadingState label="Checking eligibility" /> : null}
              {orderError ? <Text tone="secondary">{orderError}</Text> : null}
              {!eligibilityLoading && eligibility?.reason === 'order_already_exists' && eligibility.order_id ? (
                <MgBtn href={`/orders/${eligibility.order_id}`}>View order</MgBtn>
              ) : null}
              {!orderBusy && !eligibilityLoading && eligibility?.eligible && eligibility.dispensing_case_id ? (
                <MgBtn onClick={() => void orderMedicines()}>{orderBusy ? 'Preparing…' : 'Order medicines'}</MgBtn>
              ) : null}
            </MgCard>
          ) : null}
        </>
      ) : null}
    </Page>
  );
}
