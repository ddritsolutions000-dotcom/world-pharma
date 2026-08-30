'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Card,
  EmptyState,
  FormField,
  Heading,
  Input,
  LoadingState,
  Text,
} from '@world-pharma/ui-kit/web';
import {
  checkInImagingBooking,
  fetchImagingStaffBookings,
  type ImagingStaffBooking,
} from './radiology-api';

export function ImagingCheckInPanel({
  organizationId,
  token,
  technicianPersonId,
  onError,
  onCheckedIn,
}: {
  organizationId: string;
  token: string;
  technicianPersonId: string;
  onError: (err: unknown) => void;
  onCheckedIn: () => void;
}) {
  const [bookings, setBookings] = useState<ImagingStaffBooking[]>([]);
  const [bookingId, setBookingId] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const body = await fetchImagingStaffBookings(token, organizationId);
      setBookings(body.data.filter((row) => row.status === 'CONFIRMED'));
    } catch (err) {
      onError(err);
    } finally {
      setLoading(false);
    }
  }, [onError, organizationId, token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function checkIn(id: string) {
    setBusy(true);
    setMessage(null);
    try {
      const study = await checkInImagingBooking(token, {
        imaging_org_id: organizationId,
        imaging_booking_id: id,
        assignee_person_id: technicianPersonId,
      });
      setMessage(`Checked in · study ${study.accession_number} · ${study.status}`);
      onCheckedIn();
      await load();
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <Heading level={2}>Check-in desk</Heading>
      <Text tone="secondary">
        Check in confirmed sandbox bookings and create imaging studies. No DICOM/PACS. Production PACS = OFF.
      </Text>
      <Button size="sm" variant="secondary" disabled={loading || busy} onClick={() => void load()}>
        Refresh confirmed bookings
      </Button>
      {loading ? <LoadingState label="Loading bookings…" /> : null}
      {!loading && !bookings.length ? (
        <EmptyState title="No confirmed bookings" description="Confirmed customer bookings awaiting check-in appear here." />
      ) : null}
      {bookings.map((row) => (
        <Card key={row.id}>
          <Text>
            {row.lines[0]?.title ?? 'Booking'} · {row.status}
          </Text>
          <Text size="caption">{row.id}</Text>
          <Button size="sm" disabled={busy} onClick={() => void checkIn(row.id)}>
            Check in & assign me
          </Button>
        </Card>
      ))}
      <FormField label="Or enter booking ID">
        {({ id }) => (
          <Input id={id} value={bookingId} onChange={(e) => setBookingId(e.target.value)} placeholder="Booking UUID" />
        )}
      </FormField>
      <Button
        size="sm"
        variant="secondary"
        disabled={!bookingId.trim() || busy}
        onClick={() => void checkIn(bookingId.trim())}
      >
        Check in by ID
      </Button>
      {message ? <Text>{message}</Text> : null}
    </Card>
  );
}
