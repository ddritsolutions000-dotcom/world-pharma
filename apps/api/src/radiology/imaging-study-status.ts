import { ImagingStudyStatus } from '@prisma/client';
import { Errors } from '../common/problem';

const S = ImagingStudyStatus;

const ALLOWED: Record<ImagingStudyStatus, ImagingStudyStatus[]> = {
  [S.SCHEDULED]: [S.CHECKED_IN, S.CANCELLED],
  [S.CHECKED_IN]: [S.ACQUISITION_IN_PROGRESS, S.CANCELLED],
  [S.ACQUISITION_IN_PROGRESS]: [S.ACQUIRED, S.ACQUISITION_FAILED],
  [S.ACQUIRED]: [],
  [S.ACQUISITION_FAILED]: [S.CHECKED_IN],
  [S.CANCELLED]: [],
};

export function assertImagingStudyTransition(from: ImagingStudyStatus, to: ImagingStudyStatus): void {
  const allowed = ALLOWED[from] ?? [];
  if (!allowed.includes(to)) {
    throw Errors.problem(
      409,
      'ILLEGAL_IMAGING_STUDY_TRANSITION',
      'Illegal transition',
      `Cannot move imaging study from ${from} to ${to}.`,
    );
  }
}

export function isTerminalImagingStudyStatus(status: ImagingStudyStatus): boolean {
  return (ALLOWED[status]?.length ?? 0) === 0;
}
