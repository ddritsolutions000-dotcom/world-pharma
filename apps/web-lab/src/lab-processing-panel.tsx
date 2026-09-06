'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, Card, EmptyState, Heading, LoadingState, Text } from '@world-pharma/ui-kit/web';
import { completeLabProcessing, failLabProcessing, fetchLabProcessing, startLabProcessing, type LabProcessingRow } from './lab-api';
import { labOpsStatusLabel } from './lab-ops-labels';

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
  const [busy, setBusy] = useState<string | null>(null);

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
  const run = (actionKey: string, fn: () => Promise<unknown>) => {
    setBusy(actionKey);
    void fn()
      .then(() => load())
      .catch(onError)
      .finally(() => setBusy(null));
  };

  return (
    <Card>
      <Heading level={2}>Processing</Heading>
      <Text tone="secondary">
        Bench processing after accession. Complete processing to enqueue pathology result entry (sandbox data only).
      </Text>
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
            {row.accession_number} · {row.test_title} · {labOpsStatusLabel(row.status)}
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
          <Text>Status: {labOpsStatusLabel(selected.status)}</Text>
          <Text size="caption">Barcode: {selected.container_barcode ?? '—'}</Text>
          {selected.status === 'QUEUED' || selected.status === 'ON_HOLD' ? (
            <Button
              size="sm"
              disabled={busy !== null}
              onClick={() => run(`start-${selected.id}`, () => startLabProcessing(token, organizationId, selected.id))}
            >
              {busy === `start-${selected.id}` ? 'Starting…' : 'Start processing'}
            </Button>
          ) : null}
          {selected.status === 'IN_PROGRESS' ? (
            <>
              <Button
                size="sm"
                disabled={busy !== null}
                onClick={() =>
                  run(`complete-${selected.id}`, () => completeLabProcessing(token, organizationId, selected.id))
                }
              >
                {busy === `complete-${selected.id}` ? 'Completing…' : 'Complete processing'}
              </Button>
              <Button
                size="sm"
                variant="danger"
                disabled={busy !== null}
                onClick={() =>
                  run(`fail-${selected.id}`, () => failLabProcessing(token, organizationId, selected.id))
                }
              >
                {busy === `fail-${selected.id}` ? 'Updating…' : 'Mark failed'}
              </Button>
            </>
          ) : null}
        </Card>
      ) : null}
    </Card>
  );
}
