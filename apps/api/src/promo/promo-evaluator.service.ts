import { Injectable } from '@nestjs/common';
import { PromoCampaignStatus, PromoFunding, PromoKind } from '@prisma/client';
import { Errors } from '../common/problem';

export type PromoEvaluation = {
  campaign_id: string;
  code: string;
  funding: PromoFunding;
  discount_minor: string;
};

@Injectable()
export class PromoEvaluatorService {
  evaluateCampaign(
    campaign: {
      id: string;
      code: string;
      kind: PromoKind;
      percentBps: number;
      fixedMinor: bigint;
      minBasketMinor: bigint;
      funding: PromoFunding;
      countryId: string | null;
      status: PromoCampaignStatus;
      maxRedemptions: number | null;
      redeemedCount: number;
      expiresAt: Date | null;
    },
    countryId: string,
    sellMinor: bigint,
  ): PromoEvaluation {
    if (campaign.status !== PromoCampaignStatus.ACTIVE) {
      throw Errors.problem(422, 'PROMO_INVALID', 'Promo invalid', 'Promo is not active.');
    }
    if (campaign.expiresAt && campaign.expiresAt <= new Date()) {
      throw Errors.problem(409, 'QUOTE_STALE', 'Quote stale', 'Promo has expired.');
    }
    if (campaign.countryId && campaign.countryId !== countryId) {
      throw Errors.problem(422, 'PROMO_INVALID', 'Promo invalid', 'Promo is not valid in this country.');
    }
    if (sellMinor < campaign.minBasketMinor) {
      throw Errors.problem(422, 'PROMO_INVALID', 'Promo invalid', 'Basket does not meet the minimum.');
    }
    if (campaign.maxRedemptions !== null && campaign.redeemedCount >= campaign.maxRedemptions) {
      throw Errors.problem(422, 'PROMO_INVALID', 'Promo invalid', 'Promo usage limit reached.');
    }
    const discount =
      campaign.kind === PromoKind.PERCENT
        ? (sellMinor * BigInt(campaign.percentBps)) / 10000n
        : campaign.fixedMinor;
    return {
      campaign_id: campaign.id,
      code: campaign.code,
      funding: campaign.funding,
      discount_minor: (discount > sellMinor ? sellMinor : discount).toString(),
    };
  }
}
