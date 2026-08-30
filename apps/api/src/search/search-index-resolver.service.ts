import { Injectable } from '@nestjs/common';
import type { EventEnvelope } from '../events/envelope';
import { PrismaService } from '../app/prisma.service';

const INVENTORY_INVALIDATION_EVENTS = new Set([
  'INVENTORY_RECEIVED',
  'INVENTORY_ADJUSTED',
  'INVENTORY_RESERVED',
  'INVENTORY_RELEASED',
  'INVENTORY_TRANSFERRED',
  'INVENTORY_EXPIRED',
  'INVENTORY_QUARANTINED',
]);

@Injectable()
export class SearchIndexResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async catalogTargetsFromEnvelope(envelope: EventEnvelope): Promise<Array<{ countryId: string; itemId: string }>> {
    if (envelope.eventName === 'SEARCH_INDEX_INVALIDATE') {
      const itemId = typeof envelope.payload.item_id === 'string' ? envelope.payload.item_id : null;
      const countryId =
        typeof envelope.payload.country_id === 'string'
          ? envelope.payload.country_id
          : envelope.countryId;
      if (itemId && countryId) {
        return [{ countryId, itemId }];
      }
      return [];
    }
    if (!INVENTORY_INVALIDATION_EVENTS.has(envelope.eventName)) {
      return [];
    }
    if (envelope.eventName === 'INVENTORY_RECEIVED') {
      const receipt = await this.prisma.goodsReceipt.findUnique({
        where: { id: envelope.aggregateId },
        include: { lines: { include: { lot: { include: { variant: true } } } } },
      });
      if (!receipt) {
        return [];
      }
      const seen = new Set<string>();
      const targets: Array<{ countryId: string; itemId: string }> = [];
      for (const line of receipt.lines) {
        let itemId = line.lot?.variant?.itemId;
        if (!itemId && line.variantId) {
          const variant = await this.prisma.catalogVariant.findUnique({
            where: { id: line.variantId },
            select: { itemId: true },
          });
          itemId = variant?.itemId;
        }
        if (!itemId) {
          continue;
        }
        const key = `${receipt.countryId}:${itemId}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        targets.push({ countryId: receipt.countryId, itemId });
      }
      return targets;
    }
    const lot = await this.prisma.inventoryLot.findUnique({
      where: { id: envelope.aggregateId },
      include: { variant: true },
    });
    if (!lot?.variant?.itemId) {
      return [];
    }
    return [{ countryId: lot.countryId, itemId: lot.variant.itemId }];
  }
}
