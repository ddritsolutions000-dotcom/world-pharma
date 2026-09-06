import { clinicalReportNextAction, clinicalReportStatusLabel } from './clinical-status-labels';

describe('clinicalReportStatusLabel', () => {
  it('maps known diagnostic report statuses', () => {
    expect(clinicalReportStatusLabel('PENDING_VERIFY')).toBe('Pending verification');
    expect(clinicalReportStatusLabel(null)).toBe('Unassigned');
  });
});

describe('clinicalReportNextAction', () => {
  it('returns the primary operator step', () => {
    expect(clinicalReportNextAction(null)).toBe('assign');
    expect(clinicalReportNextAction('PENDING_VERIFY')).toBe('verify');
    expect(clinicalReportNextAction('VERIFIED')).toBe('publish');
  });
});
