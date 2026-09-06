'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiCall } from '@world-pharma/shell-core';
import { useSession } from '@world-pharma/shell-web';
import {
  Button,
  Card,
  FormField,
  Input,
  LoadingState,
  Text,
} from '@world-pharma/ui-kit/web';
import { DoctorLoadFailure, mapDoctorApiFailure, type DoctorLoadError } from './doctor-load-state';

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
  const [error, setError] = useState<DoctorLoadError | null>(null);
  const [startLocal, setStartLocal] = useState('09:00');
  const [endLocal, setEndLocal] = useState('17:00');
  const [includeSaturday, setIncludeSaturday] = useState(false);

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
      baseUrl: typeof window !== 'undefined' ? window.location.origin : undefined,
      onUnauthorized: () => expire(),
    });
    if (!result.ok) {
      setError(mapDoctorApiFailure(result.kind));
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
    const weekdays = includeSaturday ? [1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5];
    const result = await apiCall('api/v1/doctor/me/availability/windows', {
      method: 'PUT',
      token,
      baseUrl: typeof window !== 'undefined' ? window.location.origin : undefined,
      body: {
        timezone: data?.timezone || 'UTC',
        windows: weekdays.map((weekday) => ({
          weekday,
          start_local: startLocal.trim() || '09:00',
          end_local: endLocal.trim() || '17:00',
          slot_minutes: 30,
          buffer_minutes: 0,
        })),
      },
      onUnauthorized: () => expire(),
    });
    setSaving(false);
    if (!result.ok) {
      setError(mapDoctorApiFailure(result.kind));
      return;
    }
    await load();
  }

  if (loading) {
    return <LoadingState label="Loading availability" />;
  }
  if (error && !data) {
    return <DoctorLoadFailure error={error} onRetry={() => void load()} />;
  }

  const windows = data?.windows ?? [];

  return (
    <Card>
      {error ? <DoctorLoadFailure error={error} onRetry={() => void load()} /> : null}
      <Text>Set weekly consult windows. The server generates bookable slots from these hours.</Text>
      {data?.timezone ? <Text size="caption">Timezone: {data.timezone}</Text> : null}
      <FormField label="Start (local)">
        {({ id }) => <Input id={id} value={startLocal} onChange={(e) => setStartLocal(e.target.value)} />}
      </FormField>
      <FormField label="End (local)">
        {({ id }) => <Input id={id} value={endLocal} onChange={(e) => setEndLocal(e.target.value)} />}
      </FormField>
      <label>
        <input type="checkbox" checked={includeSaturday} onChange={(e) => setIncludeSaturday(e.target.checked)} /> Saturdays
      </label>
      <Button disabled={saving} onClick={() => void saveWeekdays()}>
        {saving ? 'Saving…' : 'Save weekly hours'}
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
