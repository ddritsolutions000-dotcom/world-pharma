import { Injectable } from '@nestjs/common';
import { CommercialChannel, OfferOwnership, Prisma } from '@prisma/client';
import { uuidv7 } from '@world-pharma/shared';
import { PrismaService } from '../app/prisma.service';
import { Errors } from '../common/problem';
import { minorJson, takeAmount } from './money';

@Injectable()
export class PricingService {
  constructor(private readonly prisma: PrismaService) {}

  async currentPrice(offerId: string, at = new Date()) {
    const row = await this.prisma.priceVersion.findFirst({
      where: {
        offerId,
        isCurrent: true,
        validFrom: { lte: at },
        OR: [{ validTo: null }, { validTo: { gt: at } }],
      },
      orderBy: { version: 'desc' },
    });
    if (!row) {
      throw Errors.notFound('No current price for this offer.');
    }
    return row;
  }

  async matchRule(input: {
    countryId: string;
    sellerOrgId: string;
    categoryId: string | null;
    itemId: string;
    variantId: string;
    ownership: OfferOwnership;
    at?: Date;
  }) {
    const at = input.at ?? new Date();
    const channel: CommercialChannel =
      input.ownership === OfferOwnership.PLATFORM_OWNED
        ? CommercialChannel.OWNED_PHARMACY
        : CommercialChannel.MARKETPLACE;
    const rules = await this.prisma.commercialRule.findMany({
      where: {
        validFrom: { lte: at },
        OR: [{ validTo: null }, { validTo: { gt: at } }],
        AND: [
          { OR: [{ countryId: null }, { countryId: input.countryId }] },
          { OR: [{ sellerOrgId: null }, { sellerOrgId: input.sellerOrgId }] },
          { OR: [{ categoryId: null }, { categoryId: input.categoryId }] },
          { OR: [{ itemId: null }, { itemId: input.itemId }] },
          { OR: [{ variantId: null }, { variantId: input.variantId }] },
          { OR: [{ channel: null }, { channel }] },
        ],
      },
    });
    const scored = rules
      .map((rule) => ({
        rule,
        score:
          (rule.variantId ? 16 : 0) +
          (rule.itemId ? 8 : 0) +
          (rule.categoryId ? 4 : 0) +
          (rule.sellerOrgId ? 4 : 0) +
          (rule.channel ? 2 : 0) +
          (rule.countryId ? 1 : 0),
      }))
      .sort((a, b) => b.score - a.score || b.rule.priority - a.rule.priority);
    return scored[0]?.rule ?? null;
  }

  async quote(offerId: string, quantity: bigint) {
    if (quantity <= 0n) {
      throw Errors.validation('quantity must be a positive integer.');
    }
    const offer = await this.prisma.catalogOffer.findUnique({
      where: { id: offerId },
      include: { variant: { include: { item: true } } },
    });
    if (!offer) {
      throw Errors.notFound('Offer not found.');
    }
    const price = await this.currentPrice(offerId);
    const rule = await this.matchRule({
      countryId: offer.countryId,
      sellerOrgId: offer.sellerOrgId,
      categoryId: offer.variant.item.categoryId,
      itemId: offer.variant.itemId,
      variantId: offer.variantId,
      ownership: offer.ownership,
    });
    const takeBps = rule?.takeBps ?? 0;
    const takeFlat = rule?.takeFlatMinor ?? 0n;
    const unitTake = takeAmount(price.sellMinor, takeBps, takeFlat);
    return {
      offer_id: offer.id,
      seller_org_id: offer.sellerOrgId,
      ownership: offer.ownership,
      currency: price.currency,
      quantity: quantity.toString(),
      unit: {
        cost_minor: minorJson(price.costMinor),
        list_minor: price.listMinor === null ? null : minorJson(price.listMinor),
        sell_minor: minorJson(price.sellMinor),
        platform_take_minor: minorJson(unitTake),
      },
      totals: {
        cost_minor: minorJson(price.costMinor * quantity),
        sell_minor: minorJson(price.sellMinor * quantity),
        platform_take_minor: minorJson(unitTake * quantity),
      },
      price_version_id: price.id,
      price_version: price.version,
      commercial_rule_id: rule?.id ?? null,
      take_bps: takeBps,
      take_flat_minor: minorJson(takeFlat),
      snapshot_ready: true,
      settlement: false,
    };
  }

  async createVersion(
    tx: Prisma.TransactionClient,
    input: {
      offerId: string;
      currency: string;
      costMinor: bigint;
      listMinor: bigint | null;
      sellMinor: bigint;
      validFrom: Date;
      validTo: Date | null;
    },
  ) {
    if (input.costMinor < 0n || input.sellMinor < 0n || (input.listMinor !== null && input.listMinor < 0n)) {
      throw Errors.validation('Money amounts must be non-negative integer minor units.');
    }
    await tx.priceVersion.updateMany({
      where: { offerId: input.offerId, isCurrent: true },
      data: { isCurrent: false, validTo: input.validFrom },
    });
    const last = await tx.priceVersion.findFirst({
      where: { offerId: input.offerId },
      orderBy: { version: 'desc' },
    });
    return tx.priceVersion.create({
      data: {
        id: uuidv7(),
        offerId: input.offerId,
        version: (last?.version ?? 0) + 1,
        currency: input.currency,
        costMinor: input.costMinor,
        listMinor: input.listMinor,
        sellMinor: input.sellMinor,
        validFrom: input.validFrom,
        validTo: input.validTo,
        isCurrent: true,
      },
    });
  }
}
