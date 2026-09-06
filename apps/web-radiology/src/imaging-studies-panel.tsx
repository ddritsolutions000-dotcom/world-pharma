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
import {
  completeImagingAcquisition,
  failImagingAcquisition,
  fetchImagingStudies,
  startImagingAcquisition,
  type ImagingStudyRow,
} from './radiology-api';

function newIdempotencyKey(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function ImagingStudiesPanel({
  organizationId,
  token,
  onError,
}: {
  organizationId: string;
  token: string;
  onError: (err: unknown) => void;
}) {
  const [rows, setRows] = useState<ImagingStudyRow[]>([]);
  const [selected, setSelected] = useState<ImagingStudyRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const body = await fetchImagingStudies(token, organizationId);
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

  async function runAction(action: () => Promise<ImagingStudyRow>) {
    setBusy(true);
    setMessage(null);
    try {
      const study = await action();
      setSelected(study);
      setMessage(`Study ${study.accession_number} is now ${study.status}`);
      await load();
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <Heading level={2}>Acquisition worklist</Heading>
      <Text tone="secondary">
        Technician sandbox acquisition with DICOM study UIDs and private object storage — not production PACS or
        clinical viewer.
      </Text>
      <Button size="sm" variant="secondary" disabled={loading || busy} onClick={() => void load()}>
        Refresh studies
      </Button>
      {loading ? <LoadingState label="Loading imaging studies…" /> : null}
      {!loading && !rows.length ? (
        <EmptyState title="No imaging studies" description="Check in confirmed bookings to create studies." />
      ) : null}
      {rows.map((row) => (
        <Card key={row.id}>
          <Text>
            {row.study_title} · {row.status} · {row.accession_number}
          </Text>
          <Text size="caption">Booking {row.imaging_booking_id}</Text>
          <Button size="sm" variant="secondary" onClick={() => setSelected(row)}>
            Open
          </Button>
        </Card>
      ))}
      {selected ? (
        <Card>
          <Heading level={3}>Study {selected.accession_number}</Heading>
          <Text>Status: {selected.status}</Text>
          {selected.study_instance_uid ? (
            <Text size="caption">StudyInstanceUID: {selected.study_instance_uid}</Text>
          ) : null}
          {selected.dicom?.series?.length ? (
            <Text size="caption">
              {selected.dicom.series.length} series ·{' '}
              {selected.dicom.series.reduce((n, s) => n + s.instances.length, 0)} instance(s) in private storage
            </Text>
          ) : null}
          {selected.acquisition ? (
            <Text size="caption">
              Acquisition {selected.acquisition.status}
              {selected.acquisition.sandbox_object_ref
                ? ` · ref ${selected.acquisition.sandbox_object_ref}`
                : ''}
            </Text>
          ) : null}
          {message ? <Text>{message}</Text> : null}
          {busy ? <LoadingState label="Processing acquisition action…" /> : null}
          {selected.status === 'CHECKED_IN' || selected.status === 'ACQUISITION_FAILED' ? (
            <Button
              disabled={busy}
              onClick={() =>
                void runAction(() =>
                  startImagingAcquisition(token, organizationId, selected.id, newIdempotencyKey('rad-start')),
                )
              }
            >
              Start acquisition
            </Button>
          ) : null}
          {selected.status === 'ACQUISITION_IN_PROGRESS' ? (
            <>
              <Button
                disabled={busy}
                onClick={() =>
                  void runAction(() =>
                    completeImagingAcquisition(token, selected.id, {
                      imaging_org_id: organizationId,
                      equipment_code: 'SANDBOX_CT',
                      modality_code: 'CT',
                    }),
                  )
                }
              >
                Mark acquired (sandbox)
              </Button>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() =>
                  void runAction(() =>
                    failImagingAcquisition(token, selected.id, {
                      imaging_org_id: organizationId,
                      failure_code: 'patient_motion',
                    }),
                  )
                }
              >
                Record acquisition exception
              </Button>
            </>
          ) : null}
        </Card>
      ) : null}
    </Card>
  );
}
