'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from '@world-pharma/shell-web';
import {
  Button,
  Card,
  EmptyState,
  Heading,
  LoadingState,
  Text,
} from '@world-pharma/ui-kit/web';
import {
  approveDoctorRefillRequest,
  fetchDoctorRefillRequests,
  newIdempotencyKey,
  rejectDoctorRefillRequest,
  type DoctorRefillRequest,
} from './doctor-api';
import { DoctorLoadFailure, mapDoctorApiFailure, type DoctorLoadError } from './doctor-load-state';

export function DoctorRefillRequestsPanel() {
  const { getAccessToken, session, expire } = useSession();
  const [rows, setRows] = useState<DoctorRefillRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<DoctorLoadError | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const onUnauthorized = useCallback(() => expire(), [expire]);

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const result = await fetchDoctorRefillRequests({ token, onUnauthorized });
    if (!result.ok) {
      setError(mapDoctorApiFailure(result.kind));
      setRows([]);
    } else {
      setRows(result.data.requests ?? []);
    }
    setLoading(false);
  }, [getAccessToken, onUnauthorized]);

  useEffect(() => {
    if (session.status === 'authenticated') {
      void load();
    }
  }, [session.status, load]);

  async function handleApprove(id: string) {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setBusyId(id);
    setMessage(null);
    const result = await approveDoctorRefillRequest({
      token,
      onUnauthorized,
      id,
      idempotencyKey: newIdempotencyKey('refill-approve'),
    });
    setBusyId(null);
    if (!result.ok) {
      setMessage(result.error);
      return;
    }
    setMessage(`Refill ${id.slice(0, 8)} approved — queued for pharmacy dispense.`);
    void load();
  }

  async function handleReject(id: string) {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setBusyId(id);
    setMessage(null);
    const result = await rejectDoctorRefillRequest({
      token,
      onUnauthorized,
      id,
      idempotencyKey: newIdempotencyKey('refill-reject'),
    });
    setBusyId(null);
    if (!result.ok) {
      setMessage(result.error);
      return;
    }
    setMessage(`Refill ${id.slice(0, 8)} rejected.`);
    void load();
  }

  if (loading) {
    return <LoadingState label="Loading refill requests" />;
  }
  if (error) {
    return <DoctorLoadFailure error={error} onRetry={() => void load()} />;
  }

  return (
    <>
      <Text tone="secondary">
        R5-E: explicit doctor re-authorization required. Approve or reject each patient refill request — nothing is
        auto-approved.
      </Text>
      {message ? <Text>{message}</Text> : null}
      <Button size="sm" variant="secondary" onClick={() => void load()}>
        Refresh
      </Button>
      {rows.length === 0 ? (
        <EmptyState title="No pending refill requests" description="Patient refill requests awaiting re-auth appear here." />
      ) : (
        rows.map((row) => (
          <Card key={row.id}>
            <Heading level={3}>{`Refill ${row.id.slice(0, 8)}`}</Heading>
            <Text size="caption">{`Status: ${row.status}`}</Text>
            <Text size="caption">{`Prescription: ${row.prescription_id.slice(0, 8)} · v ${row.prescription_version_id.slice(0, 8)}`}</Text>
            <Text size="caption">{`Requested: ${row.created_at}`}</Text>
            {row.next ? <Text size="caption">{row.next}</Text> : null}
            {busyId === row.id ? <LoadingState label="Saving decision" /> : null}
            {busyId !== row.id && row.status === 'PENDING_REAUTH' ? (
              <div className="wp-stack" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <Button size="sm" onClick={() => void handleApprove(row.id)}>
                  Approve
                </Button>
                <Button size="sm" variant="secondary" onClick={() => void handleReject(row.id)}>
                  Reject
                </Button>
              </div>
            ) : null}
          </Card>
        ))
      )}
    </>
  );
}
