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
import { fetchLabStaffBookings, type LabStaffBooking } from './lab-api';

export function LabBookingsPanel({
  organizationId,
  token,
  onError,
}: {
  organizationId: string;
  token: string;
  onError: (err: unknown) => void;
}) {
  const [rows, setRows] = useState<LabStaffBooking[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const body = await fetchLabStaffBookings(token, organizationId);
      setRows(body.data);
      setNote(body.note ?? null);
    } catch (err) {
      onError(err);
    } finally {
      setLoading(false);
    }
  }, [onError, organizationId, token]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Card>
      <Heading level={2}>Bookings</Heading>
      <Text tone="secondary">
        Confirmed and pending customer bookings for this laboratory. Collection queue is on the Collections tab.
      </Text>
      <Button size="sm" variant="secondary" onClick={() => void load()}>
        Refresh bookings
      </Button>
      {loading ? <LoadingState label="Loading lab bookings…" /> : null}
      {!loading && !rows.length ? (
        <EmptyState title="No bookings yet" description="Customer sandbox bookings will appear here when created." />
      ) : null}
      {rows.map((row) => (
        <Card key={row.id}>
          <Text>
            {row.lines[0]?.title ?? 'Booking'} · {row.status}
          </Text>
          <Text size="caption">
            {row.collection_mode} · {row.currency} {row.total_minor}
            {row.slot_starts_at ? ` · ${new Date(row.slot_starts_at).toLocaleString()}` : ''}
          </Text>
          <Text size="caption">Sandbox={String(row.sandbox)}</Text>
        </Card>
      ))}
      {note ? <Text size="caption">{note}</Text> : null}
    </Card>
  );
}
