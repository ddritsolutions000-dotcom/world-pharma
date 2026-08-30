import { LabReportVersionStatus } from '@prisma/client';
import { Errors } from '../common/problem';

const TRANSITIONS: Record<LabReportVersionStatus, LabReportVersionStatus[]> = {
  [LabReportVersionStatus.DRAFT]: [LabReportVersionStatus.PENDING_VERIFY],
  [LabReportVersionStatus.PENDING_VERIFY]: [LabReportVersionStatus.VERIFIED, LabReportVersionStatus.DRAFT],
  [LabReportVersionStatus.VERIFIED]: [LabReportVersionStatus.PUBLISHED],
  [LabReportVersionStatus.PUBLISHED]: [],
};

export function assertReportTransition(from: LabReportVersionStatus, to: LabReportVersionStatus): void {
  if (!TRANSITIONS[from].includes(to)) {
    throw Errors.problem(
      409,
      'ILLEGAL_REPORT_TRANSITION',
      'Illegal report transition',
      `Cannot move report from ${from} to ${to}.`,
    );
  }
}

export function isMutableReportStatus(status: LabReportVersionStatus): boolean {
  return status === LabReportVersionStatus.DRAFT || status === LabReportVersionStatus.PENDING_VERIFY;
}

export function isPublishedReportStatus(status: LabReportVersionStatus): boolean {
  return status === LabReportVersionStatus.PUBLISHED;
}
