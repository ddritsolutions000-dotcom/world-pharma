'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiCall } from '@world-pharma/shell-core';
import { useSession } from '@world-pharma/shell-web';
import {
  Button,
  EmptyState,
  LoadingState,
  NetworkErrorState,
  PermissionDeniedState,
  Text,
} from '@world-pharma/ui-kit/web';
import { DoctorEncounterPanel, type EncounterAppointment } from './encounter-panel';

export function DoctorAppointmentsPanel() {
  const { getAccessToken, session, expire } = useSession();
  const [rows, setRows] = useState<EncounterAppointment[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<'network' | 'forbidden' | 'error' | null>(null);

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
      onUnauthorized: () => expire(),
    });
    if (!result.ok) {
      setError(result.kind === 'forbidden' ? 'forbidden' : result.kind === 'network' ? 'network' : 'error');
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

  if (loading) {
    return <LoadingState label="Loading appointments" />;
  }
  if (error === 'forbidden') {
    return <PermissionDeniedState />;
  }
  if (error === 'network') {
    return <NetworkErrorState action={{ label: 'Retry', onClick: () => void load() }} />;
  }
  if (error === 'error') {
    return <NetworkErrorState action={{ label: 'Retry', onClick: () => void load() }} />;
  }

  const selected = rows.find((row) => row.id === selectedId) ?? null;

  if (rows.length === 0) {
    return (
      <EmptyState title="No appointments" description="Upcoming visits will appear here." />
    );
  }

  return (
    <>
      {rows.map((row) => (
        <Button
          key={row.id}
          variant={selectedId === row.id ? 'primary' : 'secondary'}
          size="sm"
          onClick={() => setSelectedId(row.id)}
        >
          {`${row.status} · ${row.starts_at ?? row.id.slice(0, 8)}`}
        </Button>
      ))}
      {selected ? (
        <DoctorEncounterPanel appointment={selected} onUpdated={() => void load()} />
      ) : (
        <Text tone="secondary">Select an appointment to manage the encounter.</Text>
      )}
    </>
  );
}
