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
import { fetchLabCollections, type LabCollectionRow } from './lab-api';
import { labCollectionModeLabel, labOpsStatusLabel } from './lab-ops-labels';

export function LabCollectionsPanel({
  organizationId,
  token,
  onError,
}: {
  organizationId: string;
  token: string;
  onError: (err: unknown) => void;
}) {
  const [rows, setRows] = useState<LabCollectionRow[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const body = await fetchLabCollections(token, organizationId);
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

  const selected = rows.find((row) => row.id === selectedId) ?? null;

  return (
    <Card>
      <Heading level={2}>Collections</Heading>
      <Text tone="secondary">
        Sample collection queue, assignment state, custody history, and exceptions.
      </Text>
      <Button size="sm" variant="secondary" onClick={() => void load()}>
        Refresh collections
      </Button>
      {loading ? <LoadingState label="Loading collection queue…" /> : null}
      {!loading && !rows.length ? (
        <EmptyState
          title="No samples in queue"
          description="Samples appear after customer bookings are confirmed and collection is enqueued."
        />
      ) : null}
      {rows.length ? (
        <table className="wp-data-table">
          <thead>
            <tr>
              <th>Test</th>
              <th>Status</th>
              <th>Mode</th>
              <th>Slot</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className={selectedId === row.id ? 'is-selected' : undefined}>
                <td>{row.test_title}</td>
                <td>
                  <span className="wp-status">{labOpsStatusLabel(row.status)}</span>
                </td>
                <td>{labCollectionModeLabel(row.collection_mode)}</td>
                <td>{row.slot_starts_at ? new Date(row.slot_starts_at).toLocaleString() : '—'}</td>
                <td>
                  <Button size="sm" variant="secondary" onClick={() => setSelectedId(row.id)}>
                    Custody
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {selected ? (
        <Card>
          <Heading level={3}>Custody timeline · {selected.test_title}</Heading>
          <Text size="caption">
            Assignee {selected.assignee_person_id ? `${selected.assignee_person_id.slice(0, 8)}…` : 'unassigned'}
          </Text>
          <Button size="sm" variant="tertiary" onClick={() => setSelectedId(null)}>
            Close
          </Button>
          {!selected.custody_timeline.length ? (
            <EmptyState title="No custody events" description="CoC events appear as collection progresses." />
          ) : (
            <ul>
              {selected.custody_timeline.map((event) => (
                <li key={event.id}>
                  <Text size="caption">
                    {event.created_at} · {labOpsStatusLabel(event.from_status)} → {labOpsStatusLabel(event.to_status)} ·{' '}
                    {event.action_code}
                  </Text>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}
      {note ? <Text size="caption">{note}</Text> : null}
    </Card>
  );
}
