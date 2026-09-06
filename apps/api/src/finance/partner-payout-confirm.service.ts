import { Injectable, Logger } from '@nestjs/common';
import { PartnerWalletLedgerKind, PartnerWithdrawStatus } from '@prisma/client';
import { uuidv7 } from '@world-pharma/shared';
import { PrismaService } from '../app/prisma.service';
import { Errors } from '../common/problem';

/**
 * Confirms partner withdraw requests from provider webhooks.
 * Only path that may set live withdraw PAID after non-mock submit.
 */
@Injectable()
export class PartnerPayoutConfirmService {
  private readonly logger = new Logger(PartnerPayoutConfirmService.name);

  constructor(private readonly prisma: PrismaService) {}

  async confirmByProviderRef(
    providerRef: string,
    outcome: 'PAID' | 'FAILED',
    failureCode?: string,
  ) {
    const row = await this.prisma.partnerWithdrawRequest.findFirst({
      where: { providerRef },
      include: { wallet: true },
    });
    if (!row) {
      this.logger.warn(`No partner withdraw for providerRef (ignored)`);
      return { matched: false as const };
    }
    if (row.status === PartnerWithdrawStatus.PAID || row.status === PartnerWithdrawStatus.FAILED) {
      return { matched: true as const, idempotent: true as const, status: row.status };
    }
    if (row.status !== PartnerWithdrawStatus.PROCESSING && row.status !== PartnerWithdrawStatus.APPROVED) {
      throw Errors.problem(
        409,
        'ILLEGAL_WITHDRAW_STATE',
        'Illegal withdraw state',
        `Cannot confirm withdraw in status ${row.status}`,
      );
    }

    if (outcome === 'PAID') {
      await this.prisma.$transaction(async (tx) => {
        const wallet = await tx.partnerWallet.findUniqueOrThrow({ where: { id: row.walletId } });
        if (wallet.heldMinor < row.amountMinor) {
          throw Errors.problem(
            409,
            'WITHDRAW_HOLD_MISSING',
            'Withdraw hold missing',
            'Held balance insufficient to complete payout confirmation.',
          );
        }
        const nextHeld = wallet.heldMinor - row.amountMinor;
        const nextAvailable = wallet.availableMinor;
        await tx.partnerWallet.update({
          where: { id: wallet.id },
          data: {
            heldMinor: nextHeld,
            lifetimeWithdrawnMinor: wallet.lifetimeWithdrawnMinor + row.amountMinor,
          },
        });
        await tx.partnerWalletLedgerEntry.create({
          data: {
            id: uuidv7(),
            walletId: wallet.id,
            kind: PartnerWalletLedgerKind.WITHDRAW_PAID,
            amountMinor: row.amountMinor,
            currency: row.currency,
            balanceAfterMinor: nextAvailable,
            source: 'withdraw',
            sourceKey: `${row.id}:paid`,
            note: `Live payout confirmed (${providerRef})`,
          },
        });
        await tx.partnerWithdrawRequest.update({
          where: { id: row.id },
          data: {
            status: PartnerWithdrawStatus.PAID,
            paidAt: new Date(),
            failureCode: null,
          },
        });
      });
      return { matched: true as const, status: PartnerWithdrawStatus.PAID };
    }

    await this.prisma.$transaction(async (tx) => {
      const wallet = await tx.partnerWallet.findUniqueOrThrow({ where: { id: row.walletId } });
      const nextHeld = wallet.heldMinor - row.amountMinor;
      const nextAvailable = wallet.availableMinor + row.amountMinor;
      await tx.partnerWallet.update({
        where: { id: wallet.id },
        data: { heldMinor: nextHeld < 0n ? 0n : nextHeld, availableMinor: nextAvailable },
      });
      await tx.partnerWalletLedgerEntry.create({
        data: {
          id: uuidv7(),
          walletId: wallet.id,
          kind: PartnerWalletLedgerKind.WITHDRAW_RELEASE,
          amountMinor: row.amountMinor,
          currency: row.currency,
          balanceAfterMinor: nextAvailable,
          source: 'withdraw',
          sourceKey: `${row.id}:failed`,
          note: `Live payout failed — hold released (${failureCode ?? 'FAILED'})`,
        },
      });
      await tx.partnerWithdrawRequest.update({
        where: { id: row.id },
        data: {
          status: PartnerWithdrawStatus.FAILED,
          failureCode: failureCode ?? 'PROVIDER_FAILED',
        },
      });
    });
    return { matched: true as const, status: PartnerWithdrawStatus.FAILED };
  }
}
