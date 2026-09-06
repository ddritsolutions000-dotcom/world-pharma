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

export function RadiologySchedulePanel({
  organizationId,
  token,
  onError,
}: {
  organizationId: string;
  token: string;
  onError: (err: unknown) => void;
}) {
  const [bookings, setBookings] = useState<ImagingStaffBooking[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!organizationId) {
      return;
    }
    setLoading(true);
    try {
      const body = await fetchImagingStaffBookings(token, organizationId);
      setBookings(body.data ?? []);
    } catch (err) {
      onError(err);
    } finally {
      setLoading(false);
    }
  }, [organizationId, onError, token]);

  useEffect(() => {
    void load();
  }, [load]);

  const scheduled = bookings.filter((row) => row.status === 'CONFIRMED' || row.status === 'CHECKED_IN' || row.slot_starts_at);

  return (
    <Card>
      <Heading level={2}>Equipment schedule</Heading>
      <Text tone="secondary">Confirmed and checked-in imaging bookings — operational slot view (sandbox).</Text>
      <Button size="sm" variant="secondary" onClick={() => void load()}>
        Refresh schedule
      </Button>
      {loading ? <LoadingState label="Loading schedule" /> : null}
      {!loading && scheduled.length === 0 ? (
        <EmptyState title="No scheduled studies" description="Bookings appear here after customer confirmation and check-in." />
      ) : null}
      {!loading && scheduled.length > 0 ? (
        <ul className="wp-stack">
          {scheduled.map((row) => (
            <li key={row.id}>
              <Text>
                {row.id.slice(0, 8)} · {row.status} · {row.slot_starts_at ?? 'Unscheduled'}
              </Text>
              <Text size="caption">{row.lines[0]?.title ?? 'Imaging study'}</Text>
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}
