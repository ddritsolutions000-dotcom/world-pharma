import { Injectable } from '@nestjs/common';
import { uuidv7 } from '@world-pharma/shared';
import { PrismaService, runWithTenant } from '../app/prisma.service';
import { workerTenantContext } from '../tenancy/build-tenant-context';
import { RECOMMENDATION_RULE_VERSION } from './recommendation-query';

@Injectable()
export class CooccurrenceService {
  constructor(private readonly prisma: PrismaService) {}

  async recordOrderPairs(orderId: string, countryId: string): Promise<void> {
    await runWithTenant(workerTenantContext({ countryId }), async () => {
      const items = await this.prisma.orderItem.findMany({
        where: { orderId },
        select: { variantId: true },
      });
      if (items.length < 2) {
        return;
      }
      const variants = await this.prisma.catalogVariant.findMany({
        where: { id: { in: items.map((row) => row.variantId) } },
        select: { itemId: true },
      });
      const itemIds = [...new Set(variants.map((row) => row.itemId))].sort();
      if (itemIds.length < 2) {
        return;
      }
      for (let i = 0; i < itemIds.length; i++) {
        for (let j = i + 1; j < itemIds.length; j++) {
          await this.incrementPair(countryId, itemIds[i], itemIds[j]);
        }
      }
    });
  }

  async rebuildCountry(countryId: string): Promise<{ pairs: number }> {
    return runWithTenant(workerTenantContext({ countryId }), async () => {
      await this.prisma.analyticsOrderItemPair.deleteMany({
        where: { countryId, ruleVersion: RECOMMENDATION_RULE_VERSION },
      });
      const orders = await this.prisma.order.findMany({
        where: { countryId, status: { notIn: ['CANCELLED', 'RETURNED'] } },
        select: { id: true },
      });
      const counts = new Map<string, number>();
      for (const order of orders) {
        const items = await this.prisma.orderItem.findMany({
          where: { orderId: order.id },
          select: { variantId: true },
        });
        const variants = await this.prisma.catalogVariant.findMany({
          where: { id: { in: items.map((row) => row.variantId) } },
          select: { itemId: true },
        });
        const itemIds = [...new Set(variants.map((row) => row.itemId))].sort();
        for (let i = 0; i < itemIds.length; i++) {
          for (let j = i + 1; j < itemIds.length; j++) {
            const key = `${itemIds[i]}:${itemIds[j]}`;
            counts.set(key, (counts.get(key) ?? 0) + 1);
          }
        }
      }
      for (const [key, pairCount] of counts) {
        const [itemAId, itemBId] = key.split(':');
        await this.prisma.analyticsOrderItemPair.create({
          data: {
            id: uuidv7(),
            countryId,
            itemAId,
            itemBId,
            pairCount,
            ruleVersion: RECOMMENDATION_RULE_VERSION,
          },
        });
      }
      return { pairs: counts.size };
    });
  }

  private async incrementPair(countryId: string, itemAId: string, itemBId: string): Promise<void> {
    const [left, right] = itemAId < itemBId ? [itemAId, itemBId] : [itemBId, itemAId];
    await this.prisma.analyticsOrderItemPair.upsert({
      where: {
        countryId_itemAId_itemBId_ruleVersion: {
          countryId,
          itemAId: left,
          itemBId: right,
          ruleVersion: RECOMMENDATION_RULE_VERSION,
        },
      },
      create: {
        id: uuidv7(),
        countryId,
        itemAId: left,
        itemBId: right,
        pairCount: 1,
        ruleVersion: RECOMMENDATION_RULE_VERSION,
      },
      update: { pairCount: { increment: 1 } },
    });
  }
}
