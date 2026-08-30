import { LabSampleCocStatus } from '@prisma/client';
import { Errors } from '../common/problem';

const T = LabSampleCocStatus;

/** R7-C through HANDED_OVER; R7-D continues through PROCESSING (no pathology). */
const ALLOWED: Record<LabSampleCocStatus, LabSampleCocStatus[]> = {
  [T.ASSIGNED]: [T.ACCEPTED, T.REJECTED],
  [T.ACCEPTED]: [T.ARRIVED, T.REJECTED],
  [T.ARRIVED]: [T.VERIFIED, T.REJECTED, T.RECOLLECTION_REQUIRED],
  [T.VERIFIED]: [T.COLLECTED, T.INSUFFICIENT_SAMPLE, T.WRONG_SAMPLE],
  [T.COLLECTED]: [T.SEALED, T.DAMAGED, T.TEMPERATURE_EXCEPTION],
  [T.SEALED]: [T.HANDED_OVER, T.LOST, T.DAMAGED],
  [T.HANDED_OVER]: [T.IN_TRANSIT],
  [T.IN_TRANSIT]: [T.LAB_RECEIVED, T.LOST, T.DAMAGED],
  [T.LAB_RECEIVED]: [T.ACCEPTED_BY_LAB, T.REJECTED],
  [T.ACCEPTED_BY_LAB]: [T.PROCESSING],
  [T.PROCESSING]: [],
  [T.REJECTED]: [],
  [T.DAMAGED]: [],
  [T.LOST]: [],
  [T.TEMPERATURE_EXCEPTION]: [],
  [T.INSUFFICIENT_SAMPLE]: [],
  [T.WRONG_SAMPLE]: [],
  [T.RECOLLECTION_REQUIRED]: [T.ASSIGNED],
};

export function assertCocTransition(from: LabSampleCocStatus, to: LabSampleCocStatus): void {
  const allowed = ALLOWED[from] ?? [];
  if (!allowed.includes(to)) {
    throw Errors.problem(
      409,
      'ILLEGAL_COC_TRANSITION',
      'Illegal transition',
      `Cannot move sample custody from ${from} to ${to}.`,
    );
  }
}

export function isTerminalCocStatus(status: LabSampleCocStatus): boolean {
  return ALLOWED[status]?.length === 0;
}
