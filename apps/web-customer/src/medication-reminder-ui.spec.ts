import {
  buildTodaysDoses,
  daysSummary,
  DOSE_TIME_PRESETS,
  formatScheduleTime,
  isReminderActiveOnDay,
  scheduleSummary,
  type MedicationReminder,
} from './medication-reminder-ui';

describe('medication-reminder-ui', () => {
  const reminder = (overrides: Partial<MedicationReminder> = {}): MedicationReminder => ({
    id: '1',
    country_code: 'IN',
    medicine_label: 'Metformin',
    prescription_id: null,
    schedule_times: ['08:00', '20:00'],
    days_of_week: [],
    enabled: true,
    notes: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  });

  it('formats schedule times for display', () => {
    expect(formatScheduleTime('08:00')).toBe('8:00 AM');
    expect(formatScheduleTime('20:00')).toBe('8:00 PM');
  });

  it('builds today doses sorted by time', () => {
    const doses = buildTodaysDoses(
      [
        reminder({ id: 'a', schedule_times: ['20:00'] }),
        reminder({ id: 'b', schedule_times: ['08:00'] }),
      ],
      new Date('2026-08-31T12:00:00'),
    );
    expect(doses.map((d) => d.time)).toEqual(['08:00', '20:00']);
  });

  it('respects day filters and enabled flag', () => {
    const monday = new Date('2026-08-31T12:00:00'); // Monday = 1
    expect(isReminderActiveOnDay(reminder({ days_of_week: [1] }), monday.getDay())).toBe(true);
    expect(isReminderActiveOnDay(reminder({ days_of_week: [0] }), monday.getDay())).toBe(false);
    expect(buildTodaysDoses([reminder({ enabled: false })], monday)).toHaveLength(0);
  });

  it('summarizes schedules', () => {
    expect(scheduleSummary(['08:00', '20:00'])).toContain('AM');
    expect(daysSummary([])).toBe('Every day');
    expect(daysSummary([1, 3])).toBe('Mon, Wed');
    expect(DOSE_TIME_PRESETS).toHaveLength(4);
  });
});
