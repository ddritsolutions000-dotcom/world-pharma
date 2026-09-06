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
import {
  fetchLabStaffBooking,
  fetchLabStaffBookings,
  type LabStaffBooking,
} from './lab-api';
import { labBookingStatusFilter, type LabBookingFilter } from './lab-booking-actions';
import { labCollectionModeLabel, labOpsStatusLabel } from './lab-ops-labels';

const FILTER_OPTIONS: Array<{ value: LabBookingFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'cancelled', label: 'Cancelled / failed' },
];

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
  const [filter, setFilter] = useState<LabBookingFilter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<LabStaffBooking | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

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

  const filtered = useMemo(
    () => rows.filter((row) => labBookingStatusFilter(row.status, filter)),
    [filter, rows],
  );

  const openDetail = (bookingId: string) => {
    setSelectedId(bookingId);
    setDetailLoading(true);
    void fetchLabStaffBooking(token, organizationId, bookingId)
      .then(setDetail)
      .catch(onError)
      .finally(() => setDetailLoading(false));
  };

  return (
    <Card>
      <Heading level={2}>Bookings</Heading>
      <Text tone="secondary">
        Customer sandbox bookings for this laboratory. Collection queue is on the Collections tab after payment confirms.
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
              onChange={(e) => setFilter(e.target.value as LabBookingFilter)}
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
      {loading ? <LoadingState label="Loading lab bookings…" /> : null}
      {!loading && !filtered.length ? (
        <EmptyState
          title={rows.length ? 'No bookings match filter' : 'No bookings yet'}
          description={
            rows.length
              ? 'Try another filter or refresh after a customer books a test.'
              : 'Customer sandbox bookings will appear here when created and paid.'
          }
        />
      ) : null}
      {filtered.length ? (
        <table className="wp-data-table">
          <thead>
            <tr>
              <th>Test</th>
              <th>Status</th>
              <th>Collection</th>
              <th>When</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr key={row.id} className={selectedId === row.id ? 'is-selected' : undefined}>
                <td>{row.lines[0]?.title ?? 'Booking'}</td>
                <td>
                  <span className="wp-status">{labOpsStatusLabel(row.status)}</span>
                </td>
                <td>{labCollectionModeLabel(row.collection_mode)}</td>
                <td>
                  {row.slot_starts_at
                    ? new Date(row.slot_starts_at).toLocaleString()
                    : row.created_at
                      ? new Date(row.created_at).toLocaleString()
                      : '—'}
                </td>
                <td>
                  <Button size="sm" variant="secondary" onClick={() => openDetail(row.id)}>
                    View
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {selectedId ? (
        <Card>
          <Heading level={3}>Booking detail</Heading>
          <Button
            size="sm"
            variant="tertiary"
            onClick={() => {
              setSelectedId(null);
              setDetail(null);
            }}
          >
            Close
          </Button>
          {detailLoading ? <LoadingState label="Loading booking detail…" /> : null}
          {detail && !detailLoading ? (
            <>
              <Text>
                {detail.lines.map((line) => line.title).join(', ')} · {labOpsStatusLabel(detail.status)}
              </Text>
              <Text size="caption">ID {detail.id}</Text>
              <Text size="caption">
                {labCollectionModeLabel(detail.collection_mode)} · {detail.currency} {detail.total_minor}
              </Text>
              {detail.lab_location ? (
                <Text size="caption">
                  Center: {detail.lab_location.name}
                  {detail.lab_location.city ? ` · ${detail.lab_location.city}` : ''}
                </Text>
              ) : null}
              {detail.slot_starts_at ? (
                <Text size="caption">
                  Slot {new Date(detail.slot_starts_at).toLocaleString()}
                  {detail.timezone ? ` (${detail.timezone})` : ''}
                </Text>
              ) : null}
              {detail.note ? <Text size="caption">{detail.note}</Text> : null}
            </>
          ) : null}
        </Card>
      ) : null}
      {note ? <Text size="caption">{note}</Text> : null}
    </Card>
  );
}
