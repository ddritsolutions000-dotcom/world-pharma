import { LabReportVersionStatus } from '@prisma/client';
import { assertReportTransition, isMutableReportStatus, isPublishedReportStatus } from './lab-report-status';

describe('lab-report-status', () => {
  it('allows canonical lifecycle transitions', () => {
    expect(() =>
      assertReportTransition(LabReportVersionStatus.DRAFT, LabReportVersionStatus.PENDING_VERIFY),
    ).not.toThrow();
    expect(() =>
      assertReportTransition(LabReportVersionStatus.PENDING_VERIFY, LabReportVersionStatus.VERIFIED),
    ).not.toThrow();
    expect(() =>
      assertReportTransition(LabReportVersionStatus.VERIFIED, LabReportVersionStatus.PUBLISHED),
    ).not.toThrow();
  });

  it('rejects illegal transitions', () => {
    expect(() =>
      assertReportTransition(LabReportVersionStatus.DRAFT, LabReportVersionStatus.PUBLISHED),
    ).toThrow();
    expect(() =>
      assertReportTransition(LabReportVersionStatus.PUBLISHED, LabReportVersionStatus.DRAFT),
    ).toThrow();
  });

  it('classifies mutable and published states', () => {
    expect(isMutableReportStatus(LabReportVersionStatus.DRAFT)).toBe(true);
    expect(isPublishedReportStatus(LabReportVersionStatus.PUBLISHED)).toBe(true);
    expect(isPublishedReportStatus(LabReportVersionStatus.DRAFT)).toBe(false);
  });
});
