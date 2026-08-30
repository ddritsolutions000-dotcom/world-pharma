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
  Text,
} from '@world-pharma/ui-kit/web';
import Link from 'next/link';
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
  type RxSubscriptionView,
} from './care-api';
import { CustomerShell } from './customer-shell';

function newIdempotencyKey(prefix = 'rx'): string {
  return globalThis.crypto?.randomUUID?.() ?? `${prefix}-${Date.now()}`;
}

function subscriptionStatusLabel(subscription: RxSubscriptionView | null | undefined): string {
  if (!subscription?.available) {
    return 'UNAVAILABLE';
  }
  if (subscription.auto_execute_enabled) {
    return 'OFF';
  }
  return subscription.status === 'DISABLED' ? 'OFF' : subscription.status;
}

const CANCELLABLE_REFILL_STATUSES = new Set(['REQUESTED', 'PENDING_REAUTH']);

export function PrescriptionsScreen() {
  const { session, getAccessToken, expire } = useSession();
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
    <CustomerShell apiReachable={true} countryLabel="session">
      <Heading level={2}>Prescriptions</Heading>
      <Text tone="secondary">
        Read-only. Draft prescriptions are not shown. You cannot edit clinical instructions. Privacy controls live under
        Account.
      </Text>

      {session.status !== 'authenticated' ? (
        <EmptyState title="Sign in required" description="Sign in to view prescriptions." />
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
              title="No prescriptions"
              description="Issued prescriptions from your care visits appear here."
            />
          ) : null}

          {!loading && !error
            ? rows.map((row) => (
                <Button
                  key={row.id}
                  variant={selectedId === row.id ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => void loadDetail(row.id)}
                >
                  {`${row.status} · v${row.current_version_number ?? '—'} · ${row.id.slice(0, 8)}`}
                </Button>
              ))
            : null}

          {detailLoading ? <LoadingState label="Loading detail" /> : null}

          {detail && !detailLoading ? (
            <>
              <Card>
                <Heading level={3}>Clinical record</Heading>
                <Text>{`Status: ${detail.status}`}</Text>
                {detail.dispensing_status ? (
                  <Text size="caption">{`Dispensing: ${detail.dispensing_status}`}</Text>
                ) : null}
                <Text size="caption">
                  {`Current version ${detail.current_version_number ?? '—'} of ${detail.versions?.length ?? 1}`}
                </Text>
                <Text size="caption">{`Created: ${detail.created_at ?? '—'}`}</Text>
                {detail.cancelled_at ? <Text size="caption">{`Cancelled: ${detail.cancelled_at}`}</Text> : null}
                <Text>Medication instructions (current version)</Text>
                {currentLines.length === 0 ? (
                  <Text tone="secondary">No medication lines on the current version.</Text>
                ) : (
                  currentLines.map((line, index) => (
                    <Text key={`${line.clinical_concept_code}-${index}`} size="caption">
                      {`${line.line_number ?? index + 1}. ${line.clinical_concept_label} · ${line.dosage_instructions} · qty ${line.quantity_authorized}`}
                    </Text>
                  ))
                )}
                {(detail.versions?.length ?? 0) > 1 ? (
                  <>
                    <Button size="sm" variant="secondary" onClick={() => setShowHistory((v) => !v)}>
                      {showHistory ? 'Hide prior versions' : 'Show prior versions'}
                    </Button>
                    {showHistory
                      ? detail.versions?.map((v) => (
                          <Text key={v.id} size="caption">
                            {`Version ${v.version_number}${v.id === detail.current_version_id ? ' (current)' : ''}${v.sealed_at ? '' : ' · unsealed'}`}
                          </Text>
                        ))
                      : null}
                  </>
                ) : null}
              </Card>

              {detail.status !== 'DRAFT' && detail.status !== 'CANCELLED' ? (
                <Card>
                  <Heading level={3}>Refill request</Heading>
                  <Text tone="secondary">
                    ED-R5E-01: fail-closed refill with doctor re-authorization. Automatic subscription refill is never
                    enabled by default.
                  </Text>
                  {refillLoading ? <LoadingState label="Checking refill eligibility" /> : null}
                  {!refillLoading && refillEligibility ? (
                    <>
                      <Text>{refillEligibilityLabel(refillEligibility.reason)}</Text>
                      {refillEligibility.require_doctor_reauth ? (
                        <Text size="caption">Doctor clinical re-authorization is required.</Text>
                      ) : null}
                      {refillEligibility.open_request_id ? (
                        <>
                          <Text size="caption">{`Open request: ${refillEligibility.open_request_status ?? '—'} (${refillEligibility.open_request_id.slice(0, 8)})`}</Text>
                          {refillEligibility.open_request_status === 'PENDING_REAUTH' ? (
                            <Text size="caption">Awaiting your doctor&apos;s review.</Text>
                          ) : null}
                          {refillEligibility.open_request_status === 'QUEUED_FOR_DISPENSE' ? (
                            <Text size="caption">Approved — pharmacy will process a new dispense case.</Text>
                          ) : null}
                        </>
                      ) : null}
                      <Text size="caption">{`Automatic refill: ${refillEligibility.auto_refill ? 'OFF' : 'OFF'}`}</Text>
                      <Heading level={4}>Subscription</Heading>
                      <Text size="caption">
                        {`Status: ${subscriptionStatusLabel(refillEligibility.subscription)} · auto-execute: OFF`}
                      </Text>
                      {refillEligibility.subscription?.note ? (
                        <Text size="caption">{refillEligibility.subscription.note}</Text>
                      ) : (
                        <Text size="caption">Automatic refill / subscription is unavailable unless explicitly configured.</Text>
                      )}
                      {refillBusy ? <LoadingState label="Updating refill request" /> : null}
                      {refillError ? <Text tone="secondary">{refillError}</Text> : null}
                      {!refillBusy &&
                      refillEligibility.eligible &&
                      !refillEligibility.open_request_id ? (
                        <Button onClick={() => void submitRefillRequest()}>Request refill</Button>
                      ) : null}
                      {!refillBusy &&
                      refillEligibility.open_request_id &&
                      refillEligibility.open_request_status &&
                      CANCELLABLE_REFILL_STATUSES.has(refillEligibility.open_request_status) ? (
                        <Button variant="secondary" onClick={() => void cancelOpenRefill()}>
                          Cancel refill request
                        </Button>
                      ) : null}
                      {refillHistory.length ? (
                        <>
                          <Heading level={4}>Refill history</Heading>
                          {refillHistory.map((row) => (
                            <Text key={row.id} size="caption">
                              {`${row.status} · ${row.id.slice(0, 8)} · ${row.created_at}${row.next ? ` · ${row.next}` : ''}`}
                            </Text>
                          ))}
                        </>
                      ) : null}
                    </>
                  ) : null}
                  {!refillLoading && !refillEligibility ? (
                    <Text tone="secondary">Refill eligibility could not be loaded.</Text>
                  ) : null}
                </Card>
              ) : null}

              {detail.dispensing_status === 'DISPENSED' ? (
                <Card>
                  <Heading level={3}>Commercial order</Heading>
                  <Text tone="secondary">
                    Pharmacy has dispensed this prescription. Review mapped SKUs below, then start checkout.
                  </Text>
                  {eligibilityLoading ? <LoadingState label="Checking order eligibility" /> : null}
                  {!eligibilityLoading && eligibility?.commerce_items?.length ? (
                    <>
                      <Text size="caption">Mapped medicines (commercial SKUs)</Text>
                      {eligibility.commerce_items.map((item) => (
                        <Text key={`${item.prescription_line_id}-${item.catalog_variant_id}`} size="caption">
                          {`Variant ${item.catalog_variant_id.slice(0, 8)} · qty ${item.quantity_dispensed} · lot ${item.inventory_lot_id.slice(0, 8)}`}
                        </Text>
                      ))}
                    </>
                  ) : null}
                  {!eligibilityLoading &&
                  eligibility &&
                  !eligibility.commerce_items?.length &&
                  eligibility.reason !== 'order_already_exists' ? (
                    <Text tone="secondary">No commercial SKU mappings available yet.</Text>
                  ) : null}
                  {orderBusy ? <LoadingState label="Preparing your medicines for order" /> : null}
                  {orderError ? <Text tone="secondary">{orderError}</Text> : null}
                  {!eligibilityLoading &&
                  eligibility?.reason === 'order_already_exists' &&
                  eligibility.order_id ? (
                    <Link href={`/orders/${eligibility.order_id}`}>
                      <Button variant="secondary">View order</Button>
                    </Link>
                  ) : null}
                  {!orderBusy &&
                  !eligibilityLoading &&
                  eligibility?.eligible &&
                  eligibility.dispensing_case_id ? (
                    <Button onClick={() => void orderMedicines()}>Order medicines</Button>
                  ) : null}
                  {!orderBusy &&
                  !eligibilityLoading &&
                  eligibility &&
                  !eligibility.eligible &&
                  eligibility.reason !== 'order_already_exists' ? (
                    <Text tone="secondary">Not eligible to order yet.</Text>
                  ) : null}
                </Card>
              ) : null}
            </>
          ) : null}
        </>
      ) : null}
    </CustomerShell>
  );
}
