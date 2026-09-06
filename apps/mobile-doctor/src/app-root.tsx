import { useCallback, useEffect, useMemo, useState } from 'react';
import { SafeAreaView, View } from 'react-native';
import { createSessionStore } from '@world-pharma/shell-core';
import {
  NativeButton,
  NativeCard,
  NativeEmptyState,
  NativeInput,
  NativeListRow,
  NativeListSection,
  NativeLoadingState,
  NativeNetworkErrorState,
  NativeOtpSignIn,
  NativePageHeader,
  NativeSessionExpiredState,
  NativeText,
  OpsKpiRow,
  OpsShell,
  OpsWorkCard,
  OpsAccessGate,
} from '@world-pharma/ui-kit/native';
import { NativeConsultVideoPanel } from './consult-panel';
import {
  DoctorApiError,
  accessReasonLabel,
  appointmentAction,
  createPrescription,
  evaluateClinicalAccess,
  fetchAppointments,
  fetchAvailability,
  fetchCredentials,
  fetchNotificationPreferences,
  fetchOrganizations,
  fetchPrescription,
  fetchPrescriptionContext,
  fetchPrescriptions,
  fetchProfile,
  formatAvailabilitySummary,
  issuePrescription,
  amendPrescription,
  approveDoctorRefillRequest,
  cancelPrescription,
  fetchDoctorRefillRequests,
  newIdempotencyKey,
  rejectDoctorRefillRequest,
  saveAvailability,
  submitCredential,
  cancelAppointment,
  markAppointmentNoShow,
  fetchEarningsSummary,
  type ClinicalAccessEvaluation,
  type DoctorAppointment,
  type DoctorCredential,
  type DoctorOrgMembership,
  type DoctorProfile,
  type DoctorRefillRequest,
  type Prescription,
  type PrescriptionContext,
} from './doctor-api';
import { DOCTOR_TABS, doctorMobileScreen, type DoctorMobileTab } from './navigation';
import {
  availableEncounterActions,
  availableEncounterSecondaryActions,
} from './encounter-actions';
import { DoctorInboxScreen, DoctorSupportScreen } from './ops-features';
import {
  DEFAULT_COUNTRY,
  DoctorHealthArtifactScreen,
  DoctorHealthCountryInput,
  DoctorHealthPatientPicker,
  DoctorHealthTimelineScreen,
} from './health-features';

type ViewState = 'idle' | 'loading' | 'forbidden' | 'network' | 'expired';
type RxComposeStep = 'compose' | 'review';

function mapError(err: unknown, store: ReturnType<typeof createSessionStore>, setSession: () => void): ViewState {
  if (err instanceof DoctorApiError) {
    if (err.status === 403) {
      return 'forbidden';
    }
    if (err.status === 401) {
      store.expire();
      setSession();
      return 'expired';
    }
  }
  return 'network';
}

