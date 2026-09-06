import { Injectable } from '@nestjs/common';
import { AffiliateLiabilityStatus } from '@prisma/client';
import { PrismaService, runWithTenant } from '../app/prisma.service';
import type { Principal } from '../identity/current-principal';
import { workerTenantContext } from '../tenancy/build-tenant-context';
import { AffiliateContextService } from './affiliate-context.service';

export type AffiliateStatementRow = {
  date: string;
  order_id: string;
  order_number: string | null;
  commission_amount_minor: string;
  currency: string;
  status: AffiliateLiabilityStatus;
  affiliate_code: string | null;
  reversal: boolean;
  refund_adjusted: boolean;
  period: string;
};

@Injectable()
export class AffiliateStatementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: AffiliateContextService,
  ) {}

  async listStatement(
    principal: Principal,
    input?: { from?: string; to?: string; limit?: number },
  ): Promise<{
    data: AffiliateStatementRow[];
    period: { from: string | null; to: string | null };
    currency: string | null;
    sandbox: boolean;
    live_payout: boolean;
  }> {
    const { organizationId, countryId } = await this.context.resolveAffiliateOrg(principal);
    const codeRows = await this.prisma.affiliateReferralCode.findMany({
      where: { organizationId },
      select: { code: true },
    });
    const codes = codeRows.map((row) => row.code);
    const from = input?.from ? new Date(input.from) : undefined;
    const to = input?.to ? new Date(input.to) : undefined;
    const limit = Math.min(Math.max(input?.limit ?? 200, 1), 500);
    const rows = codes.length
      ? await runWithTenant(
          workerTenantContext({ countryId, organizationId, personId: principal.personId }),
          () =>
            this.prisma.affiliateLiability.findMany({
              where: {
                affiliateCode: { in: codes },
                ...(from || to
                  ? {
                      createdAt: {
                        ...(from ? { gte: from } : {}),
                        ...(to ? { lte: to } : {}),
                      },
                    }
                  : {}),
              },
              include: { order: { select: { orderNumber: true, totalMinor: true } } },
              orderBy: { createdAt: 'desc' },
              take: limit,
            }),
        )
      : [];
    const originalAmounts = await runWithTenant(
      workerTenantContext({ countryId, organizationId, personId: principal.personId }),
      () =>
        Promise.all(
          rows.map(async (row) => {
            const fact = await this.prisma.financialFact.findFirst({
              where: { orderId: row.orderId, kind: 'AFFILIATE' },
              orderBy: { createdAt: 'asc' },
            });
            return { orderId: row.orderId, original: fact?.amountMinor ?? row.amountMinor };
          }),
        ),
    );
    const originalByOrder = new Map(originalAmounts.map((row) => [row.orderId, row.original]));
    const data = rows.map((row) => this.presentRow(row, originalByOrder.get(row.orderId) ?? row.amountMinor));
    const currency = rows[0]?.currency ?? null;
    return {
      data,
      period: { from: from?.toISOString() ?? null, to: to?.toISOString() ?? null },
      currency,
      sandbox: true,
      live_payout: false,
    };
  }

  async exportCsv(principal: Principal, input?: { from?: string; to?: string }): Promise<string> {
    const statement = await this.listStatement(principal, { ...input, limit: 500 });
    const header = [
      'date',
      'order_id',
      'order_number',
      'commission_amount_minor',
      'currency',
      'status',
      'affiliate_code',
      'reversal',
      'refund_adjusted',
      'period',
    ].join(',');
    const lines = statement.data.map((row) =>
      [
        row.date,
        row.order_id,
        row.order_number ?? '',
        row.commission_amount_minor,
        row.currency,
        row.status,
        row.affiliate_code ?? '',
        row.reversal ? 'true' : 'false',
        row.refund_adjusted ? 'true' : 'false',
        row.period,
      ]
        .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
        .join(','),
    );
    return [header, ...lines].join('\n');
  }

  private presentRow(
    row: {
      orderId: string;
      amountMinor: bigint;
      currency: string;
      status: AffiliateLiabilityStatus;
      affiliateCode: string | null;
      createdAt: Date;
      order: { orderNumber: string | null } | null;
    },
    originalMinor: bigint,
  ): AffiliateStatementRow {
    const created = row.createdAt;
    const period = `${created.getUTCFullYear()}-${String(created.getUTCMonth() + 1).padStart(2, '0')}`;
    return {
      date: created.toISOString(),
      order_id: row.orderId,
      order_number: row.order?.orderNumber ?? null,
      commission_amount_minor: row.amountMinor.toString(),
      currency: row.currency,
      status: row.status,
      affiliate_code: row.affiliateCode,
      reversal: row.status === AffiliateLiabilityStatus.REVERSED,
      refund_adjusted: row.status !== AffiliateLiabilityStatus.REVERSED && row.amountMinor !== originalMinor,
      period,
    };
  }
}
