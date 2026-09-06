import { AffiliateLiabilityStatus } from '@prisma/client';
import { Errors } from '../common/problem';

/** Admin/finance-only transitions for affiliate commission liability. */
const AFFILIATE_LIABILITY_NEXT: Record<AffiliateLiabilityStatus, AffiliateLiabilityStatus[]> = {
  [AffiliateLiabilityStatus.PENDING]: [
    AffiliateLiabilityStatus.APPROVED,
    AffiliateLiabilityStatus.REVERSED,
  ],
  [AffiliateLiabilityStatus.APPROVED]: [
    AffiliateLiabilityStatus.PAYABLE,
    AffiliateLiabilityStatus.REVERSED,
  ],
  [AffiliateLiabilityStatus.PAYABLE]: [
    AffiliateLiabilityStatus.PAID,
    AffiliateLiabilityStatus.REVERSED,
  ],
  [AffiliateLiabilityStatus.PAID]: [AffiliateLiabilityStatus.REVERSED],
  [AffiliateLiabilityStatus.REVERSED]: [],
};

export function assertAffiliateLiabilityTransition(
  from: AffiliateLiabilityStatus,
  to: AffiliateLiabilityStatus,
): void {
  const allowed = AFFILIATE_LIABILITY_NEXT[from] ?? [];
  if (!allowed.includes(to)) {
    throw Errors.conflict(`Invalid affiliate liability transition: ${from} -> ${to}`);
  }
}

export function isAffiliateLiabilityTerminal(status: AffiliateLiabilityStatus): boolean {
  return status === AffiliateLiabilityStatus.REVERSED || status === AffiliateLiabilityStatus.PAID;
}

export function isAffiliateOrderIneligible(status: string): boolean {
  return status === 'CANCELLED' || status === 'REFUNDED' || status === 'FAILED';
}
