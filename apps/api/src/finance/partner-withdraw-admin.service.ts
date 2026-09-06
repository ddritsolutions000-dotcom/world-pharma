import { Injectable } from '@nestjs/common';
import { PartnerWithdrawStatus } from '@prisma/client';
import { PrismaService } from '../app/prisma.service';
import { minorJson } from '../catalog/money';
import { Errors } from '../common/problem';
import type { Principal } from '../identity/current-principal';
import { isLivePartnerPayoutReady } from './payout.config';
import { PayoutPort } from './payout.port';
import { PartnerPayoutConfirmService } from './partner-payout-confirm.service';

/**
 * Super Admin audit view for partner self-withdraws.
 * Partners withdraw Paytm-style (no admin approval). Admin monitors history only.
 */
@Injectable()
export class PartnerWithdrawAdminService {
  constructor(
    private readonly prisma: PrismaService,
    /** Kept for DI compatibility with FinanceModule payout rail binding. */
    private readonly payoutRail: PayoutPort,
    private readonly confirm: PartnerPayoutConfirmService,
  ) {
    void this.payoutRail;
    void this.confirm;
  }

  async list(query?: { status?: string; limit?: number }) {
    const status = query?.status?.toUpperCase();
    const limit = Math.min(Math.max(query?.limit ?? 50, 1), 200);
    const rows = await this.prisma.partnerWithdrawRequest.findMany({
      where: status ? { status: status as PartnerWithdrawStatus } : undefined,
      include: {
        wallet: {
          include: {
            partner: { select: { id: true, partnerTypeCode: true, personId: true, organizationId: true } },
            payoutAccount: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return {
      sandbox: !isLivePartnerPayoutReady(),
      live_payout: isLivePartnerPayoutReady(),
      self_withdraw: true,
      message:
        'Partner self-withdraw audit (Paytm-style). Partners withdraw their own wallet — Super Admin does not approve.',
      data: rows.map((row) => ({
        id: row.id,
        status: row.status,
        amount_minor: minorJson(row.amountMinor),
        currency: row.currency,
        destination_hint: row.destinationHint,
        sandbox: row.sandbox,
        live_payout: row.livePayout,
        provider_ref: row.providerRef,
        requested_by: row.requestedBy,
        approved_by: row.approvedBy,
        approved_at: row.approvedAt?.toISOString() ?? null,
        executed_by: row.executedBy,
        partner_type: row.wallet.partner.partnerTypeCode,
        partner_id: row.wallet.partner.id,
        organization_id: row.wallet.partner.organizationId,
        wallet_id: row.walletId,
        created_at: row.createdAt.toISOString(),
        paid_at: row.paidAt?.toISOString() ?? null,
        payout_account: row.wallet.payoutAccount
          ? {
              method: row.wallet.payoutAccount.method,
              account_holder_name: row.wallet.payoutAccount.accountHolderName,
              bank_name: row.wallet.payoutAccount.bankName,
              account_number_masked: row.wallet.payoutAccount.accountNumberMasked,
              ifsc_or_routing: row.wallet.payoutAccount.ifscOrRouting,
              upi_id_masked: row.wallet.payoutAccount.upiIdMasked,
            }
          : null,
      })),
    };
  }

  async approve(_principal: Principal, _id: string) {
    throw Errors.problem(
      409,
      'SELF_WITHDRAW_ONLY',
      'Self-withdraw only',
      'Partners withdraw from their own wallet without Super Admin approval (Paytm-style).',
    );
  }

  async reject(_principal: Principal, _id: string, _note?: string) {
    throw Errors.problem(
      409,
      'SELF_WITHDRAW_ONLY',
      'Self-withdraw only',
      'Partners withdraw from their own wallet without Super Admin approval (Paytm-style).',
    );
  }

  async execute(_principal: Principal, _id: string) {
    throw Errors.problem(
      409,
      'SELF_WITHDRAW_ONLY',
      'Self-withdraw only',
      'Partners self-withdraw. Super Admin configures gateway/fees — does not execute partner wallet withdrawals.',
    );
  }
}
