'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from '@world-pharma/shell-web';
import {
  Button,
  Card,
  EmptyState,
  FormField,
  Heading,
  Input,
  LoadingState,
  NetworkErrorState,
  PermissionDeniedState,
  Text,
} from '@world-pharma/ui-kit/web';
import {
  amendDoctorPrescription,
  cancelDoctorPrescription,
  createDoctorPrescription,
  fetchDoctorAppointments,
  fetchDoctorPrescription,
  fetchDoctorPrescriptions,
  fetchPrescriptionContext,
  issueDoctorPrescription,
  newIdempotencyKey,
  type Prescription,
  type PrescriptionContext,
  type PrescriptionLineInput,
} from './doctor-api';

const emptyLine = (): PrescriptionLineInput => ({
  clinical_concept_code: '',
  clinical_concept_label: '',
  dosage_instructions: '',
  quantity_authorized: '',
});

type WizardStep = 'list' | 'select-encounter' | 'compose' | 'review' | 'detail';

const PRESCRIBE_ENCOUNTER_KEY = 'wp.doctor.prescribeEncounterId';

function prepareLines(lines: PrescriptionLineInput[]) {
  return lines.filter(
    (line) =>
      line.clinical_concept_code.trim() &&
      line.clinical_concept_label.trim() &&
      line.dosage_instructions.trim() &&
      line.quantity_authorized.trim(),
  );
}

