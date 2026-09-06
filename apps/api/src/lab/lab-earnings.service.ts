import { Injectable } from '@nestjs/common';
import { FinancialFactKind, LabReportVersionStatus, OrganizationKind } from '@prisma/client';
import { PrismaService } from '../app/prisma.service';
import { minorJson } from '../catalog/money';
import { Errors } from '../common/problem';
import type { Principal } from '../identity/current-principal';
import { assertLabOrgAccess } from '../catalog/access';

@Injectable()
export class LabEarningsService {
  constructor(private readonly prisma: PrismaService) {}

  private async requireLabOrg(principal: Principal, labOrgId: string) {
    await assertLabOrgAccess(this.prisma, principal, labOrgId);
    const org = await this.prisma.organization.findFirst({
      where: { id: labOrgId, kind: OrganizationKind.LAB },
      include: { country: { select: { isoAlpha2: true, defaultCurrency: true } } },
    });
    if (!org) {
      throw Errors.notFound('Lab organization not found.');
    }
    return org;
  }

  async summary(principal: Principal, labOrgId: string) {
    const org = await this.requireLabOrg(principal, labOrgId);
    const published = await this.prisma.labReport.findMany({
      where: {
        labOrgId,
        currentVersion: { status: LabReportVersionStatus.PUBLISHED },
      },
      include: {
        booking: { select: { id: true, totalMinor: true, currency: true } },
        currentVersion: { select: { publishedAt: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });

    const bookingIds = published.map((row) => row.labBookingId);
    const facts =
      bookingIds.length > 0
        ? await this.prisma.financialFact.findMany({
            where: {
              kind: FinancialFactKind.LAB_PAYABLE,
              sourceKey: { in: bookingIds.map((id) => `lab_payable:${id}`) },
            },
          })
        : [];
    const factByBooking = new Map(
      facts.map((fact) => [fact.sourceKey.replace(/^lab_payable:/, ''), fact] as const),
    );

    let grossMinor = 0n;
    let labPayableMinor = 0n;
    for (const report of published) {
      const fact = factByBooking.get(report.labBookingId);
      const amount = fact?.amountMinor ?? report.booking.totalMinor;
      grossMinor += amount;
      labPayableMinor += amount;
    }

    const currency =
      facts[0]?.currency ??
      published[0]?.booking.currency ??
      org.country.defaultCurrency;

    return {
      sandbox: true as const,
      live_payout: false,
      settlement_enabled: false,
      payout_authority: 'platform_finance' as const,
      message:
        'Sandbox lab earnings derived from published reports and LAB_PAYABLE financial facts. Live lab payout and settlement batches are not enabled. Platform commission is not modeled for labs in this sandbox.',
      lab_org_id: labOrgId,
      country_code: org.country.isoAlpha2,
      currency,
      completed_booking_count: published.length,
      gross_minor: minorJson(grossMinor),
      platform_fee_bps: 0,
      platform_fee_minor: '0',
      platform_fee_modeled: false,
      lab_payable_minor: minorJson(labPayableMinor),
      pending_settlement_minor: minorJson(labPayableMinor),
      settled_minor: '0',
      settlement_status: 'SANDBOX_NOT_SETTLED' as const,
      settlement_batch_id: null,
    };
  }

  async bookings(principal: Principal, labOrgId: string) {
    const org = await this.requireLabOrg(principal, labOrgId);
    const published = await this.prisma.labReport.findMany({
      where: {
        labOrgId,
        currentVersion: { status: LabReportVersionStatus.PUBLISHED },
      },
      include: {
        booking: { select: { id: true, totalMinor: true, currency: true } },
        currentVersion: { select: { publishedAt: true, versionNumber: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    });

    const bookingIds = published.map((row) => row.labBookingId);
    const facts =
      bookingIds.length > 0
        ? await this.prisma.financialFact.findMany({
            where: {
              kind: FinancialFactKind.LAB_PAYABLE,
              sourceKey: { in: bookingIds.map((id) => `lab_payable:${id}`) },
            },
          })
        : [];
    const factByBooking = new Map(
      facts.map((fact) => [fact.sourceKey.replace(/^lab_payable:/, ''), fact] as const),
    );

    return {
      sandbox: true as const,
      live_payout: false,
      data: published.map((report) => {
        const fact = factByBooking.get(report.labBookingId);
        const gross = fact?.amountMinor ?? report.booking.totalMinor;
        const currency = fact?.currency ?? report.booking.currency ?? org.country.defaultCurrency;
        return {
          lab_booking_id: report.labBookingId,
          lab_report_id: report.id,
          published_at: report.currentVersion?.publishedAt?.toISOString() ?? null,
          report_version: report.currentVersion?.versionNumber ?? null,
          country_code: org.country.isoAlpha2,
          currency,
          gross_minor: minorJson(gross),
          platform_fee_minor: '0',
          lab_payable_minor: minorJson(gross),
          settlement_status: 'SANDBOX_NOT_SETTLED' as const,
          settlement_batch_id: null,
          financial_fact_source_key: fact?.sourceKey ?? null,
        };
      }),
    };
  }
}
