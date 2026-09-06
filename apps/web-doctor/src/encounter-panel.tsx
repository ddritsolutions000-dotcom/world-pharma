'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiCall } from '@world-pharma/shell-core';
import { useSession, ConsultVideoPanel } from '@world-pharma/shell-web';
import {
  Button,
  Card,
  FormField,
  LoadingState,
  NetworkErrorState,
  PermissionDeniedState,
  Text,
  TextArea,
} from '@world-pharma/ui-kit/web';
import {
  cancelDoctorAppointment,
  markDoctorAppointmentNoShow,
  accessReasonLabel,
  evaluateClinicalAccess,
  fetchDoctorMe,
  type ClinicalAccessEvaluation,
} from './doctor-api';
import {
  availableEncounterActions,
  availableEncounterSecondaryActions,
  encounterActionLabel,
  encounterSecondaryActionLabel,
  type EncounterAction,
  type EncounterSecondaryAction,
} from './encounter-actions';
import { appointmentStatusLabel } from './appointment-status-labels';

export type EncounterAppointment = {
  id: string;
  status: string;
  starts_at?: string;
  type?: string;
  customer_person_id?: string;
  encounter?: { id: string; status: string } | null;
};

const ACCESS_PURPOSES = ['consultation', 'telemedicine'] as const;
const MIN_SUMMARY_LEN = 8;

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
  const [busy, setBusy] = useState<EncounterAction | EncounterSecondaryAction | null>(null);
  const [error, setError] = useState<'network' | 'forbidden' | 'consent' | 'error' | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [accessLoading, setAccessLoading] = useState(false);
  const [accessError, setAccessError] = useState<'network' | 'forbidden' | null>(null);
  const [accessEvaluations, setAccessEvaluations] = useState<Record<string, ClinicalAccessEvaluation>>({});
  const [countryCode, setCountryCode] = useState<string | null>(null);
  const [patientSummary, setPatientSummary] = useState('');
  const [formMessage, setFormMessage] = useState<string | null>(null);

  const onUnauthorized = useCallback(() => expire(), [expire]);
  const actions = useMemo(() => availableEncounterActions(appointment.status), [appointment.status]);
  const secondaryActions = useMemo(
    () => availableEncounterSecondaryActions(appointment.status),
    [appointment.status],
  );
  const isOnline = (appointment.type ?? '').toUpperCase() === 'ONLINE';
  const consultationAllowed = accessEvaluations.consultation?.allowed === true;
  const consultationPendingConsent =
    accessEvaluations.consultation?.reason === 'consent_missing_or_inactive' ||
    accessEvaluations.consultation?.reason === 'consent_expired';

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
      if (action === 'start' && consultationPendingConsent) {
        setError('consent');
        setErrorDetail(
          'Patient consent is required before consultation can start. Ask the patient to grant consultation access for this doctor, then retry.',
        );
        return;
      }
      if (action === 'complete') {
        const summary = patientSummary.trim();
        if (summary.length < MIN_SUMMARY_LEN) {
          setFormMessage(`Add a patient summary (at least ${MIN_SUMMARY_LEN} characters) before completing.`);
          return;
        }
      }
      setBusy(action);
      setError(null);
      setErrorDetail(null);
      setFormMessage(null);
      const body = action === 'complete' ? { patient_summary: patientSummary.trim() } : undefined;
      const result = await apiCall(`api/v1/doctor/appointments/${appointment.id}/${action}`, {
        method: 'POST',
        token,
        body,
        baseUrl: typeof window !== 'undefined' ? window.location.origin : undefined,
        onUnauthorized: () => expire(),
      });
      setBusy(null);
      if (!result.ok) {
        if (result.code === 'CONSENT_REQUIRED' || /consent/i.test(result.error)) {
          setError('consent');
          setErrorDetail(result.error);
        } else if (result.kind === 'forbidden') {
          setError('forbidden');
          setErrorDetail(result.error);
        } else if (result.kind === 'network') {
          setError('network');
        } else {
          setError('error');
          setErrorDetail(result.error);
        }
        return;
      }
      onUpdated?.();
      void loadAccess();
    },
    [
      appointment.id,
      consultationPendingConsent,
      expire,
      getAccessToken,
      loadAccess,
      onUpdated,
      patientSummary,
    ],
  );

  const runSecondaryAction = useCallback(
    async (action: EncounterSecondaryAction) => {
      const token = getAccessToken();
      if (!token) {
        return;
      }
      setBusy(action);
      setError(null);
      setErrorDetail(null);
      setFormMessage(null);
      const result =
        action === 'cancel'
          ? await cancelDoctorAppointment({
              token,
              appointmentId: appointment.id,
              onUnauthorized: expire,
            })
          : await markDoctorAppointmentNoShow({
              token,
              appointmentId: appointment.id,
              onUnauthorized: expire,
            });
      setBusy(null);
      if (!result.ok) {
        setError(result.kind === 'forbidden' ? 'forbidden' : result.kind === 'network' ? 'network' : 'error');
        setErrorDetail(!result.ok ? result.error : null);
        return;
      }
      onUpdated?.();
    },
    [appointment.id, expire, getAccessToken, onUpdated],
  );

  if (busy) {
    const label =
      busy === 'cancel' || busy === 'no-show'
        ? encounterSecondaryActionLabel(busy)
        : encounterActionLabel(busy as EncounterAction);
    return <LoadingState label={`${label}…`} />;
  }

  return (
    <Card className="wp-stack">
      <p className="wp-sandbox-banner" role="status">
        Sandbox clinical workflow — Confirm → Check in → Start → Complete. Live eRx and production video remain
        EXTERNAL_GATED.
      </p>
      <Text>
        {appointmentStatusLabel(appointment.status)} · {appointment.starts_at ?? '—'}
        {appointment.type ? ` · ${appointment.type}` : ''}
      </Text>
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

      {consultationPendingConsent && actions.includes('start') ? (
        <p className="wp-sandbox-banner" role="status">
          Patient consent required before consultation can start. This is not a permissions error — the patient must
          grant consultation access for this doctor from their account.
        </p>
      ) : null}

      <Text size="caption" tone="secondary">
        Access decisions are enforced on the server. Consent missing shows as Consent required — not a role
        permission denial.
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
        <Text tone="secondary">No encounter yet — confirm the booking, then check in.</Text>
      )}

      {formMessage ? <Text tone="secondary">{formMessage}</Text> : null}
      {error === 'consent' ? (
        <Card>
          <Text>Patient consent required</Text>
          <Text tone="secondary">
            {errorDetail ??
              'Patient consent is required before consultation can start. Ask the patient to grant access, then retry.'}
          </Text>
        </Card>
      ) : null}
      {error === 'forbidden' ? (
        <PermissionDeniedState
          title="Action not authorized"
          description={
            errorDetail ??
            'This step is blocked for your role or the current appointment state. It is not a missing-consent message.'
          }
        />
      ) : null}
      {error === 'network' ? (
        <NetworkErrorState action={{ label: 'Retry', onClick: () => setError(null) }} />
      ) : null}
      {error === 'error' ? (
        <Card>
          <Text tone="secondary">{errorDetail ?? 'Request failed.'}</Text>
          <Button size="sm" variant="secondary" onClick={() => setError(null)}>
            Dismiss
          </Button>
        </Card>
      ) : null}

      <div className="wp-toolbar wp-toolbar--wrap">
        {actions.map((action) => {
          const startBlocked = action === 'start' && !consultationAllowed && !accessLoading;
          return (
            <Button
              key={action}
              size="sm"
              variant={action === 'complete' ? 'tertiary' : action === 'confirm' ? 'primary' : 'secondary'}
              disabled={!!busy || startBlocked}
              onClick={() => void runAction(action)}
            >
              {encounterActionLabel(action)}
              {startBlocked ? ' (consent required)' : ''}
            </Button>
          );
        })}
        {!actions.length && !secondaryActions.length ? (
          <Text size="caption" tone="secondary">
            No actions for status {appointmentStatusLabel(appointment.status)}.
          </Text>
        ) : null}
        {secondaryActions.map((action) => (
          <Button
            key={action}
            size="sm"
            variant="tertiary"
            disabled={!!busy}
            onClick={() => void runSecondaryAction(action)}
          >
            {encounterSecondaryActionLabel(action)}
          </Button>
        ))}
      </div>

      {actions.includes('complete') ? (
        <FormField label="Patient summary (shared to patient health timeline after completion)">
          {({ id }) => (
            <TextArea
              id={id}
              rows={4}
              value={patientSummary}
              onChange={(e) => setPatientSummary(e.target.value)}
              placeholder="Consultation summary for the patient (minimum 8 characters)."
            />
          )}
        </FormField>
      ) : null}

      {actions.includes('start') && consultationPendingConsent ? (
        <Text size="caption" tone="secondary">
          Start is disabled until patient consent is active for purpose “consultation”.
        </Text>
      ) : null}

      {actions.includes('start') && consultationAllowed ? (
        <Text size="caption" tone="secondary">
          Consent is active — you can start the consultation. Live video remains EXTERNAL_GATED.
        </Text>
      ) : null}

      {isOnline ? (
        <>
          <Text size="caption" tone="secondary">
            Video uses the sandbox/demo provider — not a live telemedicine network. EXTERNAL_GATED for production.
          </Text>
          <ConsultVideoPanel
            appointmentId={appointment.id}
            appointmentType={appointment.type}
            role="doctor"
            token={getAccessToken()}
            onUnauthorized={() => expire()}
          />
        </>
      ) : null}
    </Card>
  );
}
