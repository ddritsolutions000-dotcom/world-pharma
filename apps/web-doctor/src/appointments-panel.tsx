'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { apiCall } from '@world-pharma/shell-core';
import { useSession } from '@world-pharma/shell-web';
import {
  Button,
  EmptyState,
  LoadingState,
  Text,
} from '@world-pharma/ui-kit/web';
import { DoctorEncounterPanel, type EncounterAppointment } from './encounter-panel';
import { appointmentStatusLabel } from './appointment-status-labels';
import { DoctorLoadFailure, mapDoctorApiFailure, type DoctorLoadError } from './doctor-load-state';

export function DoctorAppointmentsPanel() {
  const searchParams = useSearchParams();
  const focusId = searchParams.get('id');
  const { getAccessToken, session, expire } = useSession();
  const [rows, setRows] = useState<EncounterAppointment[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(focusId);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<DoctorLoadError | null>(null);

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const result = await apiCall<{ appointments?: EncounterAppointment[] }>('api/v1/doctor/appointments', {
      token,
      baseUrl: typeof window !== 'undefined' ? window.location.origin : undefined,
      onUnauthorized: () => expire(),
    });
    if (!result.ok) {
      setError(mapDoctorApiFailure(result.kind));
      setRows([]);
    } else {
      setRows(result.data.appointments ?? []);
    }
    setLoading(false);
  }, [getAccessToken, expire]);

  useEffect(() => {
    if (session.status === 'authenticated') {
      void load();
    }
  }, [session.status, load]);

  useEffect(() => {
    if (focusId) {
      setSelectedId(focusId);
    }
  }, [focusId]);

  if (loading) {
    return <LoadingState label="Loading appointments" />;
  }
  const failure = (
    <DoctorLoadFailure
      error={error}
      onRetry={() => void load()}
      forbiddenTitle="Doctor appointments unavailable"
      forbiddenDescription="This account is not authorized for the doctor appointments queue. Use a verified doctor partner login."
    />
  );
  if (error) {
    return failure;
  }

  const selected = rows.find((row) => row.id === selectedId) ?? null;

  if (rows.length === 0) {
    return (
      <EmptyState
        title="No appointments yet"
        description="Sandbox appointments appear here when patients book you. Open Availability to publish slots. Live video consults remain EXTERNAL_GATED until a production provider is configured."
        action={{ label: 'Refresh', onClick: () => void load() }}
      />
    );
  }

  return (
    <div className="wp-order-layout">
      <table className="wp-data-table">
        <thead>
          <tr>
            <th>When</th>
            <th>Type</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className={selectedId === row.id ? 'is-selected' : undefined}>
              <td>{row.starts_at ?? row.id.slice(0, 8)}</td>
              <td>{row.type ?? 'Consult'}</td>
              <td>
                <span className="wp-status">{appointmentStatusLabel(row.status)}</span>
              </td>
              <td>
                <Button
                  variant={selectedId === row.id ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => setSelectedId(row.id)}
                >
                  Open
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {selected ? (
        <DoctorEncounterPanel appointment={selected} onUpdated={() => void load()} />
      ) : (
        <Text tone="secondary">Select an appointment to manage the encounter.</Text>
      )}
    </div>
  );
}
