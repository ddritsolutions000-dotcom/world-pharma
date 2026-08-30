import { PhysicalReportRequestStatus } from '@prisma/client';
import { Errors } from '../common/problem';

const TRANSITIONS: Record<PhysicalReportRequestStatus, PhysicalReportRequestStatus[]> = {
  [PhysicalReportRequestStatus.REQUESTED]: [
    PhysicalReportRequestStatus.ACCEPTED,
    PhysicalReportRequestStatus.CANCELLED,
  ],
  [PhysicalReportRequestStatus.ACCEPTED]: [
    PhysicalReportRequestStatus.PREPARING,
    PhysicalReportRequestStatus.CANCELLED,
  ],
  [PhysicalReportRequestStatus.PREPARING]: [
    PhysicalReportRequestStatus.PACKED,
    PhysicalReportRequestStatus.CANCELLED,
    PhysicalReportRequestStatus.FAILED,
  ],
  [PhysicalReportRequestStatus.PACKED]: [
    PhysicalReportRequestStatus.DISPATCHED,
    PhysicalReportRequestStatus.CANCELLED,
    PhysicalReportRequestStatus.FAILED,
  ],
  [PhysicalReportRequestStatus.DISPATCHED]: [
    PhysicalReportRequestStatus.DELIVERED,
    PhysicalReportRequestStatus.FAILED,
  ],
  [PhysicalReportRequestStatus.DELIVERED]: [],
  [PhysicalReportRequestStatus.FAILED]: [PhysicalReportRequestStatus.CANCELLED],
  [PhysicalReportRequestStatus.CANCELLED]: [],
};

export function assertPhysicalReportTransition(
  from: PhysicalReportRequestStatus,
  to: PhysicalReportRequestStatus,
): void {
  if (!TRANSITIONS[from].includes(to)) {
    throw Errors.problem(
      409,
      'ILLEGAL_PHYSICAL_REPORT_TRANSITION',
      'Illegal physical report transition',
      `Cannot move physical report request from ${from} to ${to}.`,
    );
  }
}

export function isCancellablePhysicalReportStatus(status: PhysicalReportRequestStatus): boolean {
  return (
    status === PhysicalReportRequestStatus.REQUESTED ||
    status === PhysicalReportRequestStatus.ACCEPTED ||
    status === PhysicalReportRequestStatus.PREPARING ||
    status === PhysicalReportRequestStatus.PACKED
  );
}
