'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  EmptyState,
  FormField,
  Heading,
  LoadingState,
  Text,
} from '@world-pharma/ui-kit/web';
import { fetchImagingStaffBookings, type ImagingStaffBooking } from './radiology-api';
import { imagingBookingNextStep, imagingBookingStatusFilter, type ImagingBookingFilter } from './imaging-booking-actions';
import { imagingBookingStatusLabel } from './imaging-ops-labels';

const FILTER_OPTIONS: Array<{ value: ImagingBookingFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'cancelled', label: 'Cancelled / failed' },
];

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
  const [filter, setFilter] = useState<ImagingBookingFilter>('all');

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

  const filtered = useMemo(
    () => rows.filter((row) => imagingBookingStatusFilter(row.status, filter)),
    [filter, rows],
  );

  return (
    <Card>
      <Heading level={2}>Bookings</Heading>
      <Text tone="secondary">
        Customer sandbox imaging bookings for this center. Check-in and acquisition are on their tabs after payment confirms.
      </Text>
      <div className="wp-inline-actions">
        <Button size="sm" variant="secondary" onClick={() => void load()} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh bookings'}
        </Button>
        <FormField label="Filter">
          {({ id }) => (
            <select
              id={id}
              className="wp-input"
              value={filter}
              onChange={(e) => setFilter(e.target.value as ImagingBookingFilter)}
            >
              {FILTER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          )}
        </FormField>
      </div>
      {loading ? <LoadingState label="Loading imaging bookings…" /> : null}
      {!loading && !filtered.length ? (
        <EmptyState
          title={rows.length ? 'No bookings match filter' : 'No bookings yet'}
          description={
            rows.length
              ? 'Try another filter or refresh after a customer books a study.'
              : 'Customer sandbox bookings will appear here when created and paid.'
          }
        />
      ) : null}
      {filtered.length ? (
        <table className="wp-data-table">
          <thead>
            <tr>
              <th>Study</th>
              <th>Status</th>
              <th>When</th>
              <th>Location</th>
              <th>Next</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr key={row.id}>
                <td>{row.lines[0]?.title ?? 'Booking'}</td>
                <td>
                  <span className="wp-status">{imagingBookingStatusLabel(row.status)}</span>
                </td>
                <td>{row.slot_starts_at ? new Date(row.slot_starts_at).toLocaleString() : '—'}</td>
                <td>
                  {row.imaging_location
                    ? `${row.imaging_location.name}${row.imaging_location.city ? ` · ${row.imaging_location.city}` : ''}`
                    : '—'}
                </td>
                <td>{imagingBookingNextStep(row.status) ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {note ? <Text size="caption">{note}</Text> : null}
    </Card>
  );
}
