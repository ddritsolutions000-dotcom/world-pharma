import { appointmentLifecycleSummary, appointmentStatusLabel } from './appointment-status-labels';

describe('appointmentStatusLabel', () => {
  it('maps known backend statuses', () => {
    expect(appointmentStatusLabel('IN_CONSULTATION')).toBe('In consultation');
    expect(appointmentStatusLabel('CONFIRMED')).toBe('Confirmed');
  });
});

describe('appointmentLifecycleSummary', () => {
  it('describes completed consultation', () => {
    expect(appointmentLifecycleSummary({ status: 'COMPLETED' }).headline).toBe('Consultation completed');
  });

  it('describes confirmed upcoming visit', () => {
    expect(
      appointmentLifecycleSummary({ status: 'CONFIRMED', starts_at: '2026-09-01T10:00:00.000Z' }).headline,
    ).toBe('Upcoming');
  });

  it('does not invent states', () => {
    expect(appointmentLifecycleSummary({ status: 'CUSTOM' }).headline).toBe('custom');
  });
});
