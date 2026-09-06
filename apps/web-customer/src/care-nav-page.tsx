'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSession } from '@world-pharma/shell-web';
import {
  Button,
  Card,
  EmptyState,
  FormField,
  Heading,
  LoadingState,
  NetworkErrorState,
  PermissionDeniedState,
  SessionExpiredState,
  Text,
} from '@world-pharma/ui-kit/web';
import {
  CareNavApiError,
  completeCareNavIntake,
  createCareNavSession,
  fetchCareNavAssessment,
  fetchCareNavRecommendations,
  fetchCareNavSession,
  fetchDoctorSlots,
  handoffCareNavAppointment,
  newCareNavIdempotencyKey,
  submitCareNavAnswer,
  type CareNavAssessment,
  type CareNavHandoffResponse,
  type CareNavRecommendation,
  type CareNavRecommendationsResponse,
  type CareNavSession,
  type AppointmentSlot,
} from './care-nav-api';
import {
  CARE_NAV_INTAKE_QUESTIONS,
  classifyCareNavError,
  emergencyGuidanceCopy,
  explanationCopy,
  intakeProgress,
  isEditableCareNavStatus,
  isTerminalCareNavStatus,
  matchExplanationCopy,
  nextUnansweredQuestion,
  slotWindowIso,
  urgencyLabel,
  type CareNavViewError,
} from './care-nav-utils';
import { useSelectedCountry } from './use-selected-country';

type FlowStep =
  | 'entry'
  | 'complaint'
  | 'intake'
  | 'completing'
  | 'result'
  | 'matching'
  | 'providers'
  | 'booking'
  | 'handoff'
  | 'success';

function CareNavErrorPanel({
  error,
  onRetry,
}: {
  error: CareNavViewError;
  onRetry?: () => void;
}) {
  if (error === 'disabled_pack') {
    return (
      <EmptyState
        title="Care navigation unavailable"
        description="Care navigation is not enabled for your region. This feature may be turned on later."
        action={onRetry ? { label: 'Retry', onClick: onRetry } : undefined}
      />
    );
  }
  if (error === 'expired_session') {
    return (
      <EmptyState
        title="Session expired"
        description="This care navigation session has expired. Start a new session to continue."
        action={onRetry ? { label: 'Start again', onClick: onRetry } : undefined}
      />
    );
  }
  if (error === 'not_found') {
    return (
      <EmptyState
        title="Session not found"
        description="We could not find this care navigation session."
        action={onRetry ? { label: 'Start again', onClick: onRetry } : undefined}
      />
    );
  }
  if (error === 'conflict') {
    return (
      <EmptyState
        title="Session cannot be updated"
        description="This session is no longer in a state that accepts changes."
        action={onRetry ? { label: 'Start again', onClick: onRetry } : undefined}
      />
    );
  }
  if (error === 'validation') {
    return (
      <EmptyState
        title="Check your answers"
        description="Some information was missing or invalid. Review and try again."
        action={onRetry ? { label: 'Retry', onClick: onRetry } : undefined}
      />
    );
  }
  if (error === 'network') {
    return <NetworkErrorState action={onRetry ? { label: 'Retry', onClick: onRetry } : undefined} />;
  }
  if (error === 'forbidden') {
    return <PermissionDeniedState />;
  }
  return (
    <EmptyState
      title="Something went wrong"
      description="We could not complete your request. Please try again."
      action={onRetry ? { label: 'Retry', onClick: onRetry } : undefined}
    />
  );
}

