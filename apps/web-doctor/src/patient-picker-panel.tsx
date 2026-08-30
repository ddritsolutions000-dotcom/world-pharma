'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from '@world-pharma/shell-web';
import {
  Button,
  Card,
  EmptyState,
  FormField,
  LoadingState,
  NetworkErrorState,
  PermissionDeniedState,
  SessionExpiredState,
  Text,
} from '@world-pharma/ui-kit/web';
import { fetchDoctorHealthPatients, type DoctorHealthPatient } from './health-api';
import { shortPatientId } from './health-utils';

const DEFAULT_COUNTRY = 'XX';

export function DoctorPatientPickerPanel() {
  const { session, getAccessToken, signOut, expire } = useSession();
  const [patients, setPatients] = useState<DoctorHealthPatient[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [countryCode, setCountryCode] = useState(DEFAULT_COUNTRY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<'network' | 'forbidden' | null>(null);

  const onUnauthorized = useCallback(() => expire(), [expire]);

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token || session.status !== 'authenticated') {
      return;
    }
    setLoading(true);
    setError(null);
    setSelectedId('');
    const result = await fetchDoctorHealthPatients({ token, onUnauthorized, countryCode });
    if (result.ok) {
      setPatients(result.data.patients ?? []);
    } else if (result.kind === 'forbidden') {
      setError('forbidden');
    } else if (result.kind !== 'unauthorized') {
      setError('network');
    }
    setLoading(false);
  }, [countryCode, getAccessToken, onUnauthorized, session.status]);

  useEffect(() => {
    void load();
  }, [load]);

  if (session.status === 'expired') {
    return <SessionExpiredState action={{ label: 'Sign in again', onClick: () => signOut() }} />;
  }

  if (loading) {
    return <LoadingState label="Loading patients" />;
  }

  if (error === 'forbidden') {
    return <PermissionDeniedState />;
  }

  if (error === 'network') {
    return <NetworkErrorState action={{ label: 'Retry', onClick: () => void load() }} />;
  }

  return (
    <section className="wp-stack">
      <Text tone="secondary">
        Select a patient with an active clinical relationship. Health records require valid patient consent.
      </Text>
      <FormField label="Country code">
        {({ id }) => (
          <input
            id={id}
            className="wp-input"
            value={countryCode}
            onChange={(e) => setCountryCode(e.target.value.toUpperCase())}
            onBlur={() => void load()}
          />
        )}
      </FormField>
      <Button variant="secondary" size="sm" onClick={() => void load()}>
        Refresh patient list
      </Button>
      {patients.length === 0 ? (
        <EmptyState
          title="No patients available"
          description="Active clinical relationships for this country will appear here."
        />
      ) : (
        <FormField label="Patient">
          {({ id }) => (
            <select
              id={id}
              className="wp-input"
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
            >
              <option value="">Select a patient…</option>
              {patients.map((row) => (
                <option key={row.patient_person_id} value={row.patient_person_id}>
                  {shortPatientId(row.patient_person_id)} · {row.kind} · {row.status}
                </option>
              ))}
            </select>
          )}
        </FormField>
      )}
      {selectedId ? (
        <Card>
          <Text size="caption">Selected patient: {shortPatientId(selectedId)}</Text>
          <Link href={`/patients/${selectedId}/health?country=${countryCode}`}>
            <Button variant="primary" size="sm">
              View health timeline
            </Button>
          </Link>
        </Card>
      ) : (
        <Text size="caption" tone="secondary">
          Choose a patient above to open their health timeline.
        </Text>
      )}
    </section>
  );
}
