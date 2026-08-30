import { ImagingReportVersionStatus } from '@prisma/client';
import { Errors } from '../common/problem';

const TRANSITIONS: Record<ImagingReportVersionStatus, ImagingReportVersionStatus[]> = {
  [ImagingReportVersionStatus.DRAFT]: [ImagingReportVersionStatus.PENDING_VERIFY],
  [ImagingReportVersionStatus.PENDING_VERIFY]: [
    ImagingReportVersionStatus.VERIFIED,
    ImagingReportVersionStatus.DRAFT,
  ],
  [ImagingReportVersionStatus.VERIFIED]: [ImagingReportVersionStatus.PUBLISHED],
  [ImagingReportVersionStatus.PUBLISHED]: [],
};

export function assertImagingReportTransition(
  from: ImagingReportVersionStatus,
  to: ImagingReportVersionStatus,
): void {
  if (!TRANSITIONS[from].includes(to)) {
    throw Errors.problem(
      409,
      'ILLEGAL_REPORT_TRANSITION',
      'Illegal report transition',
      `Cannot move imaging report from ${from} to ${to}.`,
    );
  }
}

export function isMutableImagingReportStatus(status: ImagingReportVersionStatus): boolean {
  return (
    status === ImagingReportVersionStatus.DRAFT || status === ImagingReportVersionStatus.PENDING_VERIFY
  );
}

export function isVerifiedImagingReportStatus(status: ImagingReportVersionStatus): boolean {
  return status === ImagingReportVersionStatus.VERIFIED;
}

export function isPublishedImagingReportStatus(status: ImagingReportVersionStatus): boolean {
  return status === ImagingReportVersionStatus.PUBLISHED;
}
