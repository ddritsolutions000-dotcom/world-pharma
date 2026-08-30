import { LabProcessingStatus } from '@prisma/client';
import { Errors } from '../common/problem';

const ALLOWED: Record<LabProcessingStatus, LabProcessingStatus[]> = {
  [LabProcessingStatus.QUEUED]: [LabProcessingStatus.IN_PROGRESS, LabProcessingStatus.ON_HOLD, LabProcessingStatus.FAILED],
  [LabProcessingStatus.IN_PROGRESS]: [
    LabProcessingStatus.COMPLETED,
    LabProcessingStatus.ON_HOLD,
    LabProcessingStatus.FAILED,
  ],
  [LabProcessingStatus.ON_HOLD]: [LabProcessingStatus.IN_PROGRESS, LabProcessingStatus.FAILED],
  [LabProcessingStatus.COMPLETED]: [],
  [LabProcessingStatus.FAILED]: [],
};

export function assertProcessingTransition(from: LabProcessingStatus, to: LabProcessingStatus): void {
  const allowed = ALLOWED[from] ?? [];
  if (!allowed.includes(to)) {
    throw Errors.problem(
      409,
      'ILLEGAL_PROCESSING_TRANSITION',
      'Illegal transition',
      `Cannot move processing from ${from} to ${to}.`,
    );
  }
}

export function isTerminalProcessingStatus(status: LabProcessingStatus): boolean {
  return ALLOWED[status]?.length === 0;
}
