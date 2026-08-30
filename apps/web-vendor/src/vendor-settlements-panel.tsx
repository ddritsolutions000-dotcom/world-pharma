'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Card,
  EmptyState,
  Heading,
  LoadingState,
  Table,
  Text,
} from '@world-pharma/ui-kit/web';
import {
  VendorApiError,
  fetchVendorSettlement,
  fetchVendorSettlements,
  type VendorSettlement,
  type VendorSettlementDetail,
} from './vendor-api';

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
}: {
  organizationId: string;
  token: string;
  onError: (err: unknown) => void;
}) {
  const [rows, setRows] = useState<VendorSettlement[]>([]);
  const [detail, setDetail] = useState<VendorSettlementDetail | null>(null);
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
      const body = await fetchVendorSettlements(token, organizationId);
      setRows(body.data);
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

  if (loading) {
    return <LoadingState label="Loading sandbox settlement lines for your pharmacy seller…" />;
  }

  return (
    <div className="wp-stack">
      <Text tone="secondary">
        Own-seller settlement lines only (sandbox). Real bank payout remains OFF. Another vendor cannot see this list.
      </Text>
      {formError ? <Text tone="secondary">{formError}</Text> : null}

      {!rows.length ? (
        <EmptyState
          title="No settlements yet"
          description="Settlement lines appear after company finance schedules sandbox batches for your seller org."
        />
      ) : (
        <Card>
          <Heading level={2}>Settlement lines</Heading>
          <Table
            caption="Vendor settlements"
            columns={['Line', 'Batch status', 'Net', 'Payable', 'Order']}
            rows={rows.map((row) => [
              row.id.slice(0, 8),
              row.status,
              `${row.net_minor} ${row.currency ?? ''}`.trim(),
              row.payable_status ?? '—',
              row.order_id ? row.order_id.slice(0, 8) : '—',
            ])}
          />
          <div className="wp-stack" style={{ gap: 8 }}>
            {rows.map((row) => (
              <div
                key={row.id}
                className="wp-stack"
                style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}
              >
                <Text>
                  {row.id.slice(0, 8)} · {row.status} · {row.net_minor}
                </Text>
                <Button size="sm" variant="secondary" onClick={() => void openDetail(row.id)}>
                  Open detail
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {detailLoading ? <LoadingState label="Loading settlement detail…" /> : null}
      {notFound ? (
        <EmptyState title="Settlement not found" description="This line is not available to your seller organization." />
      ) : null}

      {detail && !detailLoading ? (
        <Card>
          <Heading level={2}>Settlement detail</Heading>
          <Text size="caption">{detail.message ?? 'Sandbox settlement.'}</Text>
          <Text>
            Line {detail.id.slice(0, 8)} · Batch {detail.batch_id?.slice(0, 8) ?? '—'} · Status {detail.status}
          </Text>
          <Text size="caption">
            Period {formatWhen(detail.period_starts_at)} → {formatWhen(detail.period_ends_at)}
          </Text>
          <Text size="caption">
            Gross {detail.gross_minor ?? '—'} · Fees {detail.fee_minor ?? '—'} · Refunds {detail.refund_minor ?? '—'} ·
            Net {detail.net_minor} {detail.currency ?? ''}
          </Text>
          <Text size="caption">
            Order {detail.order_id?.slice(0, 8) ?? '—'} · Payable {detail.payable_status ?? '—'} · live_payout=
            {String(detail.live_payout ?? false)}
          </Text>
          {detail.take_bps_frozen !== undefined ? (
            <Text size="caption">
              Frozen take {detail.take_bps_frozen} bps + {detail.take_flat_frozen ?? '0'} flat (immutable commercial
              facts)
            </Text>
          ) : null}
          {detail.payouts?.length ? (
            <Table
              caption="Sandbox payouts"
              columns={['Payout', 'Status', 'Amount', 'Sandbox']}
              rows={detail.payouts.map((row) => [
                row.id.slice(0, 8),
                row.status,
                `${row.amount_minor} ${row.currency}`,
                row.sandbox ? 'yes' : 'no',
              ])}
            />
          ) : (
            <Text size="caption">No payout rows on this batch yet (sandbox).</Text>
          )}
          <Button size="sm" variant="secondary" onClick={() => setDetail(null)}>
            Close detail
          </Button>
        </Card>
      ) : null}
    </div>
  );
}
