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
      {rows.map((row) => (
        <Card key={row.id}>
          <Text>
            {row.test_title} · {row.status}
          </Text>
          <Text size="caption">
            {row.collection_mode}
            {row.slot_starts_at ? ` · ${new Date(row.slot_starts_at).toLocaleString()}` : ''}
            {row.assignee_person_id ? ` · assignee ${row.assignee_person_id.slice(0, 8)}…` : ' · unassigned'}
          </Text>
          <Button size="sm" variant="secondary" onClick={() => setSelectedId(row.id)}>
            Custody history
          </Button>
        </Card>
      ))}
      {selected ? (
        <Card>
          <Heading level={3}>Custody timeline</Heading>
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
                    {event.created_at} · {event.from_status ?? '—'} → {event.to_status} · {event.action_code}
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
