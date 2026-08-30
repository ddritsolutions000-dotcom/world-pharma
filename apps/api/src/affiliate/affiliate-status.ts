import { AffiliateLinkStatus, AffiliateReferralCodeStatus } from '@prisma/client';
import { Errors } from '../common/problem';

const CODE_TRANSITIONS: Record<AffiliateReferralCodeStatus, AffiliateReferralCodeStatus[]> = {
  [AffiliateReferralCodeStatus.DRAFT]: [
    AffiliateReferralCodeStatus.ACTIVE,
    AffiliateReferralCodeStatus.INACTIVE,
    AffiliateReferralCodeStatus.EXPIRED,
  ],
  [AffiliateReferralCodeStatus.ACTIVE]: [
    AffiliateReferralCodeStatus.INACTIVE,
    AffiliateReferralCodeStatus.EXPIRED,
  ],
  [AffiliateReferralCodeStatus.INACTIVE]: [
    AffiliateReferralCodeStatus.ACTIVE,
    AffiliateReferralCodeStatus.EXPIRED,
  ],
  [AffiliateReferralCodeStatus.EXPIRED]: [],
};

const LINK_TRANSITIONS: Record<AffiliateLinkStatus, AffiliateLinkStatus[]> = {
  [AffiliateLinkStatus.ACTIVE]: [AffiliateLinkStatus.INACTIVE],
  [AffiliateLinkStatus.INACTIVE]: [AffiliateLinkStatus.ACTIVE],
};

export function normalizeReferralCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
}

export function assertReferralCodeTransition(
  from: AffiliateReferralCodeStatus,
  to: AffiliateReferralCodeStatus,
) {
  const allowed = CODE_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw Errors.conflict(`Invalid referral code transition: ${from} -> ${to}`);
  }
}

export function assertLinkTransition(from: AffiliateLinkStatus, to: AffiliateLinkStatus) {
  const allowed = LINK_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw Errors.conflict(`Invalid affiliate link transition: ${from} -> ${to}`);
  }
}

export function isTerminalReferralCodeStatus(status: AffiliateReferralCodeStatus): boolean {
  return status === AffiliateReferralCodeStatus.EXPIRED;
}

export function isRedeemableReferralCode(
  status: AffiliateReferralCodeStatus,
  expiresAt: Date | null,
): boolean {
  if (status !== AffiliateReferralCodeStatus.ACTIVE) {
    return false;
  }
  if (expiresAt && expiresAt <= new Date()) {
    return false;
  }
  return true;
}
