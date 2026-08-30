'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, Card, EmptyState, Heading, LoadingState, Text } from '@world-pharma/ui-kit/web';
import { fetchLabTransport, receiveLabSample, type LabTransportRow } from './lab-api';

export function LabTransportPanel({
  organizationId,
  token,
  onError,
}: {
  organizationId: string;
  token: string;
  onError: (err: unknown) => void;
}) {
  const [rows, setRows] = useState<LabTransportRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const body = await fetchLabTransport(token, organizationId);
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

  return (
    <Card>
      <Heading level={2}>Transport</Heading>
      <Text tone="secondary">Sample transport jobs and custody status. Mock carrier only.</Text>
      <Button size="sm" variant="secondary" onClick={() => void load()}>
        Refresh transport
      </Button>
      {loading ? <LoadingState label="Loading transport queue…" /> : null}
      {!loading && !rows.length ? (
        <EmptyState title="No transport jobs" description="Transport jobs appear after sample handover." />
      ) : null}
      {rows.map((row) => (
        <Card key={row.id}>
          <Text>
            {row.test_title} · {row.coc_status ?? row.status}
          </Text>
          <Text size="caption">Job {row.status} · barcode {row.container_barcode ?? '—'}</Text>
          {row.lab_sample_id && row.coc_status === 'HANDED_OVER' ? (
            <Button
              size="sm"
              onClick={() =>
                void receiveLabSample(token, organizationId, row.lab_sample_id!, `recv-${row.id}`).then(load)
              }
            >
              Receive at lab (on-site)
            </Button>
          ) : null}
        </Card>
      ))}
    </Card>
  );
}
