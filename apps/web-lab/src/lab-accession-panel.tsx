'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, Card, EmptyState, Heading, LoadingState, Text } from '@world-pharma/ui-kit/web';
import { accessionLabSample, fetchLabAccessions, fetchLabCollections, type LabAccessionRow } from './lab-api';

export function LabAccessionPanel({
  organizationId,
  token,
  onError,
}: {
  organizationId: string;
  token: string;
  onError: (err: unknown) => void;
}) {
  const [rows, setRows] = useState<LabAccessionRow[]>([]);
  const [pending, setPending] = useState<Array<{ id: string; test_title: string; status: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [accessions, collections] = await Promise.all([
        fetchLabAccessions(token, organizationId),
        fetchLabCollections(token, organizationId),
      ]);
      setRows(accessions.data);
      setPending(
        collections.data
          .filter((row) => row.status === 'LAB_RECEIVED')
          .map((row) => ({ id: row.id, test_title: row.test_title, status: row.status })),
      );
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
      <Heading level={2}>Accession</Heading>
      <Text tone="secondary">Receive samples into the lab with server-generated accession numbers.</Text>
      <Button size="sm" variant="secondary" onClick={() => void load()}>
        Refresh accessions
      </Button>
      <LabAccessionQueuePanel
        organizationId={organizationId}
        token={token}
        onError={onError}
        pendingSamples={pending}
        onDone={() => void load()}
      />
      {loading ? <LoadingState label="Loading accession queue…" /> : null}
      {!loading && !rows.length ? (
        <EmptyState
          title="No accessions yet"
          description="Accession samples after lab receipt. Use transport tab to receive on-site handovers."
        />
      ) : null}
      {rows.map((row) => (
        <Card key={row.id}>
          <Text>
            {row.accession_number} · {row.test_title}
          </Text>
          <Text size="caption">
            Sample {row.sample_status} · processing {row.processing_status ?? '—'}
          </Text>
          <Button size="sm" variant="secondary" onClick={() => setSelectedId(row.id)}>
            Detail
          </Button>
        </Card>
      ))}
      {selected ? (
        <Card>
          <Heading level={3}>Accession detail</Heading>
          <Button size="sm" variant="tertiary" onClick={() => setSelectedId(null)}>
            Close
          </Button>
          <Text>Number: {selected.accession_number}</Text>
          <Text size="caption">Barcode: {selected.container_barcode ?? '—'}</Text>
          <ul>
            {selected.custody_timeline.map((event) => (
              <li key={event.id}>
                <Text size="caption">
                  {event.created_at} · {event.to_status} · {event.action_code}
                </Text>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </Card>
  );
}

export function LabAccessionQueuePanel({
  organizationId,
  token,
  onError,
  pendingSamples,
  onDone,
}: {
  organizationId: string;
  token: string;
  onError: (err: unknown) => void;
  pendingSamples: Array<{ id: string; test_title: string; status: string }>;
  onDone?: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);

  return (
    <Card>
      <Heading level={3}>Pending accession</Heading>
      {!pendingSamples.length ? (
        <EmptyState title="No samples awaiting accession" description="Receive samples at lab first." />
      ) : null}
      {pendingSamples.map((sample) => (
        <Card key={sample.id}>
          <Text>
            {sample.test_title} · {sample.status}
          </Text>
          <Button
            size="sm"
            disabled={busy === sample.id}
            onClick={() => {
              setBusy(sample.id);
              void accessionLabSample(token, organizationId, sample.id, `acc-${sample.id}`)
                .then(() => {
                  setBusy(null);
                  onDone?.();
                })
                .catch((err) => {
                  setBusy(null);
                  onError(err);
                });
            }}
          >
            {busy === sample.id ? 'Accessioning…' : 'Accession sample'}
          </Button>
        </Card>
      ))}
    </Card>
  );
}