function TriageResultPanel({
  assessment,
  onFindProviders,
}: {
  assessment: CareNavAssessment;
  onFindProviders?: () => void;
}) {
  const emergency = emergencyGuidanceCopy(assessment.emergency_guidance_key);
  return (
    <Card>
      <Heading level={3}>{assessment.red_flag ? 'Urgent guidance' : 'Next steps'}</Heading>
      {assessment.red_flag && emergency ? (
        <Card>
          <Text tone="secondary">{emergency}</Text>
        </Card>
      ) : null}
      <Text>{explanationCopy(assessment.explanation_key)}</Text>
      <Text size="caption" tone="secondary">
        Suggested urgency: {urgencyLabel(assessment.urgency)} · Rules version {assessment.rules_version}
      </Text>
      {assessment.red_flag ? (
        <Text size="caption" tone="secondary">
          Provider matching and appointment booking are not available for urgent guidance paths in this release.
        </Text>
      ) : assessment.booking_handoff_allowed && onFindProviders ? (
        <Button onClick={onFindProviders}>Find matched providers</Button>
      ) : (
        <Text size="caption" tone="secondary">
          Booking is not available for this session.
        </Text>
      )}
    </Card>
  );
}

function ProviderListPanel({
  matchResult,
  onSelect,
}: {
  matchResult: CareNavRecommendationsResponse;
  onSelect: (provider: CareNavRecommendation) => void;
}) {
  if (matchResult.no_match) {
    return (
      <EmptyState
        title="No providers available"
        description={matchExplanationCopy(matchResult.explanation_key)}
      />
    );
  }
  return (
    <Card>
      <Heading level={3}>Matched providers</Heading>
      <Text size="caption" tone="secondary">
        {matchExplanationCopy(matchResult.explanation_key)}
      </Text>
      {matchResult.recommendations.map((provider) => (
        <Card key={provider.id}>
          <Text>{provider.display_name}</Text>
          <Text size="caption" tone="secondary">
            {matchExplanationCopy(provider.explanation_key)}
          </Text>
          {provider.online_capable && matchResult.tele_available ? (
            <Text size="caption" tone="secondary">
              Online consultation may be available.
            </Text>
          ) : null}
          <Button variant="secondary" size="sm" onClick={() => onSelect(provider)}>
            Select provider
          </Button>
        </Card>
      ))}
    </Card>
  );
}

function BookingPanel({
  provider,
  teleAvailable,
  slots,
  selectedSlot,
  appointmentType,
  onSlotChange,
  onTypeChange,
  onConfirm,
  submitting,
}: {
  provider: CareNavRecommendation;
  teleAvailable: boolean;
  slots: AppointmentSlot[];
  selectedSlot: string | null;
  appointmentType: 'IN_PERSON' | 'ONLINE';
  onSlotChange: (startsAt: string) => void;
  onTypeChange: (type: 'IN_PERSON' | 'ONLINE') => void;
  onConfirm: () => void;
  submitting: boolean;
}) {
  return (
    <Card>
      <Heading level={3}>Book with {provider.display_name}</Heading>
      <Text size="caption" tone="secondary">
        Choose an available slot. Booking uses the existing appointment service — sandbox only.
      </Text>
      {teleAvailable ? (
        <div className="wp-stack">
          <Button
            variant={appointmentType === 'IN_PERSON' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => onTypeChange('IN_PERSON')}
          >
            In person
          </Button>
          {provider.online_capable ? (
            <Button
              variant={appointmentType === 'ONLINE' ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => onTypeChange('ONLINE')}
            >
              Online (video)
            </Button>
          ) : null}
        </div>
      ) : (
        <Text size="caption" tone="secondary">
          Online consultation is not available — in-person booking only.
        </Text>
      )}
      {slots.length === 0 ? (
        <EmptyState title="No slots available" description="Try another provider or check back later." />
      ) : (
        <div className="wp-stack">
          {slots.slice(0, 8).map((slot) => (
            <Button
              key={slot.starts_at}
              variant={selectedSlot === slot.starts_at ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => onSlotChange(slot.starts_at)}
            >
              {new Date(slot.starts_at).toLocaleString()}
            </Button>
          ))}
        </div>
      )}
      <Button disabled={!selectedSlot || submitting} onClick={onConfirm}>
        {submitting ? 'Booking…' : 'Confirm booking'}
      </Button>
    </Card>
  );
}

