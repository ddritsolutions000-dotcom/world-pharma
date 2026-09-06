'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from '@world-pharma/shell-web';
import {
  EmptyState,
  LoadingState,
  NetworkErrorState,
  PermissionDeniedState,
  Text,
} from '@world-pharma/ui-kit/web';

import { fetchCustomerPrescriptions, type Prescription } from './care-api';
import {
  createMedicationReminder,
  deleteMedicationReminder,
  fetchMedicationReminders,
  updateMedicationReminder,
} from './medication-reminder-api';
import {
  buildTodaysDoses,
  daysSummary,
  DOSE_TIME_PRESETS,
  scheduleSummary,
  type MedicationReminder,
} from './medication-reminder-ui';
import { useSelectedCountry } from './use-selected-country';
import { MgBtn, MgCard, Page, PageIntro, Section, ServiceHero } from './ui/mg-ui';
import { ReminderBuyAgainButton } from './reminder-buy-again-button';

export function MedicationRemindersScreen() {
  const { session, getAccessToken, expire } = useSession();
  const { country: countryCode } = useSelectedCountry();
  const [reminders, setReminders] = useState<MedicationReminder[]>([]);
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<'network' | 'forbidden' | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [medicineLabel, setMedicineLabel] = useState('');
  const [selectedTimes, setSelectedTimes] = useState<string[]>(['08:00']);
  const [notes, setNotes] = useState('');

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token || session.status !== 'authenticated') {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [remBody, rxBody] = await Promise.all([
        fetchMedicationReminders(token, countryCode),
        fetchCustomerPrescriptions(token),
      ]);
      setReminders(remBody.reminders ?? []);
      setPrescriptions(rxBody.prescriptions ?? []);
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      if (status === 403) {
        setError('forbidden');
      } else if (status === 401) {
        expire();
      } else {
        setError('network');
      }
      setReminders([]);
    } finally {
      setLoading(false);
    }
  }, [countryCode, expire, getAccessToken, session.status]);

  useEffect(() => {
    if (session.status === 'authenticated') {
      void load();
    }
  }, [session.status, load]);

  const todaysDoses = useMemo(() => buildTodaysDoses(reminders), [reminders]);

  const rxLines = useMemo(() => {
    const lines: Array<{ label: string; prescriptionId: string }> = [];
    for (const rx of prescriptions) {
      if (rx.status === 'DRAFT' || rx.status === 'CANCELLED') {
        continue;
      }
      const version =
        rx.versions?.find((v) => v.id === rx.current_version_id) ?? rx.versions?.[rx.versions.length - 1];
      for (const line of version?.lines ?? []) {
        if (line.clinical_concept_label) {
          lines.push({ label: line.clinical_concept_label, prescriptionId: rx.id });
        }
      }
    }
    return lines;
  }, [prescriptions]);

  const toggleTime = (time: string) => {
    setSelectedTimes((prev) =>
      prev.includes(time) ? prev.filter((t) => t !== time) : [...prev, time].sort(),
    );
  };

  const submitReminder = useCallback(async () => {
    const token = getAccessToken();
    if (!token || !medicineLabel.trim() || selectedTimes.length === 0) {
      setFormError('Enter a medicine name and at least one time.');
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      const created = await createMedicationReminder(token, countryCode, {
        medicine_label: medicineLabel.trim(),
        schedule_times: selectedTimes,
        notes: notes.trim() || null,
      });
      setReminders((prev) => [created, ...prev]);
      setMedicineLabel('');
      setNotes('');
      setSelectedTimes(['08:00']);
      setShowForm(false);
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      if (status === 401) {
        expire();
        return;
      }
      setFormError((err as { message?: string }).message ?? 'Could not save reminder.');
    } finally {
      setBusy(false);
    }
  }, [countryCode, expire, getAccessToken, medicineLabel, notes, selectedTimes]);

  const importFromRx = useCallback(
    async (label: string, prescriptionId: string) => {
      const token = getAccessToken();
      if (!token) {
        return;
      }
      setBusy(true);
      setFormError(null);
      try {
        const created = await createMedicationReminder(token, countryCode, {
          medicine_label: label,
          prescription_id: prescriptionId,
          schedule_times: ['08:00', '20:00'],
        });
        setReminders((prev) => [created, ...prev]);
      } catch (err: unknown) {
        setFormError((err as { message?: string }).message ?? 'Could not import from prescription.');
      } finally {
        setBusy(false);
      }
    },
    [countryCode, getAccessToken],
  );

  const toggleEnabled = useCallback(
    async (row: MedicationReminder) => {
      const token = getAccessToken();
      if (!token) {
        return;
      }
      setBusy(true);
      try {
        const updated = await updateMedicationReminder(token, row.id, { enabled: !row.enabled });
        setReminders((prev) => prev.map((r) => (r.id === row.id ? updated : r)));
      } catch (err: unknown) {
        if ((err as { status?: number }).status === 401) {
          expire();
        }
      } finally {
        setBusy(false);
      }
    },
    [expire, getAccessToken],
  );

  const removeReminder = useCallback(
    async (id: string) => {
      const token = getAccessToken();
      if (!token) {
        return;
      }
      setBusy(true);
      try {
        await deleteMedicationReminder(token, id);
        setReminders((prev) => prev.filter((r) => r.id !== id));
      } catch (err: unknown) {
        if ((err as { status?: number }).status === 401) {
          expire();
        }
      } finally {
        setBusy(false);
      }
    },
    [expire, getAccessToken],
  );

  return (
    <Page>
      <ServiceHero
        kicker="Daily dose alerts"
        title="Medicine reminders"
        subtitle="Personal wellness nudges — not medical advice."
        compact
      />
      <PageIntro>
        <p>
          Set times to take your medicines. Push notifications go live with the mobile app; this sandbox shows your
          schedule and stores reminders securely.
        </p>
      </PageIntro>

      {session.status !== 'authenticated' ? (
        <MgCard>
          <Text tone="secondary">Sign in to create and manage medicine reminders.</Text>
          <MgBtn href="/login">Sign in</MgBtn>
        </MgCard>
      ) : null}

      {session.status === 'authenticated' && session.audience !== 'customer' ? <PermissionDeniedState /> : null}

      {session.status === 'authenticated' && session.audience === 'customer' ? (
        <>
          {loading ? <LoadingState label="Loading reminders" /> : null}
          {error === 'forbidden' ? <PermissionDeniedState /> : null}
          {error === 'network' ? (
            <NetworkErrorState action={{ label: 'Retry', onClick: () => void load() }} />
          ) : null}

          {!loading && !error ? (
            <>
              <Section title="Today's schedule">
                {todaysDoses.length === 0 ? (
                  <MgCard flat>
                    <Text tone="secondary">No doses scheduled for today.</Text>
                  </MgCard>
                ) : (
                  <ul className="mg-reminder-today">
                    {todaysDoses.map((dose) => (
                      <li key={`${dose.reminder_id}-${dose.time}`}>
                        <MgCard className="mg-reminder-today-card">
                          <span className="mg-reminder-time">{dose.time_label}</span>
                          <strong>{dose.medicine_label}</strong>
                        </MgCard>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>

              <Section title="Your reminders">
                <div className="mg-toolbar">
                  <MgBtn size="sm" onClick={() => setShowForm((v) => !v)}>
                    {showForm ? 'Cancel' : 'Add reminder'}
                  </MgBtn>
                  <MgBtn href="/subscriptions" variant="ghost" size="sm">
                    Refill reminders
                  </MgBtn>
                </div>
                {showForm ? (
                  <MgCard className="mg-reminder-form">
                    <label className="mg-field">
                      <span>Medicine name</span>
                      <input
                        value={medicineLabel}
                        onChange={(e) => setMedicineLabel(e.target.value)}
                        placeholder="e.g. Metformin 500mg"
                        maxLength={200}
                      />
                    </label>
                    <fieldset className="mg-reminder-times">
                      <legend>When to remind</legend>
                      <div className="mg-reminder-time-grid">
                        {DOSE_TIME_PRESETS.map((preset) => (
                          <label key={preset.id} className="mg-reminder-time-chip">
                            <input
                              type="checkbox"
                              checked={selectedTimes.includes(preset.time)}
                              onChange={() => toggleTime(preset.time)}
                            />
                            <span>{preset.label}</span>
                            <span className="mg-list-meta">{scheduleSummary([preset.time])}</span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                    <label className="mg-field">
                      <span>Notes (optional)</span>
                      <input
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Take after food"
                        maxLength={500}
                      />
                    </label>
                    {formError ? <Text tone="secondary">{formError}</Text> : null}
                    {!busy ? (
                      <MgBtn onClick={() => void submitReminder()}>Save reminder</MgBtn>
                    ) : (
                      <LoadingState label="Saving" />
                    )}
                  </MgCard>
                ) : null}

                {rxLines.length > 0 ? (
                  <MgCard flat>
                    <h3 className="mg-section-title">Add from prescription</h3>
                    <ul className="mg-order-list">
                      {rxLines.slice(0, 6).map((line) => (
                        <li key={`${line.prescriptionId}-${line.label}`}>
                          <MgBtn
                            variant="ghost"
                            size="sm"
                            disabled={busy}
                            onClick={() => void importFromRx(line.label, line.prescriptionId)}
                          >
                            {line.label}
                          </MgBtn>
                        </li>
                      ))}
                    </ul>
                  </MgCard>
                ) : null}

                {reminders.length === 0 ? (
                  <EmptyState
                    title="No reminders yet"
                    description="Add your daily medicines so you never miss a dose."
                  />
                ) : (
                  <ul className="mg-order-list">
                    {reminders.map((row) => (
                      <li key={row.id}>
                        <MgCard>
                          <div className="mg-reminder-head">
                            <strong>{row.medicine_label}</strong>
                            <span className={`mg-subscription-badge is-${row.enabled ? 'active' : 'paused'}`}>
                              {row.enabled ? 'On' : 'Paused'}
                            </span>
                          </div>
                          <p className="mg-list-meta">{scheduleSummary(row.schedule_times)}</p>
                          <p className="mg-list-meta">{daysSummary(row.days_of_week)}</p>
                          {row.notes ? <p className="mg-list-meta">{row.notes}</p> : null}
                          <div className="mg-toolbar">
                            <ReminderBuyAgainButton
                              token={getAccessToken() ?? ''}
                              countryCode={countryCode}
                              reminderId={row.id}
                              disabled={busy}
                            />
                            <MgBtn
                              variant="secondary"
                              size="sm"
                              disabled={busy}
                              onClick={() => void toggleEnabled(row)}
                            >
                              {row.enabled ? 'Pause' : 'Resume'}
                            </MgBtn>
                            <MgBtn variant="ghost" size="sm" disabled={busy} onClick={() => void removeReminder(row.id)}>
                              Remove
                            </MgBtn>
                          </div>
                        </MgCard>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>
            </>
          ) : null}
        </>
      ) : null}
    </Page>
  );
}
