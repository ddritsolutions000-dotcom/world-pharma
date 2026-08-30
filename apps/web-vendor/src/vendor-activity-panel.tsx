'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Button,
  EmptyState,
  Heading,
  LoadingState,
  Table,
  Text,
} from '@world-pharma/ui-kit/web';
import { fetchVendorMarketplaceActivity, type VendorActivityItem } from './vendor-api';

export function VendorActivityPanel({
  organizationId,
  token,
  onError,
}: {
  organizationId: string;
  token: string;
  onError: (err: unknown) => void;
}) {
  const [rows, setRows] = useState<VendorActivityItem[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!organizationId) {
      return;
    }
    setLoading(true);
    try {
      const body = await fetchVendorMarketplaceActivity(token, organizationId);
      setRows(body.data);
      setNote(body.note ?? null);
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
    return <LoadingState label="Loading seller activity from security events…" />;
  }

  return (
    <div className="wp-stack">
      <Heading level={2}>Activity</Heading>
      <Text tone="secondary">{note ?? 'Shared security-event kernel. No clinical PHI.'}</Text>
      {!rows.length ? (
        <EmptyState title="No activity yet" description="Attestation and inventory events for your person appear here." />
      ) : (
        <Table
          caption="Seller activity"
          columns={['When', 'Type', 'Outcome']}
          rows={rows.map((row) => [String(row.created_at).slice(0, 19), row.type, row.outcome])}
        />
      )}
      <Button size="sm" variant="secondary" onClick={() => void load()}>
        Refresh
      </Button>
    </div>
  );
}
