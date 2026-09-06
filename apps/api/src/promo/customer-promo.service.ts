import { Injectable } from '@nestjs/common';
import { PromoCampaignStatus } from '@prisma/client';
import { PrismaService } from '../app/prisma.service';
import { resolveCountryByCode } from '../cms/cms-country';
import { minorJson } from '../catalog/money';

export type CustomerPromoHint = {
  code: string;
  kind: string;
  percent_bps: number;
  fixed_minor: string;
  min_basket_minor: string;
  expires_at: string | null;
  funding: string;
};

@Injectable()
export class CustomerPromoService {
  constructor(private readonly prisma: PrismaService) {}

  async listAvailable(countryCode: string) {
    const country = await resolveCountryByCode(this.prisma, countryCode);
    const now = new Date();
    const rows = await this.prisma.promoCampaign.findMany({
      where: {
        status: PromoCampaignStatus.ACTIVE,
        OR: [{ countryId: null }, { countryId: country.id }],
        AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }],
      },
      orderBy: [{ minBasketMinor: 'asc' }, { code: 'asc' }],
      take: 20,
    });

    const hints: CustomerPromoHint[] = rows
      .filter((row) => row.maxRedemptions === null || row.redeemedCount < row.maxRedemptions)
      .map((row) => ({
        code: row.code,
        kind: row.kind,
        percent_bps: row.percentBps,
        fixed_minor: minorJson(row.fixedMinor),
        min_basket_minor: minorJson(row.minBasketMinor),
        expires_at: row.expiresAt?.toISOString() ?? null,
        funding: row.funding,
      }));

    return {
      country_code: country.isoAlpha2,
      sandbox: true as const,
      message: 'Sandbox promo hints only. Discount is applied server-side at checkout quote.',
      data: hints,
    };
  }
}
