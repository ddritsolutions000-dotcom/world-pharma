import { KycCaseStatus } from '@prisma/client';

const T = KycCaseStatus;

export const KYC_TRANSITIONS: Record<KycCaseStatus, KycCaseStatus[]> = {
  [T.NOT_STARTED]: [T.IN_PROGRESS, T.EXPIRED],
  [T.IN_PROGRESS]: [T.SUBMITTED, T.EXPIRED, T.REJECTED],
  [T.SUBMITTED]: [T.UNDER_REVIEW, T.REJECTED, T.EXPIRED],
  [T.UNDER_REVIEW]: [
    T.ADDITIONAL_INFORMATION_REQUIRED,
    T.VERIFIED,
    T.REJECTED,
    T.EXPIRED,
  ],
  [T.ADDITIONAL_INFORMATION_REQUIRED]: [T.SUBMITTED, T.UNDER_REVIEW, T.REJECTED, T.EXPIRED],
  [T.VERIFIED]: [T.EXPIRED],
  [T.REJECTED]: [],
  [T.EXPIRED]: [],
};

export function canTransitionKyc(from: KycCaseStatus, to: KycCaseStatus): boolean {
  return KYC_TRANSITIONS[from]?.includes(to) === true;
}

export function assertKycTransition(from: KycCaseStatus, to: KycCaseStatus): void {
  if (from === to) {
    return;
  }
  if (!canTransitionKyc(from, to)) {
    throw new Error(`Invalid KYC transition ${from} → ${to}`);
  }
}
