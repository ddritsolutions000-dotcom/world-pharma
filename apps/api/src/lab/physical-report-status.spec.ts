import { PhysicalReportRequestStatus } from '@prisma/client';
import { assertPhysicalReportTransition } from './physical-report-status';

describe('physical-report-status', () => {
  it('allows canonical lifecycle transitions', () => {
    expect(() =>
      assertPhysicalReportTransition(PhysicalReportRequestStatus.REQUESTED, PhysicalReportRequestStatus.ACCEPTED),
    ).not.toThrow();
    expect(() =>
      assertPhysicalReportTransition(PhysicalReportRequestStatus.PACKED, PhysicalReportRequestStatus.DISPATCHED),
    ).not.toThrow();
    expect(() =>
      assertPhysicalReportTransition(PhysicalReportRequestStatus.DISPATCHED, PhysicalReportRequestStatus.DELIVERED),
    ).not.toThrow();
  });

  it('rejects illegal transitions', () => {
    expect(() =>
      assertPhysicalReportTransition(PhysicalReportRequestStatus.REQUESTED, PhysicalReportRequestStatus.DELIVERED),
    ).toThrow();
    expect(() =>
      assertPhysicalReportTransition(PhysicalReportRequestStatus.DELIVERED, PhysicalReportRequestStatus.REQUESTED),
    ).toThrow();
  });
});
