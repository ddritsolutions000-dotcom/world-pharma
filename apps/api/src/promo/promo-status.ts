import { PromoCampaignStatus } from '@prisma/client';
import { Errors } from '../common/problem';

const TRANSITIONS: Record<PromoCampaignStatus, PromoCampaignStatus[]> = {
  [PromoCampaignStatus.DRAFT]: [PromoCampaignStatus.ACTIVE, PromoCampaignStatus.EXPIRED],
  [PromoCampaignStatus.ACTIVE]: [PromoCampaignStatus.PAUSED, PromoCampaignStatus.EXPIRED],
  [PromoCampaignStatus.PAUSED]: [PromoCampaignStatus.ACTIVE, PromoCampaignStatus.EXPIRED],
  [PromoCampaignStatus.EXPIRED]: [],
};

export function assertPromoTransition(from: PromoCampaignStatus, to: PromoCampaignStatus) {
  const allowed = TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw Errors.conflict(`Invalid promo transition: ${from} -> ${to}`);
  }
}

export function isTerminalPromoStatus(status: PromoCampaignStatus): boolean {
  return status === PromoCampaignStatus.EXPIRED;
}

export function isEditablePromoStatus(status: PromoCampaignStatus): boolean {
  return status === PromoCampaignStatus.DRAFT || status === PromoCampaignStatus.PAUSED;
}
