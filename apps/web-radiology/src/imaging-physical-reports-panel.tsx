'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Card,
  EmptyState,
  FormField,
  Heading,
  Input,
  LoadingState,
  Text,
} from '@world-pharma/ui-kit/web';
import {
  acceptImagingPhysicalReport,
  dispatchImagingPhysicalReport,
  fetchImagingPhysicalReports,
  packImagingPhysicalReport,
  prepareImagingPhysicalReport,
  type ImagingPhysicalReportRow,
} from './radiology-api';

export function ImagingPhysicalReportsPanel({
  organizationId,
  token,
  onError,
}: {
  organizationId: string;
  token: string;
  onError: (err: unknown) => void;
}) {
  const [rows, setRows] = useState<ImagingPhysicalReportRow[]>([]);
  const [selected, setSelected] = useState<ImagingPhysicalReportRow | null>(null);
  const [sealedId, setSealedId] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const body = await fetchImagingPhysicalReports(token, organizationId);
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

  async function run(action: () => Promise<ImagingPhysicalReportRow>) {
    setBusy(true);
    try {
      const updated = await action();
      setSelected(updated);
      await load();
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <Heading level={2}>Physical report delivery</Heading>
      <Text tone="secondary">
        Operational queue for sealed imaging report parcels. No report body or findings are shown here.
      </Text>
      <Button size="sm" variant="secondary" onClick={() => void load()}>
        Refresh queue
      </Button>
      {loading ? <LoadingState label="Loading physical report requests…" /> : null}
      {!loading && !rows.length ? (
        <EmptyState title="No physical report requests" description="Customer requests appear after digital report publication." />
      ) : null}
      {rows.map((row) => (
        <Card key={row.id}>
          <Text>
            Request {row.id.slice(0, 8)}… · {row.status}
          </Text>
          <Text size="caption">
            Booking {row.imaging_booking_id.slice(0, 8)}… · v{row.report_version_number}
          </Text>
          {row.logistics_job_status ? <Text size="caption">Delivery job: {row.logistics_job_status}</Text> : null}
          <Button size="sm" variant="tertiary" onClick={() => setSelected(row)}>
            Manage
          </Button>
        </Card>
      ))}
      {selected ? (
        <Card>
          <Heading level={3}>Request actions</Heading>
          <Text size="caption">Status: {selected.status}</Text>
          {selected.status === 'REQUESTED' ? (
            <Button
              size="sm"
              disabled={busy}
              onClick={() => void run(() => acceptImagingPhysicalReport(token, selected.id, organizationId))}
            >
              Accept
            </Button>
          ) : null}
          {selected.status === 'ACCEPTED' ? (
            <Button
              size="sm"
              disabled={busy}
              onClick={() => void run(() => prepareImagingPhysicalReport(token, selected.id, organizationId))}
            >
              Prepare
            </Button>
          ) : null}
          {selected.status === 'PREPARING' ? (
            <>
              <FormField label="Sealed package ID">
                {({ id }) => <Input id={id} value={sealedId} onChange={(e) => setSealedId(e.target.value)} />}
              </FormField>
              <Button
                size="sm"
                disabled={busy || !sealedId.trim()}
                onClick={() =>
                  void run(() => packImagingPhysicalReport(token, selected.id, organizationId, sealedId.trim()))
                }
              >
                Pack
              </Button>
            </>
          ) : null}
          {selected.status === 'PACKED' ? (
            <Button
              size="sm"
              disabled={busy}
              onClick={() =>
                void run(() =>
                  dispatchImagingPhysicalReport(token, selected.id, organizationId, `dispatch-${selected.id}`),
                )
              }
            >
              Dispatch to rider
            </Button>
          ) : null}
        </Card>
      ) : null}
    </Card>
  );
}
