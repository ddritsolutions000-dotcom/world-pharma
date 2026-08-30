'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, Card, EmptyState, Heading, LoadingState, Text } from '@world-pharma/ui-kit/web';
import {
  completeLabProcessing,
  failLabProcessing,
  fetchLabProcessing,
  startLabProcessing,
  type LabProcessingRow,
} from './lab-api';

export function LabProcessingPanel({
  organizationId,
  token,
  onError,
}: {
  organizationId: string;
  token: string;
  onError: (err: unknown) => void;
}) {
  const [rows, setRows] = useState<LabProcessingRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const body = await fetchLabProcessing(token, organizationId);
      setRows(body.data);
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
  const run = (fn: () => Promise<unknown>) => {
    void fn()
      .then(() => load())
      .catch(onError);
  };

  return (
    <Card>
      <Heading level={2}>Processing</Heading>
      <Text tone="secondary">Bench processing lifecycle. No result values or pathology in R7-D.</Text>
      <Button size="sm" variant="secondary" onClick={() => void load()}>
        Refresh processing
      </Button>
      {loading ? <LoadingState label="Loading processing queue…" /> : null}
      {!loading && !rows.length ? (
        <EmptyState title="No processing records" description="Accession samples to enqueue bench work." />
      ) : null}
      {rows.map((row) => (
        <Card key={row.id}>
          <Text>
            {row.accession_number} · {row.test_title} · {row.status}
          </Text>
          <Button size="sm" variant="secondary" onClick={() => setSelectedId(row.id)}>
            Open
          </Button>
        </Card>
      ))}
      {selected ? (
        <Card>
          <Heading level={3}>Processing detail</Heading>
          <Button size="sm" variant="tertiary" onClick={() => setSelectedId(null)}>
            Close
          </Button>
          <Text>Status: {selected.status}</Text>
          <Text size="caption">Barcode: {selected.container_barcode ?? '—'}</Text>
          {selected.status === 'QUEUED' || selected.status === 'ON_HOLD' ? (
            <Button size="sm" onClick={() => run(() => startLabProcessing(token, organizationId, selected.id))}>
              Start processing
            </Button>
          ) : null}
          {selected.status === 'IN_PROGRESS' ? (
            <>
              <Button
                size="sm"
                onClick={() => run(() => completeLabProcessing(token, organizationId, selected.id))}
              >
                Complete processing
              </Button>
              <Button
                size="sm"
                variant="danger"
                onClick={() => run(() => failLabProcessing(token, organizationId, selected.id))}
              >
                Mark failed
              </Button>
            </>
          ) : null}
        </Card>
      ) : null}
    </Card>
  );
}
