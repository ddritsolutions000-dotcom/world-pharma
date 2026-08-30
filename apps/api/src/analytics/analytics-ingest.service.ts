import { Injectable } from '@nestjs/common';
import {
  CheckoutStatus,
  ConversionEventKind,
  OutboxStatus,
  PersonalizationEventKind,
  Prisma,
} from '@prisma/client';
import { uuidv7 } from '@world-pharma/shared';
import { PrismaService, runWithTenant } from '../app/prisma.service';
import { ConversionEventService } from '../crm/conversion-event.service';
import {
  CRM_CART_ABANDON_RECOVERY_EVENT,
  cartAbandonRecoveryOccurrenceKey,
} from '../crm/automation/cart-abandon-recovery.config';
import { OutboxService } from '../events/outbox.service';
import { EventWorkerService } from '../events/worker.service';
import { workerTenantContext } from '../tenancy/build-tenant-context';
import {
  ANALYTICS_FEED_KINDS,
  ANALYTICS_INGEST_VERSION,
  utcDayEnd,
  utcDayStart,
} from './analytics-query';

@Injectable()
export class AnalyticsIngestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly conversionEvents: ConversionEventService,
    private readonly outbox: OutboxService,
    private readonly eventWorker: EventWorkerService,
  ) {}

  async ingestCountryDay(countryId: string, metricDate: Date) {
    const dayStart = utcDayStart(metricDate);
    const dayEnd = utcDayEnd(metricDate);
    const ingestResult = await runWithTenant(workerTenantContext({ countryId }), async () => {
      const recoveryTargets = await this.recordAbandonedCarts(countryId, dayStart, dayEnd);
      const conversion = await this.aggregateConversionEvents(countryId, dayStart, dayEnd);
      const personalization = await this.aggregatePersonalizationEvents(countryId, dayStart, dayEnd);
      const marketing = await this.aggregateMarketing(countryId, dayStart, dayEnd);
      await this.upsertCountryMetric(countryId, dayStart, conversion, personalization.viewCount);
      await this.upsertProductMetrics(countryId, dayStart, personalization.byItem, conversion.purchasesByItem);
      await this.upsertMarketingMetric(countryId, dayStart, marketing);
      await this.advanceCursor(countryId, ANALYTICS_FEED_KINDS.CONVERSION, dayEnd);
      await this.advanceCursor(countryId, ANALYTICS_FEED_KINDS.PERSONALIZATION, dayEnd);
      await this.advanceCursor(countryId, ANALYTICS_FEED_KINDS.MARKETING, dayEnd);
      return {
        country_id: countryId,
        metric_date: dayStart.toISOString().slice(0, 10),
        rule_version: ANALYTICS_INGEST_VERSION,
        conversion,
        personalization_views: personalization.viewCount,
        marketing,
        recoveryTargets,
      };
    });

    for (const target of ingestResult.recoveryTargets) {
      await this.enqueueCartAbandonRecovery(target);
    }

    const { recoveryTargets: _recoveryTargets, ...result } = ingestResult;
    return result;
  }

  private async recordAbandonedCarts(countryId: string, dayStart: Date, dayEnd: Date) {
    const country = await this.prisma.country.findUniqueOrThrow({ where: { id: countryId } });
    const stale = await this.prisma.checkoutSession.findMany({
      where: {
        countryId,
        status: { not: CheckoutStatus.CANCELLED },
        expiresAt: { gte: dayStart, lt: dayEnd },
        orders: { none: {} },
      },
      select: { id: true, customerPersonId: true, cartId: true },
    });
    const recoveryTargets: Array<{
      countryId: string;
      countryCode: string;
      checkoutSessionId: string;
      customerPersonId: string;
      cartId: string;
    }> = [];
    for (const session of stale) {
      await this.conversionEvents.recordHook({
        countryCode: country.isoAlpha2,
        personId: session.customerPersonId,
        eventKind: ConversionEventKind.CART_ABANDONED,
        source: 'checkout_session',
        sourceKey: session.id,
        sessionId: session.id,
        metadata: { cart_id: session.cartId },
        occurredAt: dayEnd,
      });
      recoveryTargets.push({
        countryId,
        countryCode: country.isoAlpha2,
        checkoutSessionId: session.id,
        customerPersonId: session.customerPersonId,
        cartId: session.cartId,
      });
    }
    return recoveryTargets;
  }

  private async enqueueCartAbandonRecovery(input: {
    countryId: string;
    countryCode: string;
    checkoutSessionId: string;
    customerPersonId: string;
    cartId: string;
  }): Promise<void> {
    const occurrenceKey = cartAbandonRecoveryOccurrenceKey(input.checkoutSessionId);
    let existing = await this.prisma.outboxEvent.findFirst({
      where: {
        type: CRM_CART_ABANDON_RECOVERY_EVENT,
        occurrenceKey,
      },
    });
    if (existing?.status === OutboxStatus.PUBLISHED) {
      return;
    }

    let eventId = existing?.id;
    if (!eventId) {
      try {
        const row = await this.outbox.enqueue(this.prisma, {
          type: CRM_CART_ABANDON_RECOVERY_EVENT,
          aggregateType: 'CheckoutSession',
          aggregateId: input.checkoutSessionId,
          producer: 'crm',
          countryId: input.countryId,
          payload: {
            checkout_session_id: input.checkoutSessionId,
            customer_person_id: input.customerPersonId,
            country_code: input.countryCode.trim().toUpperCase(),
            cart_id: input.cartId,
          },
          occurrenceKey,
        });
        eventId = row.id;
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          existing = await this.prisma.outboxEvent.findFirst({
            where: {
              type: CRM_CART_ABANDON_RECOVERY_EVENT,
              occurrenceKey,
            },
          });
          if (!existing) {
            return;
          }
          eventId = existing.id;
          if (existing.status === OutboxStatus.PUBLISHED) {
            return;
          }
        } else {
          throw error;
        }
      }
    }
    await this.eventWorker.handle(eventId!);
  }

  private async aggregateConversionEvents(countryId: string, dayStart: Date, dayEnd: Date) {
    const rows = await this.prisma.conversionEvent.findMany({
      where: { countryId, occurredAt: { gte: dayStart, lt: dayEnd } },
      select: { eventKind: true, orderId: true, metadata: true },
    });
    const counts = {
      orderPaidCount: 0,
      orderGmvMinor: 0n,
      checkoutStartedCount: 0,
      cartAbandonedCount: 0,
      affiliateClickCount: 0,
      appointmentCompletedCount: 0,
      labBookingCompletedCount: 0,
      imagingBookingCompletedCount: 0,
    };
    const purchasesByItem = new Map<string, number>();
    const paidOrderIds: string[] = [];
    for (const row of rows) {
      switch (row.eventKind) {
        case ConversionEventKind.ORDER_PAID:
          counts.orderPaidCount += 1;
          if (row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)) {
            const total = (row.metadata as Record<string, unknown>).total_minor;
            if (typeof total === 'string' || typeof total === 'number') {
              counts.orderGmvMinor += BigInt(total);
            }
          }
          if (row.orderId) {
            paidOrderIds.push(row.orderId);
          }
          break;
        case ConversionEventKind.CHECKOUT_STARTED:
          counts.checkoutStartedCount += 1;
          break;
        case ConversionEventKind.CART_ABANDONED:
          counts.cartAbandonedCount += 1;
          break;
        case ConversionEventKind.AFFILIATE_CLICK:
          counts.affiliateClickCount += 1;
          break;
        case ConversionEventKind.APPOINTMENT_COMPLETED:
          counts.appointmentCompletedCount += 1;
          break;
        case ConversionEventKind.LAB_BOOKING_COMPLETED:
          counts.labBookingCompletedCount += 1;
          break;
        case ConversionEventKind.IMAGING_BOOKING_COMPLETED:
          counts.imagingBookingCompletedCount += 1;
          break;
        default:
          break;
      }
    }
    if (paidOrderIds.length) {
      const orderItems = await this.prisma.orderItem.findMany({
        where: { orderId: { in: paidOrderIds } },
        select: { variantId: true, qty: true },
      });
      const variantIds = [...new Set(orderItems.map((item) => item.variantId))];
      const variants = variantIds.length
        ? await this.prisma.catalogVariant.findMany({
            where: { id: { in: variantIds } },
            select: { id: true, itemId: true },
          })
        : [];
      const variantToItem = new Map(variants.map((variant) => [variant.id, variant.itemId]));
      for (const item of orderItems) {
        const catalogItemId = variantToItem.get(item.variantId);
        if (catalogItemId) {
          purchasesByItem.set(catalogItemId, (purchasesByItem.get(catalogItemId) ?? 0) + item.qty);
        }
      }
    }
    return { ...counts, purchasesByItem };
  }

  private async aggregatePersonalizationEvents(countryId: string, dayStart: Date, dayEnd: Date) {
    const rows = await this.prisma.personalizationEvent.findMany({
      where: { countryId, occurredAt: { gte: dayStart, lt: dayEnd } },
      select: { eventKind: true, catalogItemId: true },
    });
    const byItem = new Map<string, { views: number; addToCart: number }>();
    let viewCount = 0;
    for (const row of rows) {
      const itemId = row.catalogItemId;
      if (!itemId) {
        continue;
      }
      const bucket = byItem.get(itemId) ?? { views: 0, addToCart: 0 };
      if (row.eventKind === PersonalizationEventKind.PRODUCT_VIEWED) {
        bucket.views += 1;
        viewCount += 1;
      }
      if (row.eventKind === PersonalizationEventKind.PRODUCT_ADDED_TO_CART) {
        bucket.addToCart += 1;
      }
      byItem.set(itemId, bucket);
    }
    return { byItem, viewCount };
  }

  private async aggregateMarketing(countryId: string, dayStart: Date, dayEnd: Date) {
    const campaignSendCount = await this.prisma.crmCampaignSend.count({
      where: { countryId, createdAt: { gte: dayStart, lt: dayEnd } },
    });
    const marketingOptInCount = await this.prisma.marketingPreference.count({
      where: { countryId, marketingAllowed: true },
    });
    return { campaignSendCount, marketingOptInCount };
  }

  private async upsertCountryMetric(
    countryId: string,
    metricDate: Date,
    conversion: Awaited<ReturnType<AnalyticsIngestService['aggregateConversionEvents']>>,
    productViewCount: number,
  ) {
    await this.prisma.analyticsDailyCountryMetric.upsert({
      where: { countryId_metricDate: { countryId, metricDate } },
      create: {
        id: uuidv7(),
        countryId,
        metricDate,
        orderPaidCount: conversion.orderPaidCount,
        orderGmvMinor: conversion.orderGmvMinor,
        checkoutStartedCount: conversion.checkoutStartedCount,
        cartAbandonedCount: conversion.cartAbandonedCount,
        affiliateClickCount: conversion.affiliateClickCount,
        appointmentCompletedCount: conversion.appointmentCompletedCount,
        labBookingCompletedCount: conversion.labBookingCompletedCount,
        imagingBookingCompletedCount: conversion.imagingBookingCompletedCount,
        productViewCount,
      },
      update: {
        orderPaidCount: conversion.orderPaidCount,
        orderGmvMinor: conversion.orderGmvMinor,
        checkoutStartedCount: conversion.checkoutStartedCount,
        cartAbandonedCount: conversion.cartAbandonedCount,
        affiliateClickCount: conversion.affiliateClickCount,
        appointmentCompletedCount: conversion.appointmentCompletedCount,
        labBookingCompletedCount: conversion.labBookingCompletedCount,
        imagingBookingCompletedCount: conversion.imagingBookingCompletedCount,
        productViewCount,
        version: { increment: 1 },
      },
    });
  }

  private async upsertProductMetrics(
    countryId: string,
    metricDate: Date,
    personalization: Map<string, { views: number; addToCart: number }>,
    purchases: Map<string, number>,
  ) {
    const itemIds = new Set([...personalization.keys(), ...purchases.keys()]);
    for (const catalogItemId of itemIds) {
      const personal = personalization.get(catalogItemId) ?? { views: 0, addToCart: 0 };
      const purchaseCount = purchases.get(catalogItemId) ?? 0;
      await this.prisma.analyticsDailyProductMetric.upsert({
        where: {
          countryId_catalogItemId_metricDate: { countryId, catalogItemId, metricDate },
        },
        create: {
          id: uuidv7(),
          countryId,
          catalogItemId,
          metricDate,
          viewCount: personal.views,
          addToCartCount: personal.addToCart,
          purchaseCount,
        },
        update: {
          viewCount: personal.views,
          addToCartCount: personal.addToCart,
          purchaseCount,
          version: { increment: 1 },
        },
      });
    }
  }

  private async upsertMarketingMetric(
    countryId: string,
    metricDate: Date,
    marketing: { campaignSendCount: number; marketingOptInCount: number },
  ) {
    await this.prisma.analyticsDailyMarketingMetric.upsert({
      where: { countryId_metricDate: { countryId, metricDate } },
      create: {
        id: uuidv7(),
        countryId,
        metricDate,
        campaignSendCount: marketing.campaignSendCount,
        marketingOptInCount: marketing.marketingOptInCount,
      },
      update: {
        campaignSendCount: marketing.campaignSendCount,
        marketingOptInCount: marketing.marketingOptInCount,
        version: { increment: 1 },
      },
    });
  }

  private async advanceCursor(countryId: string, feedKind: string, watermarkAt: Date) {
    await this.prisma.analyticsIngestCursor.upsert({
      where: { countryId_feedKind: { countryId, feedKind } },
      create: { id: uuidv7(), countryId, feedKind, watermarkAt },
      update: { watermarkAt },
    });
  }
}