export function App() {
  const store = useMemo(() => createSessionStore(), []);
  const [session, setSessionState] = useState(store.snapshot());
  const syncSession = useCallback(() => setSessionState(store.snapshot()), [store]);

  const [tab, setTab] = useState<DoctorMobileTab>('dashboard');
  const [viewState, setViewState] = useState<ViewState>('idle');
  const [profile, setProfile] = useState<DoctorProfile | null>(null);
  const [availabilitySummary, setAvailabilitySummary] = useState<string | null>(null);
  const [appointments, setAppointments] = useState<DoctorAppointment[]>([]);
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [selectedPrescription, setSelectedPrescription] = useState<Prescription | null>(null);
  const [credentials, setCredentials] = useState<DoctorCredential[]>([]);
  const [organizations, setOrganizations] = useState<DoctorOrgMembership[]>([]);
  const [prefSummary, setPrefSummary] = useState<string | null>(null);
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<string | null>(null);
  const [selectedPrescriptionId, setSelectedPrescriptionId] = useState<string | null>(null);
  const [accessRows, setAccessRows] = useState<Record<string, ClinicalAccessEvaluation>>({});
  const [credType, setCredType] = useState('');
  const [credIssuer, setCredIssuer] = useState('');
  const [credNumber, setCredNumber] = useState('');
  const [rxEncounterId, setRxEncounterId] = useState('');
  const [rxConceptCode, setRxConceptCode] = useState('');
  const [rxConceptLabel, setRxConceptLabel] = useState('');
  const [rxDosage, setRxDosage] = useState('');
  const [rxQty, setRxQty] = useState('');
  const [rxStep, setRxStep] = useState<RxComposeStep>('compose');
  const [rxConfirmIssue, setRxConfirmIssue] = useState(false);
  const [rxContext, setRxContext] = useState<PrescriptionContext | null>(null);
  const [rxMessage, setRxMessage] = useState<string | null>(null);
  const [confirmCancelRx, setConfirmCancelRx] = useState(false);
  const [confirmAmendRx, setConfirmAmendRx] = useState(false);
  const [amendConceptCode, setAmendConceptCode] = useState('');
  const [amendConceptLabel, setAmendConceptLabel] = useState('');
  const [amendDosage, setAmendDosage] = useState('');
  const [amendQty, setAmendQty] = useState('');
  const [showAmendForm, setShowAmendForm] = useState(false);
  const [refillRequests, setRefillRequests] = useState<DoctorRefillRequest[]>([]);
  const [refillBusyId, setRefillBusyId] = useState<string | null>(null);
  const [refillMessage, setRefillMessage] = useState<string | null>(null);
  const [patientSummary, setPatientSummary] = useState('');
  const [earningsSummary, setEarningsSummary] = useState<string | null>(null);
  const [healthCountryCode, setHealthCountryCode] = useState(DEFAULT_COUNTRY);
  const [selectedHealthPatientId, setSelectedHealthPatientId] = useState<string | null>(null);
  const [selectedHealthArtifactId, setSelectedHealthArtifactId] = useState<string | null>(null);
  const [opsSubScreen, setOpsSubScreen] = useState<'inbox' | 'support' | null>(null);
  const [denyDetail, setDenyDetail] = useState<string | null>(null);

  const token = store.getAccessToken();
  const screen = doctorMobileScreen(
    session,
    tab,
    selectedAppointmentId,
    selectedPrescriptionId,
    selectedHealthPatientId,
    selectedHealthArtifactId,
  );
  const selectedAppointment = appointments.find((row) => row.id === selectedAppointmentId) ?? null;

  const handleError = useCallback(
    (err: unknown) => {
      if (err instanceof DoctorApiError && err.status === 403) {
        setDenyDetail(err.message);
      }
      setViewState(mapError(err, store, syncSession));
    },
    [store, syncSession],
  );

  const loadTab = useCallback(async () => {
    if (!token) {
      return;
    }
    setViewState('loading');
    try {
      if (tab === 'dashboard' || tab === 'profile' || tab === 'settings' || tab === 'inbox') {
        setProfile(await fetchProfile(token));
      }
      if (tab === 'dashboard' || tab === 'availability') {
        setAvailabilitySummary(formatAvailabilitySummary(await fetchAvailability(token)));
      }
      if (tab === 'dashboard' || tab === 'appointments' || tab === 'prescriptions') {
        const list = await fetchAppointments(token);
        setAppointments(list.appointments ?? []);
      }
      if (tab === 'dashboard') {
        try {
          const earnings = await fetchEarningsSummary(token);
          setEarningsSummary(
            `Sandbox earnings: ${earnings.completed_consult_count} completed · payable ${earnings.doctor_payable_minor} ${earnings.currency} · ${earnings.settlement_status}`,
          );
        } catch {
          setEarningsSummary(null);
        }
      }
      if (tab === 'prescriptions') {
        const list = await fetchPrescriptions(token);
        setPrescriptions(list.prescriptions ?? []);
      }
      if (tab === 'refill-requests') {
        const refills = await fetchDoctorRefillRequests(token);
        setRefillRequests(refills.requests ?? []);
      }
      if (tab === 'credentials') {
        const list = await fetchCredentials(token);
        setCredentials(list.credentials ?? []);
      }
      if (tab === 'organizations') {
        const list = await fetchOrganizations(token);
        setOrganizations(list.organizations ?? []);
      }
      if (tab === 'settings') {
        const prefs = await fetchNotificationPreferences(token);
        setPrefSummary(
          `Email ${prefs.email_enabled ? 'on' : 'off'} · Push ${prefs.push_enabled ? 'on' : 'off'} · Appointments ${prefs.appointment_updates ? 'on' : 'off'}`,
        );
      }
      setViewState('idle');
    } catch (err) {
      handleError(err);
    }
  }, [token, tab, handleError]);

  useEffect(() => {
    if (
      session.status === 'authenticated' &&
      !selectedAppointmentId &&
      !selectedPrescriptionId &&
      !selectedHealthPatientId &&
      !selectedHealthArtifactId
    ) {
      void loadTab();
    }
  }, [
    session.status,
    tab,
    selectedAppointmentId,
    selectedPrescriptionId,
    selectedHealthPatientId,
    selectedHealthArtifactId,
    loadTab,
  ]);

  const loadAccess = useCallback(async () => {
    if (!token || !selectedAppointment?.customer_person_id || !profile?.country_code) {
      setAccessRows({});
      return;
    }
    const next: Record<string, ClinicalAccessEvaluation> = {};
    for (const purpose of ['consultation', 'telemedicine'] as const) {
      try {
        next[purpose] = await evaluateClinicalAccess(token, {
          patient_person_id: selectedAppointment.customer_person_id,
          purpose,
          country_code: profile.country_code,
        });
      } catch {
        // Access evaluation failures surface as missing rows; no PHI dump.
      }
    }
    setAccessRows(next);
  }, [token, selectedAppointment, profile?.country_code]);

  useEffect(() => {
    if (selectedAppointmentId && selectedAppointment) {
      void loadAccess();
    }
  }, [selectedAppointmentId, selectedAppointment, loadAccess]);

  const runEncounter = async (action: 'check-in' | 'start' | 'complete' | 'confirm') => {
    if (!token || !selectedAppointmentId) {
      return;
    }
    if (action === 'complete') {
      const summary = patientSummary.trim();
      if (summary.length < 8) {
        setRxMessage('Add a patient summary (at least 8 characters) before completing.');
        return;
      }
    }
    setViewState('loading');
    setRxMessage(null);
    try {
      await appointmentAction(
        token,
        selectedAppointmentId,
        action,
        action === 'complete' ? { patient_summary: patientSummary.trim() } : undefined,
      );
      const list = await fetchAppointments(token);
      setAppointments(list.appointments ?? []);
      setViewState('idle');
    } catch (err) {
      handleError(err);
    }
  };

  const runSecondaryEncounter = async (action: 'cancel' | 'no-show') => {
    if (!token || !selectedAppointmentId) {
      return;
    }
    setViewState('loading');
    try {
      if (action === 'cancel') {
        await cancelAppointment(token, selectedAppointmentId);
      } else {
        await markAppointmentNoShow(token, selectedAppointmentId);
      }
      const list = await fetchAppointments(token);
      setAppointments(list.appointments ?? []);
      setSelectedAppointmentId(null);
      setViewState('idle');
    } catch (err) {
      handleError(err);
    }
  };

  const openPrescription = async (id: string) => {
    if (!token) {
      return;
    }
    setSelectedPrescriptionId(id);
    setViewState('loading');
    try {
      setSelectedPrescription(await fetchPrescription(token, id));
      setViewState('idle');
    } catch (err) {
      handleError(err);
    }
  };

  const runCreateDraft = async () => {
    if (!token || !rxEncounterId.trim() || !rxConceptCode.trim() || !rxConceptLabel.trim() || !rxDosage.trim() || !rxQty.trim()) {
      return;
    }
    setViewState('loading');
    setRxMessage(null);
    try {
      const created = await createPrescription(
        token,
        {
          encounter_id: rxEncounterId.trim(),
          lines: [
            {
              clinical_concept_code: rxConceptCode.trim(),
              clinical_concept_label: rxConceptLabel.trim(),
              dosage_instructions: rxDosage.trim(),
              quantity_authorized: rxQty.trim(),
            },
          ],
        },
        newIdempotencyKey('create'),
      );
      setRxEncounterId('');
      setRxConceptCode('');
      setRxConceptLabel('');
      setRxDosage('');
      setRxQty('');
      setRxStep('compose');
      setRxConfirmIssue(false);
      setRxContext(null);
      setSelectedPrescription(created);
      setSelectedPrescriptionId(created.id);
      const list = await fetchPrescriptions(token);
      setPrescriptions(list.prescriptions ?? []);
      setViewState('idle');
    } catch (err) {
      handleError(err);
    }
  };

  const loadRxContext = async (encounterId: string) => {
    if (!token || !encounterId.trim()) {
      return;
    }
    setViewState('loading');
    setRxMessage(null);
    try {
      const ctx = await fetchPrescriptionContext(token, encounterId.trim());
      setRxContext(ctx);
      setRxEncounterId(ctx.encounter_id);
      if (!ctx.rx_prescribe_enabled) {
        setRxMessage('Prescribing is not enabled for this country pack.');
        setViewState('idle');
        return;
      }
      if (!ctx.clinical_access_allowed) {
        setRxMessage(`Clinical access not available (${ctx.clinical_access_reason}).`);
        setViewState('forbidden');
        return;
      }
      setViewState('idle');
    } catch (err) {
      handleError(err);
    }
  };

  const goToRxReview = () => {
    if (!rxEncounterId.trim() || !rxConceptCode.trim() || !rxConceptLabel.trim() || !rxDosage.trim() || !rxQty.trim()) {
      setRxMessage('Complete encounter and medication line fields before review.');
      return;
    }
    setRxConfirmIssue(false);
    setRxMessage(null);
    setRxStep('review');
  };

  const runCreateAndIssue = async () => {
    if (!token || !rxConfirmIssue) {
      setRxMessage('Confirm that you are issuing this prescription.');
      return;
    }
    if (!rxEncounterId.trim() || !rxConceptCode.trim() || !rxConceptLabel.trim() || !rxDosage.trim() || !rxQty.trim()) {
      return;
    }
    setViewState('loading');
    setRxMessage(null);
    try {
      const created = await createPrescription(
        token,
        {
          encounter_id: rxEncounterId.trim(),
          lines: [
            {
              clinical_concept_code: rxConceptCode.trim(),
              clinical_concept_label: rxConceptLabel.trim(),
              dosage_instructions: rxDosage.trim(),
              quantity_authorized: rxQty.trim(),
            },
          ],
        },
        newIdempotencyKey('create'),
      );
      const issued = await issuePrescription(token, created.id, newIdempotencyKey('issue'));
      setRxEncounterId('');
      setRxConceptCode('');
      setRxConceptLabel('');
      setRxDosage('');
      setRxQty('');
      setRxStep('compose');
      setRxConfirmIssue(false);
      setRxContext(null);
      setSelectedPrescription(issued);
      setSelectedPrescriptionId(issued.id);
      const list = await fetchPrescriptions(token);
      setPrescriptions(list.prescriptions ?? []);
      setViewState('idle');
    } catch (err) {
      handleError(err);
    }
  };

  const runIssue = async () => {
    if (!token || !selectedPrescriptionId || !rxConfirmIssue) {
      setRxMessage('Confirm that you are issuing this prescription.');
      return;
    }
    setViewState('loading');
    setRxMessage(null);
    try {
      const updated = await issuePrescription(token, selectedPrescriptionId, newIdempotencyKey('issue'));
      setSelectedPrescription(updated);
      setRxConfirmIssue(false);
      const list = await fetchPrescriptions(token);
      setPrescriptions(list.prescriptions ?? []);
      setViewState('idle');
    } catch (err) {
      handleError(err);
    }
  };

  const runCancelRx = async () => {
    if (!token || !selectedPrescriptionId || !confirmCancelRx) {
      return;
    }
    setViewState('loading');
    try {
      const updated = await cancelPrescription(token, selectedPrescriptionId, newIdempotencyKey('cancel'));
      setSelectedPrescription(updated);
      setConfirmCancelRx(false);
      const list = await fetchPrescriptions(token);
      setPrescriptions(list.prescriptions ?? []);
      setViewState('idle');
    } catch (err) {
      handleError(err);
    }
  };

  const runAmendRx = async () => {
    if (!token || !selectedPrescriptionId || !confirmAmendRx) {
      setRxMessage('Confirm amendment (creates a new immutable version).');
      return;
    }
    if (!amendConceptCode.trim() || !amendConceptLabel.trim() || !amendDosage.trim() || !amendQty.trim()) {
      setRxMessage('Amend requires a complete medication line.');
      return;
    }
    setViewState('loading');
    try {
      const updated = await amendPrescription(
        token,
        selectedPrescriptionId,
        [
          {
            clinical_concept_code: amendConceptCode.trim(),
            clinical_concept_label: amendConceptLabel.trim(),
            dosage_instructions: amendDosage.trim(),
            quantity_authorized: amendQty.trim(),
          },
        ],
        newIdempotencyKey('amend'),
      );
      setSelectedPrescription(updated);
      setConfirmAmendRx(false);
      setShowAmendForm(false);
      const list = await fetchPrescriptions(token);
      setPrescriptions(list.prescriptions ?? []);
      setViewState('idle');
    } catch (err) {
      handleError(err);
    }
  };

  const approveRefill = async (id: string) => {
    if (!token) {
      return;
    }
    setRefillBusyId(id);
    setRefillMessage(null);
    try {
      await approveDoctorRefillRequest(token, id, newIdempotencyKey('refill-approve'));
      setRefillMessage(`Refill ${id.slice(0, 8)} approved.`);
      const refills = await fetchDoctorRefillRequests(token);
      setRefillRequests(refills.requests ?? []);
    } catch (err) {
      handleError(err);
    } finally {
      setRefillBusyId(null);
    }
  };

  const rejectRefill = async (id: string) => {
    if (!token) {
      return;
    }
    setRefillBusyId(id);
    setRefillMessage(null);
    try {
      await rejectDoctorRefillRequest(token, id, newIdempotencyKey('refill-reject'));
      setRefillMessage(`Refill ${id.slice(0, 8)} rejected.`);
      const refills = await fetchDoctorRefillRequests(token);
      setRefillRequests(refills.requests ?? []);
    } catch (err) {
      handleError(err);
    } finally {
      setRefillBusyId(null);
    }
  };

  const startPrescribeFromAppointment = () => {
    const encounterId = selectedAppointment?.encounter?.id;
    if (!encounterId) {
      return;
    }
    setSelectedAppointmentId(null);
    setTab('prescriptions');
    setRxEncounterId(encounterId);
    setRxStep('compose');
    setRxConfirmIssue(false);
    void loadRxContext(encounterId);
  };

  if (screen === 'sign-in') {
    return (
      <NativeOtpSignIn
        portalTitle="World Pharma Clinician"
        portalDescription="Consult queue, video, prescriptions, and patient records for verified doctors."
        audience="doctor"
        staffEmail="sandbox-doctor@dev.local"
        onAuthenticated={({ accessToken, refreshToken }) => {
          store.authenticate({
            accessToken,
            refreshToken,
            audience: 'doctor',
          });
          syncSession();
          setViewState('idle');
        }}
      />
    );
  }

  if (screen === 'expired') {
    return (
      <SafeAreaView style={{ flex: 1 }}>
        <NativeSessionExpiredState
          onAction={() => {
            store.signOut();
            syncSession();
            setSelectedAppointmentId(null);
            setSelectedPrescriptionId(null);
            setSelectedPrescription(null);
            setSelectedHealthPatientId(null);
            setSelectedHealthArtifactId(null);
          }}
        />
      </SafeAreaView>
    );
  }

  if (screen === 'appointment-detail' && selectedAppointment) {
    return (
      <SafeAreaView style={{ flex: 1 }}>
        <View style={{ flex: 1, padding: 16, gap: 12 }}>
          <NativeButton label="Back" variant="secondary" onPress={() => setSelectedAppointmentId(null)} />
          <NativeText variant="h2">{selectedAppointment.status}</NativeText>
          <NativeText>{selectedAppointment.starts_at ?? selectedAppointment.id.slice(0, 8)}</NativeText>
          {viewState === 'loading' ? <NativeLoadingState /> : null}
          {viewState === 'forbidden' ? (
            <OpsAccessGate
              detail={denyDetail}
              staffEmail="sandbox-doctor@dev.local"
              onRetry={() => void loadTab()}
              onSignOut={() => {
                store.signOut();
                syncSession();
                setDenyDetail(null);
                setViewState('idle');
              }}
            />
          ) : null}
          {viewState === 'network' ? <NativeNetworkErrorState onRetry={() => void runEncounter('check-in')} /> : null}
          {viewState === 'idle' ? (
            <>
              <NativeCard>
                <NativeText variant="caption">Clinical access (server-evaluated)</NativeText>
                {Object.keys(accessRows).length === 0 ? (
                  <NativeText variant="caption">Access state unavailable for this appointment.</NativeText>
                ) : (
                  Object.entries(accessRows).map(([purpose, evaluation]) => {
                    const row = accessReasonLabel(evaluation.reason);
                    return <NativeText key={purpose} variant="caption">{`${purpose}: ${row.label}`}</NativeText>;
                  })
                )}
              </NativeCard>
              <NativeCard>
                {availableEncounterActions(selectedAppointment.status).map((action) => (
                  <NativeButton
                    key={action}
                    label={
                      action === 'confirm'
                        ? 'Confirm'
                        : action === 'check-in'
                          ? 'Check in'
                          : action === 'start'
                            ? 'Start consult'
                            : 'Complete'
                    }
                    variant={action === 'confirm' ? 'primary' : 'secondary'}
                    onPress={() => void runEncounter(action)}
                  />
                ))}
                {availableEncounterSecondaryActions(selectedAppointment.status).map((action) => (
                  <NativeButton
                    key={action}
                    label={action === 'cancel' ? 'Cancel appointment' : 'Mark no-show'}
                    variant="secondary"
                    onPress={() => void runSecondaryEncounter(action)}
                  />
                ))}
                {selectedAppointment.status.toUpperCase() === 'IN_CONSULTATION' ? (
                  <NativeInput
                    label="Patient summary"
                    value={patientSummary}
                    onChangeText={setPatientSummary}
                    placeholder="Minimum 8 characters"
                  />
                ) : null}
                {selectedAppointment.encounter?.id ? (
                  <NativeButton label="Prescribe" onPress={startPrescribeFromAppointment} />
                ) : (
                  <NativeText variant="caption">Check in to create an encounter before prescribing.</NativeText>
                )}
              </NativeCard>
              {token && selectedAppointmentId ? (
                <NativeConsultVideoPanel
                  role="doctor"
                  token={token}
                  appointmentId={selectedAppointmentId}
                  appointmentType={selectedAppointment.type}
                  canEndVideo
                />
              ) : null}
            </>
          ) : null}
        </View>
      </SafeAreaView>
    );
  }

  if (screen === 'patient-health' && token && selectedHealthPatientId) {
    return (
      <SafeAreaView style={{ flex: 1 }}>
        <View style={{ flex: 1, padding: 16, gap: 12 }}>
          <DoctorHealthTimelineScreen
            token={token}
            patientPersonId={selectedHealthPatientId}
            countryCode={healthCountryCode}
            onUnauthorized={() => {
              store.expire();
              syncSession();
            }}
            onOpenArtifact={(artifactId) => setSelectedHealthArtifactId(artifactId)}
            onBack={() => setSelectedHealthPatientId(null)}
          />
        </View>
      </SafeAreaView>
    );
  }

  if (screen === 'health-artifact' && token && selectedHealthPatientId && selectedHealthArtifactId) {
    return (
      <SafeAreaView style={{ flex: 1 }}>
        <View style={{ flex: 1, padding: 16, gap: 12 }}>
          <DoctorHealthArtifactScreen
            token={token}
            patientPersonId={selectedHealthPatientId}
            artifactId={selectedHealthArtifactId}
            countryCode={healthCountryCode}
            onUnauthorized={() => {
              store.expire();
              syncSession();
            }}
            onBack={() => setSelectedHealthArtifactId(null)}
          />
        </View>
      </SafeAreaView>
    );
  }

  if (screen === 'prescription-detail' && selectedPrescription) {
    const currentLines =
      selectedPrescription.versions?.find((v) => v.id === selectedPrescription.current_version_id)?.lines ??
      selectedPrescription.versions?.[selectedPrescription.versions.length - 1]?.lines ??
      [];
    return (
      <SafeAreaView style={{ flex: 1 }}>
        <View style={{ flex: 1, padding: 16, gap: 12 }}>
          <NativeButton
            label="Back"
            variant="secondary"
            onPress={() => {
              setSelectedPrescriptionId(null);
              setSelectedPrescription(null);
            }}
          />
          <NativeText variant="h2">{selectedPrescription.status}</NativeText>
          <NativeText variant="caption">{`v${selectedPrescription.current_version_number ?? '—'} · ${selectedPrescription.id.slice(0, 8)}`}</NativeText>
          {selectedPrescription.dispensing_status ? (
            <NativeText variant="caption">{`Dispensing: ${selectedPrescription.dispensing_status}`}</NativeText>
          ) : null}
          {selectedPrescription.commercial_status ? (
            <NativeText variant="caption">{`Commercial: ${selectedPrescription.commercial_status}`}</NativeText>
          ) : null}
          {viewState === 'loading' ? <NativeLoadingState /> : null}
          {viewState === 'forbidden' ? (
            <OpsAccessGate
              detail={denyDetail}
              staffEmail="sandbox-doctor@dev.local"
              onRetry={() => void loadTab()}
              onSignOut={() => {
                store.signOut();
                syncSession();
                setDenyDetail(null);
                setViewState('idle');
              }}
            />
          ) : null}
          {viewState === 'network' ? <NativeNetworkErrorState onRetry={() => void openPrescription(selectedPrescription.id)} /> : null}
          {viewState === 'idle' ? (
            <NativeCard>
              {currentLines.map((line, index) => (
                <NativeText key={`${line.clinical_concept_code}-${index}`} variant="caption">
                  {`${line.line_number ?? index + 1}. ${line.clinical_concept_label} · ${line.dosage_instructions}`}
                </NativeText>
              ))}
              {rxMessage ? <NativeText variant="caption">{rxMessage}</NativeText> : null}
              {selectedPrescription.status === 'DRAFT' ? (
                <>
                  <NativeButton
                    label={rxConfirmIssue ? 'Confirmed — ready to issue' : 'Tap to confirm issue'}
                    variant="secondary"
                    onPress={() => setRxConfirmIssue((v) => !v)}
                  />
                  <NativeButton label="Issue prescription" onPress={() => void runIssue()} />
                </>
              ) : null}
              {selectedPrescription.status === 'ISSUED' ? (
                <>
                  <NativeButton
                    label={showAmendForm ? 'Hide amend' : 'Amend (new version)'}
                    variant="secondary"
                    onPress={() => {
                      setShowAmendForm((v) => !v);
                      setConfirmAmendRx(false);
                      const first = currentLines[0];
                      if (first) {
                        setAmendConceptCode(first.clinical_concept_code);
                        setAmendConceptLabel(first.clinical_concept_label);
                        setAmendDosage(first.dosage_instructions);
                        setAmendQty(first.quantity_authorized ?? '');
                      }
                    }}
                  />
                  {showAmendForm ? (
                    <>
                      <NativeInput label="Concept code" value={amendConceptCode} onChangeText={setAmendConceptCode} />
                      <NativeInput label="Concept label" value={amendConceptLabel} onChangeText={setAmendConceptLabel} />
                      <NativeInput label="Dosage" value={amendDosage} onChangeText={setAmendDosage} />
                      <NativeInput label="Quantity" value={amendQty} onChangeText={setAmendQty} />
                      <NativeButton
                        label={confirmAmendRx ? 'Amendment confirmed' : 'Confirm amendment'}
                        variant="secondary"
                        onPress={() => setConfirmAmendRx((v) => !v)}
                      />
                      <NativeButton label="Submit amendment" onPress={() => void runAmendRx()} />
                    </>
                  ) : null}
                </>
              ) : null}
              {selectedPrescription.status === 'DRAFT' || selectedPrescription.status === 'ISSUED' ? (
                <>
                  <NativeButton
                    label={confirmCancelRx ? 'Cancel confirmed' : 'Confirm cancel'}
                    variant="secondary"
                    onPress={() => setConfirmCancelRx((v) => !v)}
                  />
                  <NativeButton label="Cancel prescription" onPress={() => void runCancelRx()} />
                </>
              ) : null}
            </NativeCard>
          ) : null}
        </View>
      </SafeAreaView>
    );
  }

  const displayName =
    profile?.profile?.display_name ?? profile?.profile?.professional_name ?? profile?.display_name ?? null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#07111A' }} accessibilityLabel="World Pharma doctor mobile shell">
      <OpsShell
        product="Clinician"
        accent="#4FD1C5"
        status={displayName ?? 'On duty'}
        tabs={DOCTOR_TABS}
        active={
          tab === 'dashboard' ||
          tab === 'appointments' ||
          tab === 'prescriptions' ||
          tab === 'patients' ||
          tab === 'settings'
            ? tab
            : 'settings'
        }
        onSelect={(id) => setTab(id as DoctorMobileTab)}
      >

        {viewState === 'loading' ? <NativeLoadingState mode="dark" /> : null}
        {viewState === 'forbidden' ? (
          <OpsAccessGate
            detail={denyDetail}
            staffEmail="sandbox-doctor@dev.local"
            onRetry={() => void loadTab()}
            onSignOut={() => {
              store.signOut();
              syncSession();
              setDenyDetail(null);
              setViewState('idle');
            }}
          />
        ) : null}
        {viewState === 'network' ? <NativeNetworkErrorState onRetry={() => void loadTab()} /> : null}

        {viewState === 'idle' && tab === 'dashboard' ? (
          <>
            <OpsKpiRow
              items={[
                { label: 'Queue', value: appointments.length },
                { label: 'Rx', value: prescriptions.length },
                { label: 'Refills', value: refillRequests.length },
              ]}
            />
            <NativeCard>
              <NativeText variant="h2">{displayName ?? 'Clinician'}</NativeText>
              <NativeText variant="caption">{availabilitySummary ?? 'Set availability from More'}</NativeText>
              {earningsSummary ? <NativeText variant="caption">{earningsSummary}</NativeText> : null}
            </NativeCard>
            {appointments[0] ? (
              <OpsWorkCard
                kicker="NEXT"
                title={appointments[0].starts_at ?? appointments[0].id.slice(0, 8)}
                meta={appointments[0].status}
                status="Open consult"
                onOpen={() => setSelectedAppointmentId(appointments[0]!.id)}
                actionLabel="Open consult"
                onAction={() => setSelectedAppointmentId(appointments[0]!.id)}
              />
            ) : (
              <NativeEmptyState title="No consults yet" description="Today's queue appears after bookings." />
            )}
          </>
        ) : null}

        {viewState === 'idle' && tab === 'profile' ? (
          <NativeCard>
            <NativeText>{displayName ?? 'No display name'}</NativeText>
            <NativeText variant="caption">{`Country: ${profile?.country_code ?? '—'}`}</NativeText>
            <NativeText variant="caption">{`Timezone: ${profile?.profile?.timezone ?? '—'}`}</NativeText>
          </NativeCard>
        ) : null}

        {viewState === 'idle' && tab === 'credentials' ? (
          <>
            {credentials.length ? (
              credentials.map((row) => (
                <NativeCard key={row.id}>
                  <NativeText>{`${row.credential_type} · ${row.status}`}</NativeText>
                  <NativeText variant="caption">{`${row.issuer} · ${row.number_masked}`}</NativeText>
                </NativeCard>
              ))
            ) : (
              <NativeEmptyState title="No credentials" description="Submit a credential for review." />
            )}
            <NativeCard>
              <NativeInput label="Type" value={credType} onChangeText={setCredType} />
              <NativeInput label="Issuer" value={credIssuer} onChangeText={setCredIssuer} />
              <NativeInput label="Number" value={credNumber} onChangeText={setCredNumber} />
              <NativeButton
                label="Submit credential"
                onPress={() =>
                  void (async () => {
                    if (!token || !credType.trim() || !credIssuer.trim() || !credNumber.trim()) {
                      return;
                    }
                    setViewState('loading');
                    try {
                      await submitCredential(token, {
                        credential_type: credType.trim(),
                        issuer: credIssuer.trim(),
                        number: credNumber.trim(),
                      });
                      setCredType('');
                      setCredIssuer('');
                      setCredNumber('');
                      await loadTab();
                    } catch (err) {
                      handleError(err);
                    }
                  })()
                }
              />
            </NativeCard>
          </>
        ) : null}

        {viewState === 'idle' && tab === 'organizations' ? (
          organizations.length ? (
            organizations.map((row, index) => (
              <NativeCard key={`${row.organization_id ?? index}`}>
                <NativeText>{row.organization_name ?? 'Organization'}</NativeText>
                <NativeText variant="caption">{`${row.role ?? 'member'} · ${row.status ?? '—'}`}</NativeText>
              </NativeCard>
            ))
          ) : (
            <NativeEmptyState title="No organizations" description="Memberships appear when assigned." />
          )
        ) : null}

        {viewState === 'idle' && tab === 'availability' ? (
          <NativeCard>
            <NativeText>{availabilitySummary ?? 'No windows'}</NativeText>
            <NativeButton
              label="Set weekday 09:00–17:00 UTC"
              onPress={() =>
                void (async () => {
                  if (!token) return;
                  setViewState('loading');
                  try {
                    await saveAvailability(token);
                    await loadTab();
                  } catch (err) {
                    handleError(err);
                  }
                })()
              }
            />
          </NativeCard>
        ) : null}

        {viewState === 'idle' && tab === 'appointments' ? (
          appointments.length ? (
            appointments.map((row) => (
              <OpsWorkCard
                key={row.id}
                kicker="CONSULT"
                title={row.starts_at ?? row.id.slice(0, 8)}
                meta={row.status}
                status="Queue"
                onOpen={() => setSelectedAppointmentId(row.id)}
                actionLabel="Open"
                onAction={() => setSelectedAppointmentId(row.id)}
              />
            ))
          ) : (
            <NativeEmptyState title="No appointments" description="Upcoming visits appear here." />
          )
        ) : null}

        {viewState === 'idle' && tab === 'refill-requests' ? (
          <NativeCard>
            <NativeText variant="h2">Pending refill requests</NativeText>
            <NativeText variant="caption">
              Explicit approve/reject only — R5-E fail-closed re-authorization.
            </NativeText>
            {refillMessage ? <NativeText variant="caption">{refillMessage}</NativeText> : null}
            {!refillRequests.length ? (
              <NativeEmptyState title="No pending refills" description="Patient refill requests appear here." />
            ) : (
              refillRequests.map((row) => (
                <View key={row.id} style={{ gap: 8, marginTop: 8 }}>
                  <NativeText>{`${row.status} · Rx ${row.prescription_id.slice(0, 8)} · ${row.id.slice(0, 8)}`}</NativeText>
                  {refillBusyId === row.id ? <NativeLoadingState title="Saving decision" /> : null}
                  {refillBusyId !== row.id && row.status === 'PENDING_REAUTH' ? (
                    <>
                      <NativeButton label="Approve" onPress={() => void approveRefill(row.id)} />
                      <NativeButton label="Reject" variant="secondary" onPress={() => void rejectRefill(row.id)} />
                    </>
                  ) : null}
                </View>
              ))
            )}
          </NativeCard>
        ) : null}

        {viewState === 'idle' && tab === 'prescriptions' ? (
          <>
            {prescriptions.length ? (
              prescriptions.map((row) => (
                <OpsWorkCard
                  key={row.id}
                  kicker="RX"
                  title={`${row.status} · v${row.current_version_number ?? '—'}`}
                  meta={row.id.slice(0, 8)}
                  onOpen={() => void openPrescription(row.id)}
                  actionLabel="Open"
                  onAction={() => void openPrescription(row.id)}
                />
              ))
            ) : (
              <NativeEmptyState title="No prescriptions" description="Select an encounter, compose lines, review, then issue." />
            )}
            <NativeCard>
              <NativeText variant="caption">
                {rxStep === 'review' ? 'Review before issue' : 'Compose prescription (OD-R5B-02 draft-lines PATCH deferred)'}
              </NativeText>
              {rxContext ? (
                <NativeText variant="caption">
                  {`Encounter ${rxContext.encounter_id.slice(0, 8)} · ${rxContext.country_code ?? '—'} · access ${rxContext.clinical_access_allowed ? 'ok' : rxContext.clinical_access_reason}`}
                </NativeText>
              ) : null}
              {rxMessage ? <NativeText variant="caption">{rxMessage}</NativeText> : null}
              {rxStep === 'compose' ? (
                <>
                  <NativeText variant="caption">Authorized encounters</NativeText>
                  {appointments
                    .filter((row) => row.encounter?.id)
                    .map((row) => (
                      <NativeButton
                        key={row.id}
                        label={`${row.status} · enc ${row.encounter!.id.slice(0, 8)}`}
                        variant={rxEncounterId === row.encounter!.id ? 'primary' : 'secondary'}
                        onPress={() => void loadRxContext(row.encounter!.id)}
                      />
                    ))}
                  <NativeInput label="Encounter ID" value={rxEncounterId} onChangeText={setRxEncounterId} />
                  <NativeButton
                    label="Load prescribe context"
                    variant="secondary"
                    onPress={() => void loadRxContext(rxEncounterId)}
                  />
                  <NativeInput label="Concept code" value={rxConceptCode} onChangeText={setRxConceptCode} />
                  <NativeInput label="Concept label" value={rxConceptLabel} onChangeText={setRxConceptLabel} />
                  <NativeInput label="Dosage" value={rxDosage} onChangeText={setRxDosage} />
                  <NativeInput label="Quantity" value={rxQty} onChangeText={setRxQty} />
                  <NativeButton label="Review before issue" onPress={goToRxReview} />
                  <NativeButton label="Save draft only" variant="secondary" onPress={() => void runCreateDraft()} />
                </>
              ) : (
                <>
                  <NativeText>{`Patient locale context loaded · encounter ${rxEncounterId.slice(0, 8)}`}</NativeText>
                  <NativeText variant="caption">{`${rxConceptLabel} · ${rxDosage} · qty ${rxQty}`}</NativeText>
                  <NativeText variant="caption">Validity set by pack/policy when available.</NativeText>
                  <NativeButton
                    label={rxConfirmIssue ? 'Confirmed — ready to issue' : 'I am issuing this prescription'}
                    variant="secondary"
                    onPress={() => setRxConfirmIssue((v) => !v)}
                  />
                  <NativeButton label="Back to edit" variant="secondary" onPress={() => setRxStep('compose')} />
                  <NativeButton label="Issue prescription" onPress={() => void runCreateAndIssue()} />
                </>
              )}
            </NativeCard>
          </>
        ) : null}

        {viewState === 'idle' && tab === 'patients' && token ? (
          <>
            <DoctorHealthCountryInput
              countryCode={healthCountryCode}
              onChange={(value) => setHealthCountryCode(value || DEFAULT_COUNTRY)}
            />
            <DoctorHealthPatientPicker
              token={token}
              countryCode={healthCountryCode}
              onUnauthorized={() => {
                store.expire();
                syncSession();
              }}
              onSelectPatient={(patientPersonId) => {
                setSelectedHealthPatientId(patientPersonId);
                setSelectedHealthArtifactId(null);
              }}
            />
          </>
        ) : null}

        {viewState === 'idle' && tab === 'inbox' && token ? <DoctorInboxScreen token={token} /> : null}

        {viewState === 'idle' && tab === 'settings' && opsSubScreen === 'inbox' && token ? (
          <>
            <NativeButton label="Back to settings" variant="secondary" onPress={() => setOpsSubScreen(null)} />
            <DoctorInboxScreen token={token} />
          </>
        ) : null}

        {viewState === 'idle' && tab === 'settings' && opsSubScreen === 'support' && token ? (
          <>
            <NativeButton label="Back to settings" variant="secondary" onPress={() => setOpsSubScreen(null)} />
            <DoctorSupportScreen token={token} />
          </>
        ) : null}

        {viewState === 'idle' && tab === 'settings' && !opsSubScreen ? (
          <>
            <NativePageHeader title="Settings" subtitle="Alerts, inbox, and support for your clinic login." />
            <NativeText variant="caption">{prefSummary ?? 'Preferences unavailable'}</NativeText>
            <NativeListSection title="Clinic">
              <NativeListRow label="Profile" hint="Name, country, timezone" onPress={() => setTab('profile')} />
              <NativeListRow label="Credentials" hint="License review" onPress={() => setTab('credentials')} />
              <NativeListRow label="Organizations" onPress={() => setTab('organizations')} />
              <NativeListRow label="Availability" onPress={() => setTab('availability')} />
              <NativeListRow label="Refill requests" hint="Approve or reject" onPress={() => setTab('refill-requests')} />
            </NativeListSection>
            <NativeListSection title="Account">
              <NativeListRow label="Inbox" hint="Appointment notices" onPress={() => setOpsSubScreen('inbox')} />
              <NativeListRow label="Support" hint="Get help" onPress={() => setOpsSubScreen('support')} />
            </NativeListSection>
          </>
        ) : null}

        <NativeButton
          label="Sign out"
          variant="secondary"
          onPress={() => {
            store.signOut();
            syncSession();
            setSelectedAppointmentId(null);
            setSelectedPrescriptionId(null);
            setSelectedPrescription(null);
            setSelectedHealthPatientId(null);
            setSelectedHealthArtifactId(null);
          }}
        />
      </OpsShell>
    </SafeAreaView>
  );
}
