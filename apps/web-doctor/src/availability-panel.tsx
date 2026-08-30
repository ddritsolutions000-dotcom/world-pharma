'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiCall } from '@world-pharma/shell-core';
import { useSession } from '@world-pharma/shell-web';
import {
  Button,
  Card,
  LoadingState,
  NetworkErrorState,
  PermissionDeniedState,
  Text,
} from '@world-pharma/ui-kit/web';

type AvailabilityWindow = {
  id: string;
  weekday: number;
  start_local: string;
  end_local: string;
  slot_minutes?: number;
  buffer_minutes?: number;
};

type AvailabilityData = {
  timezone?: string;
  windows?: AvailabilityWindow[];
  exceptions?: Array<{ id: string; starts_at: string; ends_at: string }>;
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function DoctorAvailabilityPanel() {
  const { getAccessToken, session, expire } = useSession();
  const [data, setData] = useState<AvailabilityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<'network' | 'forbidden' | 'error' | null>(null);

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const result = await apiCall<AvailabilityData>('api/v1/doctor/me/availability/windows', {
      token,
      onUnauthorized: () => expire(),
    });
    if (!result.ok) {
      setError(result.kind === 'forbidden' ? 'forbidden' : result.kind === 'network' ? 'network' : 'error');
      setData(null);
    } else {
      setData(result.data);
    }
    setLoading(false);
  }, [getAccessToken, expire]);

  useEffect(() => {
    if (session.status === 'authenticated') {
      void load();
    }
  }, [session.status, load]);

  async function saveWeekdays() {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setSaving(true);
    setError(null);
    const result = await apiCall('api/v1/doctor/me/availability/windows', {
      method: 'PUT',
      token,
      body: {
        timezone: 'UTC',
        windows: [1, 2, 3, 4, 5].map((weekday) => ({
          weekday,
          start_local: '09:00',
          end_local: '17:00',
          slot_minutes: 30,
          buffer_minutes: 0,
        })),
      },
      onUnauthorized: () => expire(),
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.kind === 'forbidden' ? 'forbidden' : result.kind === 'network' ? 'network' : 'error');
      return;
    }
    await load();
  }

  if (loading) {
    return <LoadingState label="Loading availability" />;
  }
  if (error === 'forbidden') {
    return <PermissionDeniedState />;
  }

  const windows = data?.windows ?? [];

  return (
    <Card>
      {error === 'network' ? (
        <NetworkErrorState action={{ label: 'Retry', onClick: () => void load() }} />
      ) : null}
      {error === 'error' ? (
        <NetworkErrorState action={{ label: 'Retry', onClick: () => void load() }} />
      ) : null}
      <Text>Timezone-aware weekly windows. Server is authoritative for slots.</Text>
      {data?.timezone ? <Text size="caption">Timezone: {data.timezone}</Text> : null}
      <Button disabled={saving} onClick={() => void saveWeekdays()}>
        {saving ? 'Saving…' : 'Set weekday 09:00–17:00 UTC'}
      </Button>
      {windows.length === 0 ? (
        <Text tone="secondary">No windows loaded.</Text>
      ) : (
        windows.map((row) => (
          <Text key={row.id} size="caption">
            {`${WEEKDAYS[row.weekday] ?? row.weekday}: ${row.start_local}–${row.end_local}`}
          </Text>
        ))
      )}
    </Card>
  );
}
