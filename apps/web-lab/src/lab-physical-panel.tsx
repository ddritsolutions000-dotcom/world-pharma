'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, Card, EmptyState, FormField, Heading, Input, LoadingState, Text } from '@world-pharma/ui-kit/web';
import {
  acceptLabPhysicalReport,
  dispatchLabPhysicalReport,
  fetchLabPhysicalReports,
  packLabPhysicalReport,
  prepareLabPhysicalReport,
  type LabPhysicalReportRow,
} from './lab-api';

export function LabPhysicalPanel({
  organizationId,
  token,
  onError,
}: {
  organizationId: string;
  token: string;
  onError: (err: unknown) => void;
}) {
  const [rows, setRows] = useState<LabPhysicalReportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [packageId, setPackageId] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const body = await fetchLabPhysicalReports(token, organizationId);
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

  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      await load();
    } catch (err) {
      onError(err);
    }
  };

  return (
    <Card>
      <Heading level={2}>Physical reports</Heading>
      <Text tone="secondary">Prepare, pack, and dispatch hard-copy report parcels. No clinical edits.</Text>
      <Button size="sm" variant="secondary" onClick={() => void load()}>
        Refresh queue
      </Button>
      {loading ? <LoadingState label="Loading physical report queue…" /> : null}
      {!loading && !rows.length ? (
        <EmptyState title="No physical report requests" description="Customer requests appear after report publish." />
      ) : null}
      {rows.map((row) => (
        <Card key={row.id}>
          <Text>
            Booking {row.lab_booking_id.slice(0, 8)} · v{row.report_version_number} · {row.status}
          </Text>
          <Text size="caption">
            Package {row.sealed_package_id ?? '—'} · job {row.logistics_job_status ?? '—'}
          </Text>
          {row.status === 'REQUESTED' ? (
            <Button size="sm" onClick={() => void run(() => acceptLabPhysicalReport(token, organizationId, row.id))}>
              Accept
            </Button>
          ) : null}
          {row.status === 'ACCEPTED' ? (
            <Button size="sm" onClick={() => void run(() => prepareLabPhysicalReport(token, organizationId, row.id))}>
              Start preparing
            </Button>
          ) : null}
          {row.status === 'PREPARING' ? (
            <>
              <FormField label="Sealed package ID">
                {({ id }) => (
                  <Input
                    id={id}
                    value={packageId[row.id] ?? ''}
                    onChange={(e) => setPackageId((prev) => ({ ...prev, [row.id]: e.target.value }))}
                    placeholder="PKG-…"
                  />
                )}
              </FormField>
              <Button
                size="sm"
                onClick={() =>
                  void run(() =>
                    packLabPhysicalReport(token, organizationId, row.id, packageId[row.id] ?? ''),
                  )
                }
              >
                Mark packed
              </Button>
            </>
          ) : null}
          {row.status === 'PACKED' ? (
            <Button
              size="sm"
              onClick={() =>
                void run(() =>
                  dispatchLabPhysicalReport(token, organizationId, row.id, `dispatch-${row.id}`),
                )
              }
            >
              Dispatch delivery
            </Button>
          ) : null}
          {row.failure_reason ? <Text size="caption">Failure: {row.failure_reason}</Text> : null}
        </Card>
      ))}
    </Card>
  );
}
