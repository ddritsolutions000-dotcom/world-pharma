import { Injectable } from '@nestjs/common';
import { PrismaService, runWithTenant } from '../app/prisma.service';
import { Errors } from '../common/problem';
import type { Principal } from '../identity/current-principal';
import { PolicyResolver } from '../policy/resolver';
import { workerTenantContext } from '../tenancy/build-tenant-context';
import { utcDayStart } from './analytics-query';

@Injectable()
export class AnalyticsReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PolicyResolver,
  ) {}

  async requireEnabled(countryCode: string) {
    const resolved = await this.policy.resolvePublished(countryCode);
    if (!this.policy.isAnalyticsEnabled(resolved?.document ?? null)) {
      throw Errors.forbidden('Analytics is not enabled for this country.');
    }
    const country = await this.prisma.country.findUnique({ where: { isoAlpha2: countryCode } });
    if (!country) {
      throw Errors.notFound('Country not found.');
    }
    return country;
  }

  async overview(principal: Principal, countryCode: string, from?: string, to?: string) {
    const country = await this.requireEnabled(countryCode);
    const range = this.parseRange(from, to);
    return runWithTenant(workerTenantContext({ countryId: country.id }), async () => {
      const rows = await this.prisma.analyticsDailyCountryMetric.findMany({
        where: {
          countryId: country.id,
          metricDate: { gte: range.from, lte: range.to },
        },
        orderBy: { metricDate: 'asc' },
      });
      const totals = rows.reduce(
        (acc, row) => ({
          order_paid_count: acc.order_paid_count + row.orderPaidCount,
          order_gmv_minor: (BigInt(acc.order_gmv_minor) + row.orderGmvMinor).toString(),
          checkout_started_count: acc.checkout_started_count + row.checkoutStartedCount,
          cart_abandoned_count: acc.cart_abandoned_count + row.cartAbandonedCount,
          affiliate_click_count: acc.affiliate_click_count + row.affiliateClickCount,
          appointment_completed_count: acc.appointment_completed_count + row.appointmentCompletedCount,
          lab_booking_completed_count: acc.lab_booking_completed_count + row.labBookingCompletedCount,
          imaging_booking_completed_count:
            acc.imaging_booking_completed_count + row.imagingBookingCompletedCount,
          product_view_count: acc.product_view_count + row.productViewCount,
        }),
        {
          order_paid_count: 0,
          order_gmv_minor: '0',
          checkout_started_count: 0,
          cart_abandoned_count: 0,
          affiliate_click_count: 0,
          appointment_completed_count: 0,
          lab_booking_completed_count: 0,
          imaging_booking_completed_count: 0,
          product_view_count: 0,
        },
      );
      return {
        country_code: country.isoAlpha2,
        from: range.from.toISOString().slice(0, 10),
        to: range.to.toISOString().slice(0, 10),
        totals,
        daily: rows.map((row) => ({
          metric_date: row.metricDate.toISOString().slice(0, 10),
          order_paid_count: row.orderPaidCount,
          order_gmv_minor: row.orderGmvMinor.toString(),
          checkout_started_count: row.checkoutStartedCount,
          cart_abandoned_count: row.cartAbandonedCount,
          affiliate_click_count: row.affiliateClickCount,
          appointment_completed_count: row.appointmentCompletedCount,
          lab_booking_completed_count: row.labBookingCompletedCount,
          imaging_booking_completed_count: row.imagingBookingCompletedCount,
          product_view_count: row.productViewCount,
        })),
        requested_by: principal.personId,
      };
    });
  }

  async commerce(principal: Principal, countryCode: string, from?: string, to?: string, catalogItemId?: string) {
    const country = await this.requireEnabled(countryCode);
    const range = this.parseRange(from, to);
    return runWithTenant(workerTenantContext({ countryId: country.id }), async () => {
      const rows = await this.prisma.analyticsDailyProductMetric.findMany({
        where: {
          countryId: country.id,
          metricDate: { gte: range.from, lte: range.to },
          ...(catalogItemId ? { catalogItemId } : {}),
        },
        orderBy: [{ metricDate: 'asc' }, { catalogItemId: 'asc' }],
        take: 500,
      });
      return {
        country_code: country.isoAlpha2,
        from: range.from.toISOString().slice(0, 10),
        to: range.to.toISOString().slice(0, 10),
        catalog_item_id: catalogItemId ?? null,
        items: rows.map((row) => ({
          metric_date: row.metricDate.toISOString().slice(0, 10),
          catalog_item_id: row.catalogItemId,
          view_count: row.viewCount,
          add_to_cart_count: row.addToCartCount,
          purchase_count: row.purchaseCount,
        })),
        requested_by: principal.personId,
      };
    });
  }

  async marketing(principal: Principal, countryCode: string, from?: string, to?: string) {
    const country = await this.requireEnabled(countryCode);
    const range = this.parseRange(from, to);
    return runWithTenant(workerTenantContext({ countryId: country.id }), async () => {
      const rows = await this.prisma.analyticsDailyMarketingMetric.findMany({
        where: {
          countryId: country.id,
          metricDate: { gte: range.from, lte: range.to },
        },
        orderBy: { metricDate: 'asc' },
      });
      return {
        country_code: country.isoAlpha2,
        from: range.from.toISOString().slice(0, 10),
        to: range.to.toISOString().slice(0, 10),
        daily: rows.map((row) => ({
          metric_date: row.metricDate.toISOString().slice(0, 10),
          campaign_send_count: row.campaignSendCount,
          marketing_opt_in_count: row.marketingOptInCount,
        })),
        requested_by: principal.personId,
      };
    });
  }

  private parseRange(from?: string, to?: string) {
    const today = utcDayStart(new Date());
    const parsedTo = to ? utcDayStart(new Date(`${to}T00:00:00.000Z`)) : today;
    const parsedFrom = from
      ? utcDayStart(new Date(`${from}T00:00:00.000Z`))
      : new Date(parsedTo.getTime() - 29 * 86_400_000);
    if (Number.isNaN(parsedFrom.getTime()) || Number.isNaN(parsedTo.getTime())) {
      throw Errors.validation('Invalid from/to date.');
    }
    if (parsedFrom > parsedTo) {
      throw Errors.validation('from must be on or before to.');
    }
    return { from: parsedFrom, to: parsedTo };
  }
}
