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
import { fetchImagingStaffBookings, type ImagingStaffBooking } from './radiology-api';

export function ImagingBookingsPanel({
  organizationId,
  token,
  onError,
}: {
  organizationId: string;
  token: string;
  onError: (err: unknown) => void;
}) {
  const [rows, setRows] = useState<ImagingStaffBooking[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const body = await fetchImagingStaffBookings(token, organizationId);
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
        Read-only customer bookings for this imaging center. Use Check-in and Studies tabs for R8-C acquisition.
      </Text>
      <Button size="sm" variant="secondary" onClick={() => void load()}>
        Refresh bookings
      </Button>
      {loading ? <LoadingState label="Loading imaging bookings…" /> : null}
      {!loading && !rows.length ? (
        <EmptyState title="No bookings yet" description="Customer sandbox bookings will appear here when created." />
      ) : null}
      {rows.map((row) => (
        <Card key={row.id}>
          <Text>
            {row.lines[0]?.title ?? 'Booking'} · {row.status}
          </Text>
          <Text size="caption">
            {row.currency} {row.total_minor}
            {row.slot_starts_at ? ` · ${new Date(row.slot_starts_at).toLocaleString()}` : ''}
          </Text>
          {row.imaging_location ? (
            <Text size="caption">
              {row.imaging_location.name}
              {row.imaging_location.city ? ` · ${row.imaging_location.city}` : ''}
            </Text>
          ) : null}
          <Text size="caption">Sandbox={String(row.sandbox)}</Text>
        </Card>
      ))}
      {note ? <Text size="caption">{note}</Text> : null}
    </Card>
  );
}
