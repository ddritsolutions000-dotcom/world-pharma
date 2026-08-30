import { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';
import {
  NativeButton,
  NativeCard,
  NativeEmptyState,
  NativeInput,
  NativeLoadingState,
  NativeNetworkErrorState,
  NativePermissionDeniedState,
  NativeText,
} from '@world-pharma/ui-kit/native';
import {
  CareNavApiError,
  completeCareNavIntake,
  createCareNavSession,
  fetchCareNavRecommendations,
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
  isTerminalCareNavStatus,
  matchExplanationCopy,
  nextUnansweredQuestion,
  slotWindowIso,
  urgencyLabel,
  type CareNavViewError,
} from './care-nav-utils';
import type { FeatureCtx } from './customer-features';

const CARE_NAV_COUNTRY = 'XX';

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

function CareNavErrorView({
  error,
  onRetry,
  onUnauthorized,
}: {
  error: CareNavViewError;
  onRetry?: () => void;
  onUnauthorized: () => void;
}) {
  if (error === 'unauthorized') {
    onUnauthorized();
    return <NativeEmptyState title="Session expired" description="Sign in again to continue." />;
  }
  if (error === 'disabled_pack') {
    return (
      <NativeEmptyState
        title="Care navigation unavailable"
        description="Care navigation is not enabled for your region."
      />
    );
  }
  if (error === 'expired_session') {
    return (
      <NativeEmptyState
        title="Session expired"
        description="Start a new session to continue."
        actionLabel={onRetry ? 'Start again' : undefined}
        onAction={onRetry}
      />
    );
  }
  if (error === 'network') {
    return <NativeNetworkErrorState onRetry={onRetry} />;
  }
  if (error === 'forbidden') {
    return <NativePermissionDeniedState />;
  }
  return (
    <NativeEmptyState
      title="Something went wrong"
      description="We could not complete your request."
      actionLabel={onRetry ? 'Retry' : undefined}
      onAction={onRetry}
    />
  );
}

function TriageResultCard({
  assessment,
  onFindProviders,
}: {
  assessment: CareNavAssessment;
  onFindProviders?: () => void;
}) {
  const emergency = emergencyGuidanceCopy(assessment.emergency_guidance_key);
  return (
    <NativeCard>
      <NativeText variant="h2">{assessment.red_flag ? 'Urgent guidance' : 'Next steps'}</NativeText>
      {assessment.red_flag && emergency ? (
        <NativeCard>
          <NativeText variant="caption">{emergency}</NativeText>
        </NativeCard>
      ) : null}
      <NativeText>{explanationCopy(assessment.explanation_key)}</NativeText>
      <NativeText variant="caption">
        {`Suggested urgency: ${urgencyLabel(assessment.urgency)} · Rules ${assessment.rules_version}`}
      </NativeText>
      {assessment.red_flag ? (
        <NativeText variant="caption">
          Provider matching and booking are not available for urgent guidance in this release.
        </NativeText>
      ) : assessment.booking_handoff_allowed && onFindProviders ? (
        <NativeButton label="Find matched providers" onPress={onFindProviders} />
      ) : (
        <NativeText variant="caption">Booking is not available for this session.</NativeText>
      )}
    </NativeCard>
  );
}

export function CareNavigationScreen({ ctx, onBack }: { ctx: FeatureCtx; onBack: () => void }) {
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
    ctx.setViewState('idle');
  }, [ctx]);

  const handleApiError = useCallback(
    (err: unknown) => {
      if (err instanceof CareNavApiError && err.status === 401) {
        ctx.onUnauthorized();
        setError('unauthorized');
        return;
      }
      const classified = classifyCareNavError(err);
      setError(classified);
      if (classified === 'network') {
        ctx.setViewState('network');
      } else if (classified === 'forbidden') {
        ctx.setViewState('forbidden');
      } else {
        ctx.setViewState('idle');
      }
    },
    [ctx],
  );

  async function startComplaint() {
    if (submitting) {
      return;
    }
    const trimmed = complaint.trim();
    if (!trimmed) {
      setError('validation');
      return;
    }
    setSubmitting(true);
    setError(null);
    ctx.setViewState('loading');
    try {
      const created = await createCareNavSession(ctx.token, newCareNavIdempotencyKey('care-nav-create'), {
        country_code: CARE_NAV_COUNTRY,
        chief_complaint: trimmed,
      });
      setSessionRow(created);
      setStep('intake');
      ctx.setViewState('idle');
    } catch (err) {
      handleApiError(err);
    } finally {
      setSubmitting(false);
    }
  }

  async function submitCurrentAnswer() {
    if (!sessionRow || !currentQuestion || submitting) {
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
      const updated = await submitCareNavAnswer(ctx.token, sessionRow.id, CARE_NAV_COUNTRY, {
        question_key: currentQuestion.key,
        answer_text: trimmed,
      });
      setSessionRow(updated);
      setAnswerText('');
      if (!nextUnansweredQuestion(updated)) {
        setStep('completing');
        await runCompleteIntake(updated.id);
      }
    } catch (err) {
      handleApiError(err);
    } finally {
      setSubmitting(false);
    }
  }

  async function runMatching() {
    if (!sessionRow || submitting) {
      return;
    }
    setStep('matching');
    setSubmitting(true);
    setError(null);
    ctx.setViewState('loading');
    try {
      const result = await fetchCareNavRecommendations(ctx.token, sessionRow.id, CARE_NAV_COUNTRY);
      setMatchResult(result);
      setSessionRow({ ...sessionRow, status: result.status });
      setStep('providers');
      ctx.setViewState('idle');
    } catch (err) {
      handleApiError(err);
      setStep('result');
    } finally {
      setSubmitting(false);
    }
  }

  async function selectProvider(provider: CareNavRecommendation) {
    setSelectedProvider(provider);
    setSelectedSlot(null);
    setAppointmentType('IN_PERSON');
    setStep('booking');
    setSubmitting(true);
    setError(null);
    try {
      const window = slotWindowIso();
      const slotResult = await fetchDoctorSlots(
        ctx.token,
        provider.doctor_profile_id,
        CARE_NAV_COUNTRY,
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
    if (!sessionRow || !selectedProvider || !selectedSlot || submitting) {
      return;
    }
    setStep('handoff');
    setSubmitting(true);
    setError(null);
    try {
      const result = await handoffCareNavAppointment(
        ctx.token,
        sessionRow.id,
        CARE_NAV_COUNTRY,
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
      ctx.setViewState('idle');
    } catch (err) {
      handleApiError(err);
      setStep('booking');
    } finally {
      setSubmitting(false);
    }
  }

  async function runCompleteIntake(sessionId: string) {
    setSubmitting(true);
    setError(null);
    ctx.setViewState('loading');
    try {
      const result = await completeCareNavIntake(ctx.token, sessionId, CARE_NAV_COUNTRY);
      setSessionRow(result);
      setAssessment(result.assessment);
      setStep('result');
      ctx.setViewState('idle');
    } catch (err) {
      handleApiError(err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={{ gap: 12 }}>
      <NativeButton label="Back to Health" variant="secondary" onPress={onBack} />
      <NativeText variant="h2">Care navigation</NativeText>
      <NativeText variant="caption">
        Rules-based urgency guidance only — not a diagnosis or treatment recommendation.
      </NativeText>

      {error ? (
        <CareNavErrorView
          error={error}
          onRetry={resetFlow}
          onUnauthorized={ctx.onUnauthorized}
        />
      ) : null}

      {!error && step === 'entry' ? (
        <NativeCard>
          <NativeText>
            Describe your concern, answer follow-up questions, and receive guidance on how urgently to seek care.
          </NativeText>
          <NativeButton label="Start care navigation" onPress={() => setStep('complaint')} />
        </NativeCard>
      ) : null}

      {!error && step === 'complaint' ? (
        <NativeCard>
          <NativeInput
            label="What is your main concern today?"
            value={complaint}
            onChangeText={setComplaint}
          />
          <NativeButton
            label={submitting ? 'Starting…' : 'Continue'}
            disabled={submitting}
            onPress={() => void startComplaint()}
          />
        </NativeCard>
      ) : null}

      {!error && step === 'intake' && sessionRow && currentQuestion ? (
        <NativeCard>
          <NativeText variant="caption">{`Question ${progress.answered + 1} of ${progress.total}`}</NativeText>
          <NativeInput
            label={currentQuestion.label}
            value={answerText}
            onChangeText={setAnswerText}
          />
          <NativeButton
            label={submitting ? 'Saving…' : 'Save answer'}
            disabled={submitting}
            onPress={() => void submitCurrentAnswer()}
          />
        </NativeCard>
      ) : null}

      {!error && step === 'completing' ? <NativeLoadingState title="Reviewing your responses" /> : null}

      {!error && step === 'result' && assessment ? (
        <>
          <TriageResultCard
            assessment={assessment}
            onFindProviders={assessment.booking_handoff_allowed ? () => void runMatching() : undefined}
          />
          <NativeButton label="Start a new session" variant="secondary" onPress={resetFlow} />
        </>
      ) : null}

      {!error && step === 'matching' ? <NativeLoadingState title="Finding matched providers" /> : null}

      {!error && step === 'providers' && matchResult ? (
        <>
          {matchResult.no_match ? (
            <NativeEmptyState
              title="No providers available"
              description={matchExplanationCopy(matchResult.explanation_key)}
            />
          ) : (
            matchResult.recommendations.map((provider) => (
              <View key={provider.id}>
                <NativeCard>
                  <NativeText variant="h2">{provider.display_name}</NativeText>
                  <NativeText variant="caption">{matchExplanationCopy(provider.explanation_key)}</NativeText>
                  <NativeButton label="Select provider" onPress={() => void selectProvider(provider)} />
                </NativeCard>
              </View>
            ))
          )}
          <NativeButton label="Back to guidance" variant="secondary" onPress={() => setStep('result')} />
        </>
      ) : null}

      {!error && step === 'booking' && selectedProvider && matchResult ? (
        <>
          <NativeCard>
            <NativeText variant="h2">{`Book with ${selectedProvider.display_name}`}</NativeText>
            {matchResult.tele_available && selectedProvider.online_capable ? (
              <>
                <NativeButton
                  label="In person"
                  variant={appointmentType === 'IN_PERSON' ? 'primary' : 'secondary'}
                  onPress={() => setAppointmentType('IN_PERSON')}
                />
                <NativeButton
                  label="Online (video)"
                  variant={appointmentType === 'ONLINE' ? 'primary' : 'secondary'}
                  onPress={() => setAppointmentType('ONLINE')}
                />
              </>
            ) : (
              <NativeText variant="caption">In-person booking only.</NativeText>
            )}
            {slots.length === 0 ? (
              <NativeEmptyState title="No slots available" description="Try another provider." />
            ) : (
              slots.slice(0, 6).map((slot) => (
                <View key={slot.starts_at}>
                  <NativeButton
                    label={new Date(slot.starts_at).toLocaleString()}
                    variant={selectedSlot === slot.starts_at ? 'primary' : 'secondary'}
                    onPress={() => setSelectedSlot(slot.starts_at)}
                  />
                </View>
              ))
            )}
            <NativeButton
              label={submitting ? 'Booking…' : 'Confirm booking'}
              disabled={!selectedSlot || submitting}
              onPress={() => void confirmHandoff()}
            />
          </NativeCard>
          <NativeButton label="Back to providers" variant="secondary" onPress={() => setStep('providers')} />
        </>
      ) : null}

      {!error && step === 'handoff' ? <NativeLoadingState title="Booking your appointment" /> : null}

      {!error && step === 'success' && handoffResult ? (
        <>
          <NativeCard>
            <NativeText variant="h2">Appointment booked</NativeText>
            <NativeText>{`Linked to appointment ${handoffResult.appointment_id}`}</NativeText>
            {handoffResult.tele.available ? (
              <NativeText variant="caption">Video join available from appointments when visit starts. No recording.</NativeText>
            ) : null}
          </NativeCard>
          <NativeButton label="Start a new session" variant="secondary" onPress={resetFlow} />
        </>
      ) : null}

      {!error && step === 'result' && sessionRow && isTerminalCareNavStatus(sessionRow.status) && !assessment ? (
        <NativeEmptyState
          title="Session closed"
          description={`This session is ${sessionRow.status.toLowerCase()} and cannot be edited.`}
          actionLabel="Start again"
          onAction={resetFlow}
        />
      ) : null}
    </View>
  );
}
