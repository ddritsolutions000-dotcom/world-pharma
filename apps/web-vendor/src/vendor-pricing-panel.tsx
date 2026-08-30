'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card, EmptyState, Heading, LoadingState, Table, Text } from '@world-pharma/ui-kit/web';
import { fetchVendorCommercialRules, type VendorCommercialRule } from './vendor-api';

export function VendorPricingPanel({
  organizationId,
  token,
  onError,
}: {
  organizationId: string;
  token: string;
  onError: (err: unknown) => void;
}) {
  const [rows, setRows] = useState<VendorCommercialRule[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!organizationId) {
      return;
    }
    setLoading(true);
    try {
      const body = await fetchVendorCommercialRules(token, organizationId);
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
    return <LoadingState label="Loading commercial terms for your seller catalog…" />;
  }

  return (
    <div className="wp-stack">
      <Card>
        <Heading level={2}>Commercial rules (read-only)</Heading>
        <Text tone="secondary">
          Configured marketplace/country rules that may apply to your seller organization. Take rates are not
          hardcoded in the app — they come from CommercialRule. You cannot edit company rules here.
        </Text>
        {note ? <Text size="caption">{note}</Text> : null}
      </Card>

      {!rows.length ? (
        <EmptyState
          title="No visible commercial rules"
          description="When company policy publishes marketplace rules for your country or seller, they appear here. Other vendors’ seller-specific rules stay hidden."
        />
      ) : (
        <Table
          caption="Seller-visible commercial rules"
          columns={['Scope', 'Country', 'Channel', 'Take bps', 'Flat minor', 'Priority']}
          rows={rows.map((row) => [
            row.scope,
            row.country_code ?? '—',
            row.channel ?? 'any',
            String(row.take_bps),
            row.take_flat_minor,
            String(row.priority),
          ])}
        />
      )}
    </div>
  );
}