export function DoctorPrescriptionsPanel() {
  const { getAccessToken, session, expire } = useSession();
  const [step, setStep] = useState<WizardStep>('list');
  const [rows, setRows] = useState<Prescription[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Prescription | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<'network' | 'forbidden' | 'error' | 'policy' | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [encounters, setEncounters] = useState<Array<{ encounterId: string; label: string }>>([]);
  const [encounterId, setEncounterId] = useState('');
  const [context, setContext] = useState<PrescriptionContext | null>(null);
  const [lines, setLines] = useState<PrescriptionLineInput[]>([emptyLine()]);
  const [confirmIssue, setConfirmIssue] = useState(false);
  const [amendLines, setAmendLines] = useState<PrescriptionLineInput[]>([emptyLine()]);
  const [showAmend, setShowAmend] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmAmend, setConfirmAmend] = useState(false);
  const [cancelReason, setCancelReason] = useState('cancel');

  const onUnauthorized = useCallback(() => expire(), [expire]);

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const result = await fetchDoctorPrescriptions({ token, onUnauthorized });
    if (!result.ok) {
      setError(result.kind === 'forbidden' ? 'forbidden' : result.kind === 'network' ? 'network' : 'error');
      setRows([]);
    } else {
      setRows(result.data.prescriptions ?? []);
    }
    setLoading(false);
  }, [getAccessToken, onUnauthorized]);

  const loadDetail = useCallback(
    async (id: string) => {
      const token = getAccessToken();
      if (!token) {
        return;
      }
      setSelectedId(id);
      setStep('detail');
      setDetailLoading(true);
      setMessage(null);
      setShowAmend(false);
      setConfirmCancel(false);
      setConfirmAmend(false);
      const result = await fetchDoctorPrescription({ token, onUnauthorized, id });
      if (!result.ok) {
        setMessage(result.error);
        setDetail(null);
      } else {
        setDetail(result.data);
      }
      setDetailLoading(false);
    },
    [getAccessToken, onUnauthorized],
  );

  const loadEncounterOptions = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    const result = await fetchDoctorAppointments({ token, onUnauthorized });
    if (!result.ok) {
      setMessage(result.error);
      return;
    }
    const options = (result.data.appointments ?? [])
      .filter((row) => row.encounter?.id)
      .map((row) => ({
        encounterId: row.encounter!.id,
        label: `${row.status} · ${row.starts_at ?? row.id.slice(0, 8)} · enc ${row.encounter!.id.slice(0, 8)}`,
      }));
    setEncounters(options);
  }, [getAccessToken, onUnauthorized]);

  useEffect(() => {
    if (session.status !== 'authenticated') {
      return;
    }
    void load();
    let pending: string | null = null;
    try {
      pending = sessionStorage.getItem(PRESCRIBE_ENCOUNTER_KEY);
      if (pending) {
        sessionStorage.removeItem(PRESCRIBE_ENCOUNTER_KEY);
      }
    } catch {
      pending = null;
    }
    if (!pending) {
      return;
    }
    const encounterFromAppointment = pending;
    setEncounterId(encounterFromAppointment);
    void (async () => {
      await loadEncounterOptions();
      const token = getAccessToken();
      if (!token) {
        setStep('select-encounter');
        return;
      }
      setBusy(true);
      const result = await fetchPrescriptionContext({
        token,
        onUnauthorized,
        encounterId: encounterFromAppointment,
      });
      setBusy(false);
      if (!result.ok) {
        setStep('select-encounter');
        setMessage(result.error);
        return;
      }
      setContext(result.data);
      if (!result.data.rx_prescribe_enabled) {
        setError('policy');
        setStep('select-encounter');
        setMessage('Prescribing is not enabled for this country pack.');
        return;
      }
      if (!result.data.clinical_access_allowed) {
        setError('forbidden');
        setStep('select-encounter');
        setMessage(`Clinical access not available (${result.data.clinical_access_reason}).`);
        return;
      }
      setStep('compose');
    })();
  }, [session.status, load, loadEncounterOptions, getAccessToken, onUnauthorized]);

  function updateLine(
    list: PrescriptionLineInput[],
    setList: (next: PrescriptionLineInput[]) => void,
    index: number,
    patch: Partial<PrescriptionLineInput>,
  ) {
    setList(list.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  async function selectEncounterAndContinue() {
    const token = getAccessToken();
    if (!token || !encounterId.trim()) {
      return;
    }
    setBusy(true);
    setMessage(null);
    setError(null);
    const result = await fetchPrescriptionContext({
      token,
      onUnauthorized,
      encounterId: encounterId.trim(),
    });
    setBusy(false);
    if (!result.ok) {
      if (result.kind === 'forbidden') {
        setError('forbidden');
      }
      setMessage(result.error);
      return;
    }
    setContext(result.data);
    if (!result.data.rx_prescribe_enabled) {
      setError('policy');
      setMessage('Prescribing is not enabled for this country pack.');
      return;
    }
    if (!result.data.clinical_access_allowed) {
      setError('forbidden');
      setMessage(`Clinical access not available (${result.data.clinical_access_reason}).`);
      return;
    }
    setStep('compose');
  }

  function goToReview() {
    const prepared = prepareLines(lines);
    if (!prepared.length) {
      setMessage('At least one complete medication line is required.');
      return;
    }
    setLines(prepared);
    setConfirmIssue(false);
    setMessage(null);
    setStep('review');
  }

  async function createDraftThenIssue() {
    const token = getAccessToken();
    if (!token || !encounterId.trim() || !confirmIssue) {
      setMessage('Confirm that you are issuing this prescription.');
      return;
    }
    const prepared = prepareLines(lines);
    if (!prepared.length) {
      setMessage('At least one complete medication line is required.');
      return;
    }
    setBusy(true);
    setMessage(null);
    const created = await createDoctorPrescription({
      token,
      onUnauthorized,
      encounter_id: encounterId.trim(),
      lines: prepared,
      idempotencyKey: newIdempotencyKey('create'),
    });
    if (!created.ok) {
      setBusy(false);
      setMessage(created.error);
      return;
    }
    const issued = await issueDoctorPrescription({
      token,
      onUnauthorized,
      id: created.data.id,
      idempotencyKey: newIdempotencyKey('issue'),
    });
    setBusy(false);
    if (!issued.ok) {
      setMessage(
        `Draft saved (${created.data.id.slice(0, 8)}…) but issue failed: ${issued.error}. Open the draft to retry issue.`,
      );
      void load();
      void loadDetail(created.data.id);
      return;
    }
    setMessage('Prescription issued.');
    setLines([emptyLine()]);
    setConfirmIssue(false);
    setContext(null);
    void load();
    void loadDetail(issued.data.id);
  }

  async function handleIssueDraft() {
    const token = getAccessToken();
    if (!token || !selectedId || !confirmIssue) {
      setMessage('Confirm that you are issuing this prescription.');
      return;
    }
    setBusy(true);
    setMessage(null);
    const result = await issueDoctorPrescription({
      token,
      onUnauthorized,
      id: selectedId,
      idempotencyKey: newIdempotencyKey('issue'),
    });
    setBusy(false);
    if (result.ok) {
      setMessage('Prescription issued.');
      setDetail(result.data);
      setConfirmIssue(false);
      void load();
    } else {
      setMessage(result.error);
    }
  }

  async function handleAmend() {
    const token = getAccessToken();
    if (!token || !selectedId || !confirmAmend) {
      setMessage('Confirm amendment (creates a new immutable version).');
      return;
    }
    const prepared = prepareLines(amendLines);
    if (!prepared.length) {
      setMessage('Amend requires at least one complete line.');
      return;
    }
    setBusy(true);
    setMessage(null);
    const result = await amendDoctorPrescription({
      token,
      onUnauthorized,
      id: selectedId,
      lines: prepared,
      idempotencyKey: newIdempotencyKey('amend'),
    });
    setBusy(false);
    if (result.ok) {
      setMessage('Prescription amended (new version). Prior version unchanged.');
      setAmendLines([emptyLine()]);
      setShowAmend(false);
      setConfirmAmend(false);
      setDetail(result.data);
      void load();
    } else {
      setMessage(result.error);
    }
  }

  async function handleCancel() {
    const token = getAccessToken();
    if (!token || !selectedId || !confirmCancel) {
      setMessage('Confirm cancellation.');
      return;
    }
    setBusy(true);
    setMessage(null);
    const result = await cancelDoctorPrescription({
      token,
      onUnauthorized,
      id: selectedId,
      reason_code: cancelReason.trim() || 'cancel',
      idempotencyKey: newIdempotencyKey('cancel'),
    });
    setBusy(false);
    if (result.ok) {
      setMessage('Prescription cancelled.');
      setDetail(result.data);
      setConfirmCancel(false);
      void load();
    } else {
      setMessage(result.error);
    }
  }

  const currentLines = useMemo(() => {
    if (!detail) {
      return [];
    }
    return (
      detail.versions?.find((v) => v.id === detail.current_version_id)?.lines ??
      detail.versions?.[detail.versions.length - 1]?.lines ??
      []
    );
  }, [detail]);

  if (session.status !== 'authenticated') {
    return <EmptyState title="Sign in required" description="Doctor session required to manage prescriptions." />;
  }

  if (loading && step === 'list') {
    return <LoadingState label="Loading prescriptions" />;
  }
  if (error === 'forbidden' && step === 'list') {
    return <PermissionDeniedState />;
  }
  if ((error === 'network' || error === 'error') && step === 'list') {
    return <NetworkErrorState action={{ label: 'Retry', onClick: () => void load() }} />;
  }

  return (
    <>
      <Text tone="secondary">
        R5-B prescribing: encounter → compose → review → issue. Customer cannot edit. OD-R5B-02 draft-line PATCH is
        deferred — recreate draft to change lines after create.
      </Text>
      {message ? <Text>{message}</Text> : null}
      {busy ? <LoadingState label="Saving prescription" /> : null}

      {step === 'list' ? (
        <>
          <Button
            size="sm"
            onClick={() => {
              setStep('select-encounter');
              setMessage(null);
              setError(null);
              setLines([emptyLine()]);
              setConfirmIssue(false);
              void loadEncounterOptions();
            }}
          >
            New prescription
          </Button>
          {rows.length === 0 ? (
            <EmptyState title="No prescriptions" description="Create a draft from an authorized encounter." />
          ) : (
            rows.map((row) => (
              <Button
                key={row.id}
                variant={selectedId === row.id ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => void loadDetail(row.id)}
              >
                {`${row.status} · v${row.current_version_number ?? '—'} · ${row.id.slice(0, 8)}`}
              </Button>
            ))
          )}
        </>
      ) : null}

      {step === 'select-encounter' ? (
        <Card>
          <Heading level={2}>Select encounter</Heading>
          <Text tone="secondary">Prescriptions must link to an authorized encounter. No orphan Rx.</Text>
          {error === 'policy' ? (
            <EmptyState title="Prescribing disabled" description="Not enabled by the published country pack." />
          ) : null}
          {error === 'forbidden' ? <PermissionDeniedState /> : null}
          {encounters.length === 0 ? (
            <EmptyState
              title="No encounters"
              description="Check in / start a consult from Appointments first, then return here."
            />
          ) : (
            encounters.map((row) => (
              <Button
                key={row.encounterId}
                size="sm"
                variant={encounterId === row.encounterId ? 'primary' : 'secondary'}
                onClick={() => setEncounterId(row.encounterId)}
              >
                {row.label}
              </Button>
            ))
          )}
          <FormField label="Encounter ID">
            {({ id }) => (
              <Input id={id} value={encounterId} onChange={(e) => setEncounterId(e.target.value)} />
            )}
          </FormField>
          <Button size="sm" disabled={busy || !encounterId.trim()} onClick={() => void selectEncounterAndContinue()}>
            Continue
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setStep('list')}>
            Back
          </Button>
        </Card>
      ) : null}

      {step === 'compose' ? (
        <Card>
          <Heading level={2}>Medication lines</Heading>
          {context ? (
            <Text size="caption">
              {`Encounter ${context.encounter_id.slice(0, 8)}… · patient ${context.patient_person_id.slice(0, 8)}… · ${context.country_code ?? '—'}`}
            </Text>
          ) : null}
          <Text size="caption" tone="secondary">
            Enter clinical medication concepts (not commercial SKUs as clinical truth). Catalog hints optional later.
          </Text>
          {lines.map((line, index) => (
            <Card key={`line-${index}`}>
              <Text size="caption">{`Line ${index + 1}`}</Text>
              <FormField label="Clinical concept code">
                {({ id }) => (
                  <Input
                    id={id}
                    value={line.clinical_concept_code}
                    onChange={(e) => updateLine(lines, setLines, index, { clinical_concept_code: e.target.value })}
                  />
                )}
              </FormField>
              <FormField label="Clinical concept label">
                {({ id }) => (
                  <Input
                    id={id}
                    value={line.clinical_concept_label}
                    onChange={(e) => updateLine(lines, setLines, index, { clinical_concept_label: e.target.value })}
                  />
                )}
              </FormField>
              <FormField label="Dosage instructions">
                {({ id }) => (
                  <Input
                    id={id}
                    value={line.dosage_instructions}
                    onChange={(e) => updateLine(lines, setLines, index, { dosage_instructions: e.target.value })}
                  />
                )}
              </FormField>
              <FormField label="Quantity authorized">
                {({ id }) => (
                  <Input
                    id={id}
                    value={line.quantity_authorized}
                    onChange={(e) => updateLine(lines, setLines, index, { quantity_authorized: e.target.value })}
                  />
                )}
              </FormField>
            </Card>
          ))}
          <Button size="sm" variant="secondary" onClick={() => setLines([...lines, emptyLine()])}>
            Add line
          </Button>
          <Button size="sm" onClick={goToReview}>
            Review
          </Button>
          <Button size="sm" variant="tertiary" onClick={() => setStep('select-encounter')}>
            Back
          </Button>
        </Card>
      ) : null}

      {step === 'review' ? (
        <Card>
          <Heading level={2}>Review before issue</Heading>
          {context ? (
            <>
              <Text>{`Patient ref: ${context.patient_person_id.slice(0, 8)}…`}</Text>
              <Text size="caption">{`Encounter: ${context.encounter_id.slice(0, 8)}… · ${context.encounter_status}`}</Text>
              <Text size="caption">{`Appointment: ${context.appointment_starts_at ?? '—'} · ${context.appointment_type ?? '—'}`}</Text>
              <Text size="caption">{`Country pack: ${context.country_code ?? '—'}`}</Text>
            </>
          ) : null}
          <Text>Medication lines</Text>
          {lines.map((line, index) => (
            <Text key={`rev-${index}`} size="caption">
              {`${index + 1}. ${line.clinical_concept_label} · ${line.dosage_instructions} · qty ${line.quantity_authorized}`}
            </Text>
          ))}
          <Text size="caption" tone="secondary">
            Validity dates are pack-driven when available; this screen does not invent retention periods.
          </Text>
          <label>
            <input type="checkbox" checked={confirmIssue} onChange={(e) => setConfirmIssue(e.target.checked)} /> I am
            issuing this prescription
          </label>
          <Button size="sm" disabled={busy || !confirmIssue} onClick={() => void createDraftThenIssue()}>
            Issue prescription
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setStep('compose')}>
            Back to edit
          </Button>
        </Card>
      ) : null}

      {step === 'detail' ? (
        <>
          <Button size="sm" variant="secondary" onClick={() => setStep('list')}>
            Back to list
          </Button>
          {detailLoading ? <LoadingState label="Loading detail" /> : null}
          {detail && !detailLoading ? (
            <Card>
              <Heading level={2}>Prescription</Heading>
              <Text>{`Status: ${detail.status}`}</Text>
              {detail.dispensing_status ? (
                <Text size="caption">{`Dispensing: ${detail.dispensing_status}`}</Text>
              ) : null}
              {detail.commercial_status ? (
                <>
                  <Text size="caption">Commercial status (read-only)</Text>
                  <Text size="caption">{detail.commercial_status}</Text>
                </>
              ) : null}
              <Text size="caption">{`Current version: ${detail.current_version_number ?? '—'}`}</Text>
              <Text size="caption">{`Encounter: ${detail.encounter_id?.slice(0, 8) ?? '—'}…`}</Text>
              {detail.versions?.map((v) => (
                <Text key={v.id} size="caption">
                  {`Version ${v.version_number}${v.id === detail.current_version_id ? ' (current)' : ''}${v.sealed_at ? ' · sealed' : ' · draft'}`}
                </Text>
              ))}
              {currentLines.map((line, index) => (
                <Text key={`${line.clinical_concept_code}-${index}`} size="caption">
                  {`${line.line_number ?? index + 1}. ${line.clinical_concept_label} · ${line.dosage_instructions} · qty ${line.quantity_authorized}`}
                </Text>
              ))}

              {detail.status === 'DRAFT' ? (
                <>
                  <Text size="caption" tone="secondary">
                    To change lines, cancel this draft and create a new one (OD-R5B-02 PATCH deferred).
                  </Text>
                  <label>
                    <input
                      type="checkbox"
                      checked={confirmIssue}
                      onChange={(e) => setConfirmIssue(e.target.checked)}
                    />{' '}
                    I am issuing this prescription
                  </label>
                  <Button size="sm" disabled={busy || !confirmIssue} onClick={() => void handleIssueDraft()}>
                    Issue
                  </Button>
                </>
              ) : null}

              {detail.status === 'ISSUED' ? (
                <>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setShowAmend(true);
                      setAmendLines(
                        currentLines.map((l) => ({
                          clinical_concept_code: l.clinical_concept_code,
                          clinical_concept_label: l.clinical_concept_label,
                          dosage_instructions: l.dosage_instructions,
                          quantity_authorized: l.quantity_authorized,
                          quantity_unit: l.quantity_unit ?? undefined,
                        })),
                      );
                    }}
                  >
                    Amend (new version)
                  </Button>
                </>
              ) : null}

              {detail.status === 'DRAFT' || detail.status === 'ISSUED' ? (
                <>
                  <FormField label="Cancel reason code">
                    {({ id }) => (
                      <Input id={id} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
                    )}
                  </FormField>
                  <label>
                    <input
                      type="checkbox"
                      checked={confirmCancel}
                      onChange={(e) => setConfirmCancel(e.target.checked)}
                    />{' '}
                    Confirm cancel
                  </label>
                  <Button size="sm" variant="tertiary" disabled={busy || !confirmCancel} onClick={() => void handleCancel()}>
                    Cancel prescription
                  </Button>
                </>
              ) : null}

              {showAmend ? (
                <Card>
                  <Heading level={3}>Amend</Heading>
                  <Text size="caption">Creates version N+1. Prior sealed version stays immutable.</Text>
                  {amendLines.map((line, index) => (
                    <Card key={`amd-${index}`}>
                      <FormField label="Clinical concept label">
                        {({ id }) => (
                          <Input
                            id={id}
                            value={line.clinical_concept_label}
                            onChange={(e) =>
                              updateLine(amendLines, setAmendLines, index, { clinical_concept_label: e.target.value })
                            }
                          />
                        )}
                      </FormField>
                      <FormField label="Dosage instructions">
                        {({ id }) => (
                          <Input
                            id={id}
                            value={line.dosage_instructions}
                            onChange={(e) =>
                              updateLine(amendLines, setAmendLines, index, { dosage_instructions: e.target.value })
                            }
                          />
                        )}
                      </FormField>
                      <FormField label="Quantity">
                        {({ id }) => (
                          <Input
                            id={id}
                            value={line.quantity_authorized}
                            onChange={(e) =>
                              updateLine(amendLines, setAmendLines, index, { quantity_authorized: e.target.value })
                            }
                          />
                        )}
                      </FormField>
                      <FormField label="Concept code">
                        {({ id }) => (
                          <Input
                            id={id}
                            value={line.clinical_concept_code}
                            onChange={(e) =>
                              updateLine(amendLines, setAmendLines, index, { clinical_concept_code: e.target.value })
                            }
                          />
                        )}
                      </FormField>
                    </Card>
                  ))}
                  <label>
                    <input
                      type="checkbox"
                      checked={confirmAmend}
                      onChange={(e) => setConfirmAmend(e.target.checked)}
                    />{' '}
                    Confirm amendment
                  </label>
                  <Button size="sm" disabled={busy || !confirmAmend} onClick={() => void handleAmend()}>
                    Submit amendment
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setShowAmend(false)}>
                    Close
                  </Button>
                </Card>
              ) : null}
            </Card>
          ) : null}
        </>
      ) : null}
    </>
  );
}

export { PRESCRIBE_ENCOUNTER_KEY };
