import { useCallback, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import {
  NativeButton,
  NativeCard,
  NativeEmptyState,
  NativeInput,
  NativeLoadingState,
  NativeText,
} from '@world-pharma/ui-kit/native';
import type { FeatureCtx } from './customer-features';
import { addCartItem, newIdempotencyKey } from './commerce-api';
import {
  createMedicationReminder,
  deleteMedicationReminder,
  fetchMedicationReminders,
  fetchReminderBuyAgain,
  updateMedicationReminder,
} from './medication-reminder-api';
import {
  buildTodaysDoses,
  daysSummary,
  DOSE_TIME_PRESETS,
  scheduleSummary,
  type MedicationReminder,
} from './medication-reminder-ui';

export function MedicationRemindersScreen({
  ctx,
  country,
  onOpenSubscriptions,
}: {
  ctx: FeatureCtx;
  country: string;
  onOpenSubscriptions?: () => void;
}) {
  const [reminders, setReminders] = useState<MedicationReminder[]>([]);
  const [medicineLabel, setMedicineLabel] = useState('');
  const [selectedTimes, setSelectedTimes] = useState<string[]>(['08:00']);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    ctx.setViewState('loading');
    const result = await fetchMedicationReminders({
      token: ctx.token,
      country,
      onUnauthorized: ctx.onUnauthorized,
    });
    if (result.ok) {
      setReminders(result.data.reminders ?? []);
      ctx.setViewState('idle');
      return;
    }
    if (result.status === 401) {
      ctx.onUnauthorized();
      return;
    }
    ctx.setViewState('network');
  }, [ctx, country]);

  useEffect(() => {
    void load();
  }, [load]);

  const todaysDoses = useMemo(() => buildTodaysDoses(reminders), [reminders]);

  const toggleTime = (time: string) => {
    setSelectedTimes((prev) =>
      prev.includes(time) ? prev.filter((t) => t !== time) : [...prev, time].sort(),
    );
  };

  const saveReminder = useCallback(async () => {
    if (!medicineLabel.trim() || selectedTimes.length === 0) {
      setError('Enter medicine name and at least one time.');
      return;
    }
    setBusy(true);
    setError(null);
    const result = await createMedicationReminder({
      token: ctx.token,
      country,
      onUnauthorized: ctx.onUnauthorized,
      input: {
        medicine_label: medicineLabel.trim(),
        schedule_times: selectedTimes,
      },
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error || 'Could not save reminder.');
      return;
    }
    setReminders((prev) => [result.data, ...prev]);
    setMedicineLabel('');
    setSelectedTimes(['08:00']);
  }, [country, ctx, medicineLabel, selectedTimes]);

  return (
    <View style={{ gap: 12 }}>
      <NativeButton label="Back" variant="secondary" onPress={ctx.onBack} />
      <NativeText variant="h2">Medicine reminders</NativeText>
      <NativeText variant="caption">Daily dose schedule — personal wellness nudges, not medical advice.</NativeText>
      {ctx.viewState === 'loading' ? <NativeLoadingState title="Loading reminders" /> : null}
      {ctx.viewState === 'idle' ? (
        <>
          <NativeText variant="caption">{`Today: ${todaysDoses.length} dose(s)`}</NativeText>
          {todaysDoses.map((dose) => (
            <NativeCard key={`${dose.reminder_id}-${dose.time}`}>
              <NativeText>{`${dose.time_label} · ${dose.medicine_label}`}</NativeText>
            </NativeCard>
          ))}
          <NativeInput
            label="Medicine name"
            value={medicineLabel}
            onChangeText={setMedicineLabel}
            placeholder="Metformin 500mg"
          />
          <NativeText variant="caption">Times</NativeText>
          {DOSE_TIME_PRESETS.map((preset) => (
            <NativeButton
              key={preset.id}
              label={`${preset.label} (${scheduleSummary([preset.time])})${selectedTimes.includes(preset.time) ? ' ✓' : ''}`}
              variant={selectedTimes.includes(preset.time) ? 'primary' : 'secondary'}
              onPress={() => toggleTime(preset.time)}
            />
          ))}
          {error ? <NativeText variant="caption">{error}</NativeText> : null}
          {!busy ? (
            <NativeButton label="Save reminder" onPress={() => void saveReminder()} />
          ) : (
            <NativeLoadingState title="Saving" />
          )}
          {reminders.length === 0 ? (
            <NativeEmptyState title="No reminders" description="Add medicines you take daily." />
          ) : (
            reminders.map((row) => (
              <NativeCard key={row.id}>
                <NativeText>{row.medicine_label}</NativeText>
                <NativeText variant="caption">{scheduleSummary(row.schedule_times)}</NativeText>
                <NativeText variant="caption">{daysSummary(row.days_of_week)}</NativeText>
                <NativeText variant="caption">{row.enabled ? 'On' : 'Paused'}</NativeText>
                <NativeButton
                  label={row.enabled ? 'Pause' : 'Resume'}
                  variant="secondary"
                  onPress={() => {
                    void updateMedicationReminder({
                      token: ctx.token,
                      id: row.id,
                      onUnauthorized: ctx.onUnauthorized,
                      input: { enabled: !row.enabled },
                    }).then((result) => {
                      if (result.ok) {
                        setReminders((prev) => prev.map((r) => (r.id === row.id ? result.data : r)));
                      }
                    });
                  }}
                />
                <NativeButton
                  label="Remove"
                  variant="secondary"
                  onPress={() => {
                    void deleteMedicationReminder({
                      token: ctx.token,
                      id: row.id,
                      onUnauthorized: ctx.onUnauthorized,
                    }).then((result) => {
                      if (result.ok) {
                        setReminders((prev) => prev.filter((r) => r.id !== row.id));
                      }
                    });
                  }}
                />
                <NativeButton
                  label="Buy again"
                  variant="secondary"
                  onPress={() => {
                    void fetchReminderBuyAgain({
                      token: ctx.token,
                      id: row.id,
                      country,
                      onUnauthorized: ctx.onUnauthorized,
                    }).then(async (result) => {
                      if (!result.ok) {
                        setError('Could not check buy again.');
                        return;
                      }
                      if (!result.data.eligible || !result.data.offer_id) {
                        setError(result.data.reason ?? 'Buy again unavailable.');
                        return;
                      }
                      setError(null);
                      await addCartItem(
                        ctx.token,
                        country,
                        result.data.offer_id,
                        result.data.qty ?? 1,
                        newIdempotencyKey('reminder-buy'),
                      );
                    });
                  }}
                />
              </NativeCard>
            ))
          )}
          <NativeButton
            label="Refill subscriptions"
            variant="secondary"
            onPress={() => onOpenSubscriptions?.()}
          />
        </>
      ) : null}
    </View>
  );
}
