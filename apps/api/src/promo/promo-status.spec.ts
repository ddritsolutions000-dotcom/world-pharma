import { PromoCampaignStatus } from '@prisma/client';
import { assertPromoTransition, isEditablePromoStatus, isTerminalPromoStatus } from './promo-status';

describe('promo-status', () => {
  it('allows DRAFT to ACTIVE', () => {
    expect(() => assertPromoTransition(PromoCampaignStatus.DRAFT, PromoCampaignStatus.ACTIVE)).not.toThrow();
  });

  it('rejects ACTIVE to DRAFT', () => {
    expect(() => assertPromoTransition(PromoCampaignStatus.ACTIVE, PromoCampaignStatus.DRAFT)).toThrow();
  });

  it('marks EXPIRED as terminal', () => {
    expect(isTerminalPromoStatus(PromoCampaignStatus.EXPIRED)).toBe(true);
    expect(isEditablePromoStatus(PromoCampaignStatus.ACTIVE)).toBe(false);
    expect(isEditablePromoStatus(PromoCampaignStatus.DRAFT)).toBe(true);
  });
});