function HandoffSuccessPanel({ handoff }: { handoff: CareNavHandoffResponse }) {
  return (
    <Card>
      <Heading level={3}>Appointment booked</Heading>
      <Text>Your care navigation session has been linked to appointment {handoff.appointment_id}.</Text>
      {handoff.tele.available && handoff.tele.video_join_route ? (
        <Text size="caption" tone="secondary">
          Video join will be available from your appointments when the visit starts. Recording is disabled.
        </Text>
      ) : null}
    </Card>
  );
}

export function CareNavigationScreen() {
  const { session, getAccessToken, signOut, expire } = useSession();
  const { country: countryCode } = useSelectedCountry();
  const [step, setStep] = useState<FlowStep>('entry');
  const [sessionRow, setSessionRow] = useState<CareNavSession | null>(null);
  const [assessment, setAssessment] = useState<CareNavAssessment | null>(null);
  const [matchResult, setMatchResult] = useState<CareNavRecommendationsResponse | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<CareNavRecommendation | null>(null);
  const [slots, setSlots] = useState<AppointmentSlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [appointmentType, setAppointmentType] = useState<'IN_PERSON' | 'ONLINE'>('IN_PERSON');
  const [handoffResult, setHandoffResult] = useState<CareNavHandoffResponse | null>(null);
  const [complaint, setComplaint] = useState('');
  const [answerText, setAnswerText] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<CareNavViewError | null>(null);

  const currentQuestion = useMemo(
    () => (sessionRow ? nextUnansweredQuestion(sessionRow) : null),
    [sessionRow],
  );

  const progress = sessionRow ? intakeProgress(sessionRow) : { answered: 0, total: CARE_NAV_INTAKE_QUESTIONS.length };

  const resetFlow = useCallback(() => {
    setStep('entry');
    setSessionRow(null);
    setAssessment(null);
    setMatchResult(null);
    setSelectedProvider(null);
    setSlots([]);
    setSelectedSlot(null);
    setAppointmentType('IN_PERSON');
    setHandoffResult(null);
    setComplaint('');
    setAnswerText('');
    setError(null);
    setSubmitting(false);
    setLoading(false);
  }, []);

  const handleApiError = useCallback(
    (err: unknown) => {
      if (err instanceof CareNavApiError && err.status === 401) {
        expire();
        return;
      }
      setError(classifyCareNavError(err));
    },
    [expire],
  );

  const resumeSession = useCallback(
    async (sessionId: string) => {
      const token = getAccessToken();
      if (!token) {
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const row = await fetchCareNavSession(token, sessionId, countryCode);
        setSessionRow(row);
        if (row.status === 'TRIAGED') {
          const triage = await fetchCareNavAssessment(token, sessionId, countryCode);
          setAssessment(triage);
          setStep('result');
          return;
        }
        if (row.status === 'MATCHED' || row.status === 'COMPLETED') {
          const triage = await fetchCareNavAssessment(token, sessionId, countryCode);
          setAssessment(triage);
          if (row.status === 'COMPLETED') {
            setStep('success');
            return;
          }
          setStep('result');
          return;
        }
        if (isTerminalCareNavStatus(row.status)) {
          setStep('result');
          return;
        }
        if (!isEditableCareNavStatus(row.status)) {
          setError('conflict');
          return;
        }
        setStep(nextUnansweredQuestion(row) ? 'intake' : 'completing');
      } catch (err) {
        handleApiError(err);
      } finally {
        setLoading(false);
      }
    },
    [countryCode, getAccessToken, handleApiError],
  );

  useEffect(() => {
    if (typeof window === 'undefined' || session.status !== 'authenticated') {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('session');
    if (sessionId) {
      void resumeSession(sessionId);
    }
  }, [resumeSession, session.status]);

  async function startComplaint() {
    const token = getAccessToken();
    if (!token || submitting) {
      return;
    }
    const trimmed = complaint.trim();
    if (!trimmed) {
      setError('validation');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const created = await createCareNavSession(token, newCareNavIdempotencyKey('care-nav-create'), {
        country_code: countryCode,
        chief_complaint: trimmed,
      });
      setSessionRow(created);
      setStep('intake');
    } catch (err) {
      handleApiError(err);
    } finally {
      setSubmitting(false);
    }
  }

  async function submitCurrentAnswer() {
    const token = getAccessToken();
    if (!token || !sessionRow || !currentQuestion || submitting) {
      return;
    }
    const trimmed = answerText.trim();
    if (!trimmed) {
      setError('validation');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const updated = await submitCareNavAnswer(token, sessionRow.id, countryCode, {
        question_key: currentQuestion.key,
        answer_text: trimmed,
      });
      setSessionRow(updated);
      setAnswerText('');
      if (!nextUnansweredQuestion(updated)) {
        setStep('completing');
        await runCompleteIntake(token, updated.id);
      }
    } catch (err) {
      handleApiError(err);
    } finally {
      setSubmitting(false);
    }
  }

  async function runMatching() {
    const token = getAccessToken();
    if (!token || !sessionRow || submitting) {
      return;
    }
    setStep('matching');
    setSubmitting(true);
    setError(null);
    try {
      const result = await fetchCareNavRecommendations(token, sessionRow.id, countryCode);
      setMatchResult(result);
      setSessionRow({ ...sessionRow, status: result.status });
      setStep('providers');
    } catch (err) {
      handleApiError(err);
      setStep('result');
    } finally {
      setSubmitting(false);
    }
  }

  async function selectProvider(provider: CareNavRecommendation) {
    const token = getAccessToken();
    if (!token || submitting) {
      return;
    }
    setSelectedProvider(provider);
    setSelectedSlot(null);
    setAppointmentType('IN_PERSON');
    setStep('booking');
    setSubmitting(true);
    setError(null);
    try {
      const window = slotWindowIso();
      const slotResult = await fetchDoctorSlots(
        token,
        provider.doctor_profile_id,
        countryCode,
        window.from,
        window.to,
      );
      setSlots(slotResult.slots);
    } catch (err) {
      handleApiError(err);
      setStep('providers');
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmHandoff() {
    const token = getAccessToken();
    if (!token || !sessionRow || !selectedProvider || !selectedSlot || submitting) {
      return;
    }
    setStep('handoff');
    setSubmitting(true);
    setError(null);
    try {
      const result = await handoffCareNavAppointment(
        token,
        sessionRow.id,
        countryCode,
        newCareNavIdempotencyKey('care-nav-handoff'),
        {
          doctor_profile_id: selectedProvider.doctor_profile_id,
          starts_at: selectedSlot,
          type: appointmentType,
          authorized: true,
        },
      );
      setHandoffResult(result);
      setSessionRow({ ...sessionRow, status: result.status });
      setStep('success');
    } catch (err) {
      handleApiError(err);
      setStep('booking');
    } finally {
      setSubmitting(false);
    }
  }

  async function runCompleteIntake(token: string, sessionId: string) {
    setSubmitting(true);
    setError(null);
    try {
      const result = await completeCareNavIntake(token, sessionId, countryCode);
      setSessionRow(result);
      setAssessment(result.assessment);
      setStep('result');
    } catch (err) {
      handleApiError(err);
    } finally {
      setSubmitting(false);
    }
  }

  if (session.status === 'expired') {
    return <SessionExpiredState action={{ label: 'Sign in again', onClick: () => signOut() }} />;
  }

  if (session.status !== 'authenticated') {
    return (
      <EmptyState title="Sign in required" description="Sign in with OTP to use care navigation." />
    );
  }

  if (session.audience !== 'customer') {
    return <PermissionDeniedState />;
  }

  return (
    <>
      <Link href="/health">
        <Button variant="tertiary" size="sm">
          Back to Health
        </Button>
      </Link>
      <Heading level={2}>Care navigation</Heading>
      <Text tone="secondary">
        Share your symptoms to receive rules-based urgency guidance. This is not a diagnosis and does not replace
        professional medical advice.
      </Text>

      {loading ? <LoadingState label="Loading care navigation" /> : null}

      {!loading && error === 'unauthorized' ? (
        <SessionExpiredState action={{ label: 'Sign in again', onClick: () => signOut() }} />
      ) : null}

      {!loading && error && error !== 'unauthorized' ? (
        <CareNavErrorPanel error={error} onRetry={resetFlow} />
      ) : null}

      {!loading && !error && step === 'entry' ? (
        <Card>
          <Text>
            You will describe your main concern, answer a few follow-up questions, and receive guidance on how urgently
            to seek care.
          </Text>
          <Button onClick={() => setStep('complaint')}>Start care navigation</Button>
        </Card>
      ) : null}

      {!loading && !error && step === 'complaint' ? (
        <Card>
          <FormField label="What is your main concern today?">
            {({ id }) => (
              <textarea
                id={id}
                className="wp-input"
                rows={4}
                value={complaint}
                onChange={(e) => setComplaint(e.target.value)}
                placeholder="Describe your symptoms in your own words"
                aria-label="Chief complaint"
              />
            )}
          </FormField>
          <Button disabled={submitting} onClick={() => void startComplaint()}>
            {submitting ? 'Starting…' : 'Continue'}
          </Button>
        </Card>
      ) : null}

      {!loading && !error && step === 'intake' && sessionRow && currentQuestion ? (
        <Card>
          <Text size="caption" tone="secondary">
            Question {progress.answered + 1} of {progress.total}
          </Text>
          <FormField label={currentQuestion.label}>
            {({ id }) => (
              <input
                id={id}
                className="wp-input"
                value={answerText}
                onChange={(e) => setAnswerText(e.target.value)}
                placeholder={currentQuestion.placeholder}
                aria-label={currentQuestion.label}
              />
            )}
          </FormField>
          <Button disabled={submitting} onClick={() => void submitCurrentAnswer()}>
            {submitting ? 'Saving…' : 'Save answer'}
          </Button>
        </Card>
      ) : null}

      {!loading && !error && step === 'completing' ? (
        <LoadingState label="Reviewing your responses" />
      ) : null}

      {!loading && !error && step === 'result' && assessment ? (
        <div className="wp-stack">
          <TriageResultPanel
            assessment={assessment}
            onFindProviders={assessment.booking_handoff_allowed ? () => void runMatching() : undefined}
          />
          <Button variant="secondary" onClick={resetFlow}>
            Start a new session
          </Button>
        </div>
      ) : null}

      {!loading && !error && step === 'matching' ? (
        <LoadingState label="Finding matched providers" />
      ) : null}

      {!loading && !error && step === 'providers' && matchResult ? (
        <div className="wp-stack">
          <ProviderListPanel matchResult={matchResult} onSelect={(provider) => void selectProvider(provider)} />
          <Button variant="secondary" onClick={() => setStep('result')}>
            Back to guidance
          </Button>
        </div>
      ) : null}

      {!loading && !error && step === 'booking' && selectedProvider && matchResult ? (
        <div className="wp-stack">
          <BookingPanel
            provider={selectedProvider}
            teleAvailable={matchResult.tele_available}
            slots={slots}
            selectedSlot={selectedSlot}
            appointmentType={appointmentType}
            onSlotChange={setSelectedSlot}
            onTypeChange={setAppointmentType}
            onConfirm={() => void confirmHandoff()}
            submitting={submitting}
          />
          <Button variant="secondary" onClick={() => setStep('providers')}>
            Back to providers
          </Button>
        </div>
      ) : null}

      {!loading && !error && step === 'handoff' ? (
        <LoadingState label="Booking your appointment" />
      ) : null}

      {!loading && !error && step === 'success' && handoffResult ? (
        <div className="wp-stack">
          <HandoffSuccessPanel handoff={handoffResult} />
          <Button variant="secondary" onClick={resetFlow}>
            Start a new session
          </Button>
        </div>
      ) : null}

      {!loading && !error && step === 'result' && sessionRow && isTerminalCareNavStatus(sessionRow.status) && !assessment ? (
        <EmptyState
          title="Session closed"
          description={`This session is ${sessionRow.status.toLowerCase()} and can no longer be edited.`}
          action={{ label: 'Start again', onClick: resetFlow }}
        />
      ) : null}
    </>
  );
}
