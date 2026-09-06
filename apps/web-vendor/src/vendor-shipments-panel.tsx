'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Card,
  EmptyState,
  Heading,
  LoadingState,
  Text,
} from '@world-pharma/ui-kit/web';
import {
  VendorApiError,
  fetchVendorShipment,
  fetchVendorShipments,
  type VendorShipment,
  type VendorShipmentDetail,
} from './vendor-api';
import { formatCurrencyMinor, statusBadgeClass } from './vendor-format';

export function VendorShipmentsPanel({
  organizationId,
  token,
  onError,
  initialShipmentId,
}: {
  organizationId: string;
  token: string;
  onError: (err: unknown) => void;
  initialShipmentId?: string;
}) {
  const [rows, setRows] = useState<VendorShipment[]>([]);
  const [detail, setDetail] = useState<VendorShipmentDetail | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!organizationId) {
      return;
    }
    setLoading(true);
    try {
      const body = await fetchVendorShipments(token, organizationId);
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

  const openDetail = async (shipmentId: string) => {
    setSelectedId(shipmentId);
    setFormError(null);
    setDetailLoading(true);
    try {
      setDetail(await fetchVendorShipment(token, shipmentId));
    } catch (err) {
      if (err instanceof VendorApiError && err.status !== 401 && err.status !== 403) {
        setFormError(err.message);
      } else {
        onError(err);
      }
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    if (initialShipmentId) {
      void openDetail(initialShipmentId);
    }
  }, [initialShipmentId]);

  if (loading) {
    return <LoadingState label="Loading shipments" />;
  }

  return (
    <div className="wp-stack">
      <div className="wp-toolbar">
        <Button variant="secondary" size="sm" onClick={() => void load()}>
          Refresh
        </Button>
      </div>
      {formError ? <Text tone="secondary">{formError}</Text> : null}

      {!rows.length ? (
        <EmptyState
          title="No shipments yet"
          description="Shipments appear after orders are marked ready and carrier booking runs in sandbox."
        />
      ) : (
        <div className="wp-order-layout">
          <Card>
            <Heading level={3}>Shipment queue ({rows.length})</Heading>
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
                        <span className="wp-mini-id">{row.id.slice(0, 8)}</span>
                        <span className={statusBadgeClass(row.status)}>{row.status}</span>
                      </p>
                      <p className="wp-mini-meta">Tracking {row.tracking_number ?? 'pending assignment'}</p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </Card>

          <div className="wp-order-detail">
            {detailLoading ? <LoadingState label="Loading shipment detail…" /> : null}
            {detail && !detailLoading ? (
              <Card>
                <Heading level={2}>
                  Shipment <span className={statusBadgeClass(detail.status)}>{detail.status}</span>
                </Heading>
                  <Text size="caption">Carrier {detail.carrier ?? 'sandbox'} · Tracking {detail.tracking_number ?? '—'}</Text>
                {detail.message ? <Text size="caption">{detail.message}</Text> : null}
                {detail.quoted_cost_minor || detail.actual_cost_minor ? (
                  <Text size="caption">
                    Quoted {formatCurrencyMinor(detail.quoted_cost_minor, detail.currency ?? 'XXX')} · Actual{' '}
                    {formatCurrencyMinor(detail.actual_cost_minor, detail.currency ?? 'XXX')}
                  </Text>
                ) : null}
                {detail.label ? <Text size="caption">Label {detail.label}</Text> : null}
                {detail.timeline?.length ? (
                  <>
                    <Heading level={3}>Timeline</Heading>
                    <ul className="wp-mini-list">
                      {detail.timeline.map((event, index) => (
                        <li key={`${event.status}-${index}`} className="wp-mini-row">
                          <div className="wp-mini-main">
                            <p className="wp-mini-title">{event.status}</p>
                            <p className="wp-mini-meta">{String(event.occurred_at ?? '').slice(0, 19)}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <Text size="caption">No tracking events yet.</Text>
                )}
              </Card>
            ) : !detailLoading ? (
              <Card>
                <EmptyState title="Select a shipment" description="Choose a row to view tracking timeline." />
              </Card>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
