'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Card,
  EmptyState,
  Heading,
  LoadingState,
  Text,
} from '@world-pharma/ui-kit/web';
import {
  VendorApiError,
  fetchVendorFinanceSummary,
  fetchVendorPayables,
  fetchVendorSettlement,
  fetchVendorSettlements,
  type VendorFinanceSummary,
  type VendorPayable,
  type VendorSettlement,
  type VendorSettlementDetail,
} from './vendor-api';
import { vendorPayableStatusLabel, vendorPayoutStatusLabel, vendorSettlementStatusLabel } from './vendor-status-labels';
import { formatCurrencyMinor, statusBadgeClass } from './vendor-format';

function formatWhen(value?: string | null): string {
  if (!value) {
    return '—';
  }
  return String(value).slice(0, 19);
}

export function VendorSettlementsPanel({
  organizationId,
  token,
  onError,
  initialSettlementId,
}: {
  organizationId: string;
  token: string;
  onError: (err: unknown) => void;
  initialSettlementId?: string;
}) {
  const [rows, setRows] = useState<VendorSettlement[]>([]);
  const [payables, setPayables] = useState<VendorPayable[]>([]);
  const [summary, setSummary] = useState<VendorFinanceSummary | null>(null);
  const [detail, setDetail] = useState<VendorSettlementDetail | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(async () => {
    if (!organizationId) {
      return;
    }
    setLoading(true);
    try {
      const [settlements, payableRows, financeSummary] = await Promise.all([
        fetchVendorSettlements(token, organizationId),
        fetchVendorPayables(token, organizationId),
        fetchVendorFinanceSummary(token, organizationId),
      ]);
      setRows(settlements.data);
      setPayables(payableRows.data);
      setSummary(financeSummary);
    } catch (err) {
      onError(err);
    } finally {
      setLoading(false);
    }
  }, [organizationId, onError, token]);

  useEffect(() => {
    void load();
  }, [load]);

  const openDetail = async (lineId: string) => {
    setSelectedId(lineId);
    setFormError(null);
    setNotFound(false);
    setDetailLoading(true);
    try {
      const body = await fetchVendorSettlement(token, lineId);
      setDetail(body);
    } catch (err) {
      if (err instanceof VendorApiError) {
        if (err.status === 404) {
          setNotFound(true);
          setDetail(null);
          return;
        }
        if (err.status === 401 || err.status === 403) {
          onError(err);
          return;
        }
        setFormError(err.message);
        return;
      }
      onError(err);
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    if (initialSettlementId) {
      void openDetail(initialSettlementId);
    }
  }, [initialSettlementId]);

  if (loading) {
    return <LoadingState label="Loading sandbox settlement lines for your pharmacy seller…" />;
  }

  return (
    <div className="wp-stack">
      <Text tone="secondary">
        Own-seller settlement lines only (sandbox). Real bank payout remains OFF. Another vendor cannot see this list.
      </Text>
      {formError ? <Text tone="secondary">{formError}</Text> : null}

      <Text tone="secondary">
        Payables are created per order immediately. Settlement lines appear only after company finance batches them.
        Sandbox only — live bank payout remains OFF.
      </Text>

      {summary ? (
        <Card>
          <Heading level={2}>Finance summary</Heading>
          <Text size="caption">{summary.message}</Text>
          <Text>
            Total payable {formatCurrencyMinor(summary.total_payable_minor, summary.currency)} · Pending{' '}
            {formatCurrencyMinor(summary.pending_payable_minor, summary.currency)} · Settled{' '}
            {formatCurrencyMinor(summary.settled_payable_minor, summary.currency)}
          </Text>
          <Text size="caption">
            Batched settlement lines: {summary.settlement_line_count} (
            {formatCurrencyMinor(summary.settlement_batched_minor, summary.currency)})
          </Text>
        </Card>
      ) : null}

      <Card>
        <Heading level={2}>Order payables ({payables.length})</Heading>
        {!payables.length ? (
          <EmptyState title="No payables yet" description="Payables appear after customer orders are committed." />
        ) : (
          <ul className="wp-mini-list">
            {payables.map((row) => (
              <li key={row.id} className="wp-mini-row">
                <div className="wp-mini-main">
                  <p className="wp-mini-title">
                    {row.order_number}
                    <span className={statusBadgeClass(row.status)}>{row.status}</span>
                  </p>
                  <p className="wp-mini-meta">
                    Gross {formatCurrencyMinor(row.gross_minor, row.currency)} · Fee{' '}
                    {formatCurrencyMinor(row.fee_minor, row.currency)} · Payable{' '}
                    {formatCurrencyMinor(row.payable_minor, row.currency)}
                  </p>
                </div>
                <div className="wp-mini-right">
                  <Text size="caption">
                    {row.settlement_line_id ? `Batch ${row.settlement_batch_id?.slice(0, 8)}` : 'Not batched yet'}
                  </Text>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {!rows.length ? (
        <EmptyState
          title="No settlement batches yet"
          description="Settlement lines appear after company finance schedules sandbox batches for your seller org."
        />
      ) : (
        <div className="wp-order-layout">
          <Card>
            <Heading level={2}>Settlement lines ({rows.length})</Heading>
            <ul className="wp-mini-list">
              {rows.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    className={`wp-order-row${selectedId === row.id ? ' wp-order-row--active' : ''}`}
                    onClick={() => void openDetail(row.id)}
                  >
                    <div className="wp-mini-main">
                      <p className="wp-mini-title">
                        <span className="wp-mini-id">{row.batch_id?.slice(0, 8) ?? row.id.slice(0, 8)}</span>
                        <span className={statusBadgeClass(row.status)}>{vendorSettlementStatusLabel(row.status)}</span>
                      </p>
                      <p className="wp-mini-meta">
                        Order {row.order_id ? row.order_id.slice(0, 8) : '—'} ·{' '}
                        {vendorPayableStatusLabel(row.payable_status)}
                      </p>
                    </div>
                    <div className="wp-mini-right">
                      <Text size="bodyLg">{formatCurrencyMinor(row.net_minor, row.currency ?? 'XXX')}</Text>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </Card>

          <div className="wp-order-detail">
            {detailLoading ? <LoadingState label="Loading settlement detail…" /> : null}
            {notFound ? (
              <EmptyState title="Settlement not found" description="This line is not available to your seller organization." />
            ) : null}
            {detail && !detailLoading ? (
              <Card>
                <Heading level={2}>Settlement detail</Heading>
                <Text size="caption">{detail.message ?? 'Sandbox settlement.'}</Text>
                <Text>
                  Line {detail.id.slice(0, 8)} · Batch {detail.batch_id?.slice(0, 8) ?? '—'} ·{' '}
                  <span className={statusBadgeClass(detail.status)}>{vendorSettlementStatusLabel(detail.status)}</span>
                </Text>
                <Text size="caption">
                  Period {formatWhen(detail.period_starts_at)} → {formatWhen(detail.period_ends_at)}
                </Text>
                <Text size="caption">
                  Gross {formatCurrencyMinor(detail.gross_minor, detail.currency ?? 'XXX')} · Fees{' '}
                  {formatCurrencyMinor(detail.fee_minor, detail.currency ?? 'XXX')} · Refunds{' '}
                  {formatCurrencyMinor(detail.refund_minor, detail.currency ?? 'XXX')} · Net{' '}
                  {formatCurrencyMinor(detail.net_minor, detail.currency ?? 'XXX')}
                </Text>
                {detail.hold_until ? (
                  <Text size="caption">Hold until {formatWhen(detail.hold_until)}</Text>
                ) : null}
                <Text size="caption">
                  Order {detail.order_id?.slice(0, 8) ?? '—'} · Payable {vendorPayableStatusLabel(detail.payable_status)} ·
                  live bank payout={detail.live_payout ? 'on' : 'off (sandbox)'}
                </Text>
                {detail.take_bps_frozen !== undefined ? (
                  <Text size="caption">
                    Frozen take {detail.take_bps_frozen} bps + {detail.take_flat_frozen ?? '0'} flat (immutable commercial
                    facts)
                  </Text>
                ) : null}
                {detail.payouts?.length ? (
                  <ul className="wp-mini-list">
                    {detail.payouts.map((row) => (
                      <li key={row.id} className="wp-mini-row">
                        <div className="wp-mini-main">
                          <p className="wp-mini-title">{vendorPayoutStatusLabel(row.status)}</p>
                          <p className="wp-mini-meta">{row.id.slice(0, 8)}</p>
                        </div>
                        <div className="wp-mini-right">
                          <Text size="bodyLg">{formatCurrencyMinor(row.amount_minor, row.currency)}</Text>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Text size="caption">No payout rows on this batch yet (sandbox).</Text>
                )}
              </Card>
            ) : !detailLoading && !notFound ? (
              <Card>
                <EmptyState title="Select a settlement" description="Choose a line to view payable and payout detail." />
              </Card>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
