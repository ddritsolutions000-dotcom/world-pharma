import { PartnerStatus } from '@prisma/client';

const T = PartnerStatus;

/** Blueprint 36 §9. Invalid transitions throw. */
export const PARTNER_TRANSITIONS: Record<PartnerStatus, PartnerStatus[]> = {
  [T.DRAFT]: [T.REGISTERED, T.REJECTED],
  [T.REGISTERED]: [T.PROFILE_INCOMPLETE, T.DOCUMENTS_REQUIRED, T.REJECTED],
  [T.PROFILE_INCOMPLETE]: [T.DOCUMENTS_REQUIRED, T.PROFILE_INCOMPLETE, T.REJECTED],
  [T.DOCUMENTS_REQUIRED]: [T.DOCUMENTS_SUBMITTED, T.REJECTED],
  [T.DOCUMENTS_SUBMITTED]: [T.UNDER_REVIEW, T.REJECTED],
  [T.UNDER_REVIEW]: [
    T.ADDITIONAL_INFORMATION_REQUIRED,
    T.VERIFIED,
    T.REJECTED,
    T.BLOCKED,
  ],
  [T.ADDITIONAL_INFORMATION_REQUIRED]: [T.DOCUMENTS_SUBMITTED, T.UNDER_REVIEW, T.REJECTED],
  [T.VERIFIED]: [T.APPROVED, T.SUSPENDED, T.DEACTIVATED, T.BLOCKED],
  [T.APPROVED]: [T.ACTIVE, T.SUSPENDED, T.DEACTIVATED, T.BLOCKED],
  [T.ACTIVE]: [T.SUSPENDED, T.DEACTIVATED, T.BLOCKED],
  [T.REJECTED]: [],
  [T.SUSPENDED]: [T.REACTIVATION_REQUESTED, T.BLOCKED, T.DEACTIVATED],
  [T.BLOCKED]: [],
  [T.DEACTIVATED]: [T.REACTIVATION_REQUESTED],
  [T.REACTIVATION_REQUESTED]: [T.UNDER_REVIEW, T.ACTIVE, T.REJECTED, T.BLOCKED],
};

export function canTransitionPartner(from: PartnerStatus, to: PartnerStatus): boolean {
  return PARTNER_TRANSITIONS[from]?.includes(to) === true;
}

export function assertPartnerTransition(from: PartnerStatus, to: PartnerStatus): void {
  if (from === to) {
    return;
  }
  if (!canTransitionPartner(from, to)) {
    throw new Error(`Invalid partner transition ${from} → ${to}`);
  }
}
