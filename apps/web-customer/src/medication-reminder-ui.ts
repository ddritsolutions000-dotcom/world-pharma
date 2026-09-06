export type MedicationReminder = {
  id: string;
  country_code: string;
  medicine_label: string;
  prescription_id: string | null;
  schedule_times: string[];
  days_of_week: number[];
  enabled: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type MedicationReminderInput = {
  medicine_label: string;
  prescription_id?: string | null;
  schedule_times: string[];
  days_of_week?: number[];
  enabled?: boolean;
  notes?: string | null;
};

export const DOSE_TIME_PRESETS = [
  { id: 'morning', label: 'Morning', time: '08:00' },
  { id: 'afternoon', label: 'Afternoon', time: '14:00' },
  { id: 'evening', label: 'Evening', time: '20:00' },
  { id: 'night', label: 'Night', time: '22:00' },
] as const;

export const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export function formatScheduleTime(time: string): string {
  const [hourStr, minuteStr] = time.split(':');
  const hour = Number(hourStr);
  const minute = Number(minuteStr);
  if (Number.isNaN(hour) || Number.isNaN(minute)) {
    return time;
  }
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  return `${hour12}:${minuteStr!.padStart(2, '0')} ${suffix}`;
}

export function isReminderActiveOnDay(reminder: Pick<MedicationReminder, 'days_of_week'>, day: number): boolean {
  if (!reminder.days_of_week.length) {
    return true;
  }
  return reminder.days_of_week.includes(day);
}

export type TodayDose = {
  reminder_id: string;
  medicine_label: string;
  time: string;
  time_label: string;
  enabled: boolean;
  prescription_id: string | null;
};

export function buildTodaysDoses(
  reminders: MedicationReminder[],
  now: Date = new Date(),
): TodayDose[] {
  const day = now.getDay();
  const doses: TodayDose[] = [];
  for (const reminder of reminders) {
    if (!reminder.enabled || !isReminderActiveOnDay(reminder, day)) {
      continue;
    }
    for (const time of reminder.schedule_times) {
      doses.push({
        reminder_id: reminder.id,
        medicine_label: reminder.medicine_label,
        time,
        time_label: formatScheduleTime(time),
        enabled: reminder.enabled,
        prescription_id: reminder.prescription_id,
      });
    }
  }
  return doses.sort((a, b) => a.time.localeCompare(b.time));
}

export function scheduleSummary(times: string[]): string {
  if (!times.length) {
    return 'No times set';
  }
  return times.map(formatScheduleTime).join(', ');
}

export function daysSummary(days: number[]): string {
  if (!days.length) {
    return 'Every day';
  }
  return days.map((d) => DAY_LABELS[d] ?? String(d)).join(', ');
}
