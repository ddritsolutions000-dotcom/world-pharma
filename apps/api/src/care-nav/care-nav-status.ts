import { CareNavSessionStatus } from '@prisma/client';
import { Errors } from '../common/problem';

const TRANSITIONS: Record<CareNavSessionStatus, CareNavSessionStatus[]> = {
  [CareNavSessionStatus.DRAFT]: [CareNavSessionStatus.INTAKE, CareNavSessionStatus.TERMINATED],
  [CareNavSessionStatus.INTAKE]: [CareNavSessionStatus.TRIAGED, CareNavSessionStatus.TERMINATED],
  [CareNavSessionStatus.TRIAGED]: [CareNavSessionStatus.MATCHED, CareNavSessionStatus.TERMINATED],
  [CareNavSessionStatus.MATCHED]: [CareNavSessionStatus.COMPLETED, CareNavSessionStatus.TERMINATED],
  [CareNavSessionStatus.COMPLETED]: [],
  [CareNavSessionStatus.TERMINATED]: [],
};

export function assertCareNavTransition(from: CareNavSessionStatus, to: CareNavSessionStatus) {
  const allowed = TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw Errors.conflict(`Invalid care navigation session transition: ${from} -> ${to}`);
  }
}

export function isTerminalCareNavStatus(status: CareNavSessionStatus): boolean {
  return status === CareNavSessionStatus.COMPLETED || status === CareNavSessionStatus.TERMINATED;
}

export const CARE_NAV_SESSION_TTL_HOURS = 24;
