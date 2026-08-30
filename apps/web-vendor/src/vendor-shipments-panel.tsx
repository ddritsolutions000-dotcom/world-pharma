'use client';

import { useCallback, useEffect, useState } from 'react';
import { EmptyState, LoadingState, Table } from '@world-pharma/ui-kit/web';
import { fetchVendorShipments, type VendorShipment } from './vendor-api';

export function VendorShipmentsPanel({
  organizationId,
  token,
  onError,
}: {
  organizationId: string;
  token: string;
  onError: (err: unknown) => void;
}) {
  const [rows, setRows] = useState<VendorShipment[]>([]);
  const [loading, setLoading] = useState(false);

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

  if (loading) {
    return <LoadingState label="Loading shipments" />;
  }

  if (!rows.length) {
    return <EmptyState title="No shipments" description="No sandbox shipments for this seller." />;
  }

  return (
    <Table
      caption="Vendor shipments"
      columns={['Status', 'Tracking']}
      rows={rows.map((row) => [row.status, row.tracking_number ?? 'pending'])}
    />
  );
}
