'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiCall } from '@world-pharma/shell-core';
import { useSession, ConsultVideoPanel } from '@world-pharma/shell-web';
import {
  Button,
  Card,
  LoadingState,
  NetworkErrorState,
  PermissionDeniedState,
  Text,
} from '@world-pharma/ui-kit/web';
import {
  accessReasonLabel,
  evaluateClinicalAccess,
  fetchDoctorMe,
  type ClinicalAccessEvaluation,
} from './doctor-api';

export type EncounterAppointment = {
  id: string;
  status: string;
  starts_at?: string;
  type?: string;
  customer_person_id?: string;
  encounter?: { id: string; status: string } | null;
};

type EncounterAction = 'check-in' | 'start' | 'complete';

const ACCESS_PURPOSES = ['consultation', 'telemedicine'] as const;

function AccessStateRow({ purpose, evaluation }: { purpose: string; evaluation: ClinicalAccessEvaluation }) {
  const { label, state } = accessReasonLabel(evaluation.reason);
  const tone = state === 'allowed' ? undefined : 'secondary';
  return (
    <Text size="caption" tone={tone}>
      {purpose}: {label}
    </Text>
  );
}

export function DoctorEncounterPanel({
  appointment,
  onUpdated,
}: {
  appointment: EncounterAppointment;
  onUpdated?: () => void;
}) {
  const { getAccessToken, expire } = useSession();
  const [busy, setBusy] = useState<EncounterAction | null>(null);
  const [error, setError] = useState<'network' | 'forbidden' | 'error' | null>(null);
  const [accessLoading, setAccessLoading] = useState(false);
  const [accessError, setAccessError] = useState<'network' | 'forbidden' | null>(null);
  const [accessEvaluations, setAccessEvaluations] = useState<Record<string, ClinicalAccessEvaluation>>({});
  const [countryCode, setCountryCode] = useState<string | null>(null);

  const onUnauthorized = useCallback(() => expire(), [expire]);

  const loadAccess = useCallback(async () => {
    const token = getAccessToken();
    const patientId = appointment.customer_person_id;
    if (!token || !patientId) {
      return;
    }
    setAccessLoading(true);
    setAccessError(null);
    const meResult = await fetchDoctorMe({ token, onUnauthorized });
    if (!meResult.ok) {
      setAccessError(meResult.kind === 'forbidden' ? 'forbidden' : 'network');
      setAccessLoading(false);
      return;
    }
    const code = meResult.data.country_code;
    setCountryCode(code);
    if (!code) {
      setAccessError('network');
      setAccessLoading(false);
      return;
    }
    const results = await Promise.all(
      ACCESS_PURPOSES.map(async (purpose) => {
        const result = await evaluateClinicalAccess({
          token,
          onUnauthorized,
          patient_person_id: patientId,
          purpose,
          country_code: code,
        });
        return { purpose, result };
      }),
    );
    const next: Record<string, ClinicalAccessEvaluation> = {};
    for (const row of results) {
      if (row.result.ok) {
        next[row.purpose] = row.result.data;
      }
    }
    if (Object.keys(next).length === 0) {
      setAccessError('network');
    }
    setAccessEvaluations(next);
    setAccessLoading(false);
  }, [appointment.customer_person_id, getAccessToken, onUnauthorized]);

  useEffect(() => {
    void loadAccess();
  }, [loadAccess]);

  const runAction = useCallback(
    async (action: EncounterAction) => {
      const token = getAccessToken();
      if (!token) {
        return;
      }
      setBusy(action);
      setError(null);
      const result = await apiCall(`api/v1/doctor/appointments/${appointment.id}/${action}`, {
        method: 'POST',
        token,
        onUnauthorized: () => expire(),
      });
      setBusy(null);
      if (!result.ok) {
        setError(result.kind === 'forbidden' ? 'forbidden' : result.kind === 'network' ? 'network' : 'error');
        return;
      }
      onUpdated?.();
      void loadAccess();
    },
    [appointment.id, expire, getAccessToken, loadAccess, onUpdated],
  );

  if (busy) {
    return <LoadingState label={`Running ${busy}…`} />;
  }

  return (
    <Card>
      <Text>{`${appointment.status} · ${appointment.starts_at ?? '—'}`}</Text>
      {appointment.customer_person_id ? (
        <Text size="caption">Patient ref: {appointment.customer_person_id.slice(0, 8)}…</Text>
      ) : null}

      <Text>Clinical access (server-evaluated)</Text>
      {accessLoading ? <LoadingState label="Checking access" /> : null}
      {accessError === 'forbidden' ? <PermissionDeniedState /> : null}
      {accessError === 'network' ? (
        <NetworkErrorState action={{ label: 'Retry', onClick: () => void loadAccess() }} />
      ) : null}
      {!accessLoading && !accessError
        ? ACCESS_PURPOSES.map((purpose) =>
            accessEvaluations[purpose] ? (
              <AccessStateRow key={purpose} purpose={purpose} evaluation={accessEvaluations[purpose]!} />
            ) : null,
          )
        : null}
      {countryCode ? <Text size="caption">Policy country: {countryCode}</Text> : null}
      <Text size="caption" tone="secondary">
        Access decisions are enforced on the server. This panel does not grant consent on behalf of the patient.
      </Text>

      {appointment.encounter ? (
        <>
          <Text>{`Encounter: ${appointment.encounter.status}`}</Text>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              try {
                sessionStorage.setItem('wp.doctor.prescribeEncounterId', appointment.encounter!.id);
              } catch {
                /* ignore */
              }
              window.location.href = '/prescriptions';
            }}
          >
            Prescribe
          </Button>
        </>
      ) : (
        <Text tone="secondary">No encounter yet. Check in to start the lifecycle.</Text>
      )}
      {error === 'forbidden' ? <PermissionDeniedState /> : null}
      {error === 'network' ? (
        <NetworkErrorState action={{ label: 'Retry', onClick: () => setError(null) }} />
      ) : null}
      {error === 'error' ? (
        <NetworkErrorState action={{ label: 'Dismiss', onClick: () => setError(null) }} />
      ) : null}
      <Button size="sm" disabled={!!busy} onClick={() => void runAction('check-in')}>
        Check in
      </Button>
      <Button size="sm" variant="secondary" disabled={!!busy} onClick={() => void runAction('start')}>
        Start consult
      </Button>
      <Text size="caption" tone="secondary">
        Start consult remains subject to server authorization even when this button is enabled.
      </Text>
      <Button size="sm" variant="tertiary" disabled={!!busy} onClick={() => void runAction('complete')}>
        Complete
      </Button>
      <ConsultVideoPanel
        appointmentId={appointment.id}
        appointmentType={appointment.type}
        role="doctor"
        token={getAccessToken()}
        onUnauthorized={() => expire()}
        canEndVideo
      />
    </Card>
  );
}
