'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, Card, EmptyState, Heading, LoadingState, Text } from '@world-pharma/ui-kit/web';
import { fetchImagingInterpretations } from './radiology-api';

export function ImagingInterpretationsPanel({
  organizationId,
  token,
  onError,
}: {
  organizationId: string;
  token: string;
  onError: (err: unknown) => void;
}) {
  const [rows, setRows] = useState<
    Array<{
      id: string;
      accession_number: string;
      interpretation_status: string | null;
      version_number: number | null;
      assigned_radiologist_id: string | null;
    }>
  >([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const body = await fetchImagingInterpretations(token, organizationId);
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
      <Heading level={2}>Interpretation queue (ops)</Heading>
      <Text tone="secondary">
        Operational metadata for radiologist worklist routing. Radiologists use the radiologist portal (port 3007).
        Customer report publication follows R8-E after verify/sign-off — still no image viewer or DICOM download.
      </Text>
      <Button size="sm" variant="secondary" disabled={loading} onClick={() => void load()}>
        Refresh
      </Button>
      {loading ? <LoadingState label="Loading interpretation ops…" /> : null}
      {!loading && !rows.length ? (
        <EmptyState title="No interpretation cases" description="Cases appear after acquisition is complete." />
      ) : null}
      {rows.map((row) => (
        <Card key={row.id}>
          <Text>
            {row.accession_number} · {row.interpretation_status ?? 'pending'} · v{row.version_number ?? 0}
          </Text>
          <Text size="caption">
            Assigned radiologist: {row.assigned_radiologist_id ?? 'unassigned'}
          </Text>
        </Card>
      ))}
    </Card>
  );
}
