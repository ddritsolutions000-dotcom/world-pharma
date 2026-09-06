import { Injectable } from '@nestjs/common';
import { AppointmentStatus, DoctorWalletLedgerKind, DoctorWithdrawStatus, Prisma } from '@prisma/client';
import { uuidv7 } from '@world-pharma/shared';
import { PrismaService } from '../app/prisma.service';
import { minorJson } from '../catalog/money';
import { Errors } from '../common/problem';
import { PolicyResolver } from '../policy/resolver';
import {
  computePartnerNet,
  resolvePartnerPlatformFeeBps,
  type PartnerFeeCommerce,
} from '../finance/partner-platform-fee';

type ConsultationFeeConfig = {
  fee_minor?: string | number;
  currency?: string;
  platform_fee_bps?: number;
};

/** Sandbox default when profile fee is unset — so wallet demo is visible. */
const SANDBOX_DEFAULT_FEE_MINOR = 50_000n; // 500.00 in minor units

@Injectable()
export class DoctorWalletService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PolicyResolver,
  ) {}

  private parseFee(raw: unknown, fallbackCurrency: string, defaultPlatformFeeBps: number) {
    const config = (raw ?? {}) as ConsultationFeeConfig;
    let feeMinor = BigInt(String(config.fee_minor ?? '0'));
    if (feeMinor <= 0n) {
      feeMinor = SANDBOX_DEFAULT_FEE_MINOR;
    }
    const currency = String(config.currency ?? fallbackCurrency ?? 'XXX').toUpperCase().slice(0, 3);
    const hasOverride =
      raw != null && typeof raw === 'object' && Object.prototype.hasOwnProperty.call(raw, 'platform_fee_bps');
    const platformFeeBps = hasOverride
      ? Math.max(0, Number(config.platform_fee_bps ?? 0))
      : defaultPlatformFeeBps;
    const breakdown = computePartnerNet({
      grossMinor: feeMinor,
      platformFeeBps,
    });
    return {
      feeMinor,
      currency,
      platformFeeBps: breakdown.platformFeeBps,
      platformFeeMinor: breakdown.platformFeeMinor,
      doctorCreditMinor: breakdown.netMinor,
    };
  }

  private async defaultDoctorFeeBps(countryCode: string): Promise<number> {
    const resolved = await this.policy.resolvePublished(countryCode);
    const commerce = (resolved?.document.commerce ?? {}) as PartnerFeeCommerce;
    return resolvePartnerPlatformFeeBps('doctor', commerce);
  }

  private async resolveProfile(personId: string) {
    const profile = await this.prisma.doctorProfile.findFirst({
      where: { personId },
      include: { country: true, partner: true },
    });
    if (!profile || profile.partner.status !== 'ACTIVE') {
      return null;
    }
    return profile;
  }

  private async ensureWallet(
    tx: Prisma.TransactionClient,
    profile: {
      id: string;
      personId: string;
      countryId: string;
      consultationConfig: unknown;
      country: { defaultCurrency: string; isoAlpha2: string };
    },
    defaultPlatformFeeBps: number,
  ) {
    const fee = this.parseFee(
      profile.consultationConfig,
      profile.country.defaultCurrency,
      defaultPlatformFeeBps,
    );
    const existing = await tx.doctorWallet.findUnique({ where: { doctorProfileId: profile.id } });
    if (existing) {
      return existing;
    }
    return tx.doctorWallet.create({
      data: {
        id: uuidv7(),
        doctorProfileId: profile.id,
        personId: profile.personId,
        countryId: profile.countryId,
        currency: fee.currency,
        availableMinor: 0n,
        heldMinor: 0n,
        lifetimeEarnedMinor: 0n,
        lifetimeWithdrawnMinor: 0n,
      },
    });
  }

  /** Credit doctor wallet when a consult completes (idempotent per appointment). */
  async creditCompletedConsult(input: {
    doctorPersonId: string;
    appointmentId: string;
    doctorProfileId: string;
    countryId: string;
  }) {
    const profile = await this.prisma.doctorProfile.findUnique({
      where: { id: input.doctorProfileId },
      include: { country: true, partner: true },
    });
    if (!profile || profile.partner.status !== 'ACTIVE') {
      return null;
    }
    const defaultBps = await this.defaultDoctorFeeBps(profile.country.isoAlpha2);
    const fee = this.parseFee(profile.consultationConfig, profile.country.defaultCurrency, defaultBps);
    if (fee.doctorCreditMinor <= 0n) {
      return null;
    }

    return this.prisma.$transaction(async (tx) => {
      const wallet = await this.ensureWallet(tx, profile, defaultBps);
      const existing = await tx.doctorWalletLedgerEntry.findUnique({
        where: {
          source_sourceKey_kind: {
            source: 'appointment',
            sourceKey: input.appointmentId,
            kind: DoctorWalletLedgerKind.CONSULT_CREDIT,
          },
        },
      });
      if (existing) {
        return wallet;
      }
      const nextAvailable = wallet.availableMinor + fee.doctorCreditMinor;
      await tx.doctorWallet.update({
        where: { id: wallet.id },
        data: {
          availableMinor: nextAvailable,
          lifetimeEarnedMinor: wallet.lifetimeEarnedMinor + fee.doctorCreditMinor,
          currency: fee.currency,
        },
      });
      await tx.doctorWalletLedgerEntry.create({
        data: {
          id: uuidv7(),
          walletId: wallet.id,
          kind: DoctorWalletLedgerKind.CONSULT_CREDIT,
          amountMinor: fee.doctorCreditMinor,
          currency: fee.currency,
          balanceAfterMinor: nextAvailable,
          source: 'appointment',
          sourceKey: input.appointmentId,
          appointmentId: input.appointmentId,
          note: `Consult net after platform fee ${fee.platformFeeMinor.toString()} (${fee.platformFeeBps} bps)`,
        },
      });
      return tx.doctorWallet.findUniqueOrThrow({ where: { id: wallet.id } });
    });
  }

  /** Backfill credits for completed appointments not yet in the ledger. */
  async syncCompletedConsults(personId: string) {
    const profile = await this.resolveProfile(personId);
    if (!profile) {
      return;
    }
    const completed = await this.prisma.appointment.findMany({
      where: { doctorProfileId: profile.id, status: AppointmentStatus.COMPLETED },
      select: { id: true },
      take: 200,
      orderBy: { updatedAt: 'desc' },
    });
    for (const row of completed) {
      await this.creditCompletedConsult({
        doctorPersonId: personId,
        appointmentId: row.id,
        doctorProfileId: profile.id,
        countryId: profile.countryId,
      });
    }
  }

  async getWalletView(personId: string) {
    await this.syncCompletedConsults(personId);
    const profile = await this.resolveProfile(personId);
    if (!profile) {
      return null;
    }
    const defaultBps = await this.defaultDoctorFeeBps(profile.country.isoAlpha2);
    const fee = this.parseFee(profile.consultationConfig, profile.country.defaultCurrency, defaultBps);
    const wallet = await this.prisma.$transaction((tx) => this.ensureWallet(tx, profile, defaultBps));
    const entries = await this.prisma.doctorWalletLedgerEntry.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    const withdraws = await this.prisma.doctorWithdrawRequest.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    const payoutAccount = await this.prisma.doctorPayoutAccount.findUnique({
      where: { doctorProfileId: profile.id },
    });

    return {
      sandbox: true as const,
      live_payout: false,
      wallet_enabled: true,
      self_withdraw_enabled: Boolean(payoutAccount),
      payout_account_required: !payoutAccount,
      message: payoutAccount
        ? 'Consult fees credit net after platform fee. Withdraw is sandbox mock until live gateway. Affiliate marketing is a separate line.'
        : 'Add a bank or UPI payout account before you can withdraw. Consult fees still credit net after platform fee.',
      country_code: profile.country.isoAlpha2,
      currency: wallet.currency || fee.currency,
      available_minor: minorJson(wallet.availableMinor),
      held_minor: minorJson(wallet.heldMinor),
      lifetime_earned_minor: minorJson(wallet.lifetimeEarnedMinor),
      lifetime_withdrawn_minor: minorJson(wallet.lifetimeWithdrawnMinor),
      unit_fee_minor: minorJson(fee.feeMinor),
      platform_fee_bps: fee.platformFeeBps,
      platform_fee_minor: minorJson(fee.platformFeeMinor),
      doctor_net_minor: minorJson(fee.doctorCreditMinor),
      payout_account: payoutAccount
        ? {
            method: payoutAccount.method,
            account_holder_name: payoutAccount.accountHolderName,
            bank_name: payoutAccount.bankName,
            account_number_masked: payoutAccount.accountNumberMasked,
            ifsc_or_routing: payoutAccount.ifscOrRouting,
            upi_id_masked: payoutAccount.upiIdMasked,
            verified_sandbox: payoutAccount.verifiedSandbox,
          }
        : null,
      ledger: entries.map((e) => ({
        id: e.id,
        kind: e.kind,
        amount_minor: minorJson(e.amountMinor),
        currency: e.currency,
        balance_after_minor: minorJson(e.balanceAfterMinor),
        source: e.source,
        source_key: e.sourceKey,
        appointment_id: e.appointmentId,
        note: e.note,
        created_at: e.createdAt.toISOString(),
      })),
      withdraw_requests: withdraws.map((w) => ({
        id: w.id,
        amount_minor: minorJson(w.amountMinor),
        currency: w.currency,
        status: w.status,
        destination_hint: w.destinationHint,
        sandbox: w.sandbox,
        live_payout: w.livePayout,
        provider_ref: w.providerRef,
        created_at: w.createdAt.toISOString(),
        paid_at: w.paidAt?.toISOString() ?? null,
      })),
    };
  }

  async upsertPayoutAccount(
    personId: string,
    input: {
      method?: 'BANK' | 'UPI';
      account_holder_name: string;
      bank_name?: string;
      account_number?: string;
      ifsc_or_routing?: string;
      upi_id?: string;
    },
  ) {
    const profile = await this.resolveProfile(personId);
    if (!profile) {
      throw Errors.forbidden('Active doctor profile required.');
    }
    const holder = input.account_holder_name?.trim();
    if (!holder || holder.length < 2) {
      throw Errors.validation('account_holder_name is required');
    }
    const method = input.method === 'UPI' ? 'UPI' : 'BANK';
    let accountNumberMasked: string | null = null;
    let upiIdMasked: string | null = null;
    let bankName: string | null = input.bank_name?.trim() || null;
    let ifscOrRouting: string | null = input.ifsc_or_routing?.trim().toUpperCase() || null;

    if (method === 'BANK') {
      const raw = (input.account_number ?? '').replace(/\s+/g, '');
      if (raw.length < 6) {
        throw Errors.validation('account_number must be at least 6 digits');
      }
      if (!bankName) {
        throw Errors.validation('bank_name is required for BANK payout');
      }
      accountNumberMasked = `****${raw.slice(-4)}`;
    } else {
      const upi = (input.upi_id ?? '').trim().toLowerCase();
      if (!upi.includes('@') || upi.length < 5) {
        throw Errors.validation('upi_id must look like name@bank');
      }
      const [user, host] = upi.split('@');
      upiIdMasked = `${user.slice(0, 2)}***@${host}`;
    }

    const row = await this.prisma.doctorPayoutAccount.upsert({
      where: { doctorProfileId: profile.id },
      create: {
        id: uuidv7(),
        doctorProfileId: profile.id,
        personId: profile.personId,
        countryId: profile.countryId,
        method,
        accountHolderName: holder,
        bankName,
        accountNumberMasked,
        ifscOrRouting,
        upiIdMasked,
        verifiedSandbox: true,
      },
      update: {
        method,
        accountHolderName: holder,
        bankName,
        accountNumberMasked,
        ifscOrRouting,
        upiIdMasked,
        verifiedSandbox: true,
      },
    });

    return {
      sandbox: true as const,
      message: 'Payout account saved. You can withdraw wallet balance to this destination (sandbox mock).',
      payout_account: {
        method: row.method,
        account_holder_name: row.accountHolderName,
        bank_name: row.bankName,
        account_number_masked: row.accountNumberMasked,
        ifsc_or_routing: row.ifscOrRouting,
        upi_id_masked: row.upiIdMasked,
        verified_sandbox: row.verifiedSandbox,
      },
    };
  }

  async requestWithdraw(
    personId: string,
    input: { amount_minor: string; destination_hint?: string },
  ) {
    const profile = await this.resolveProfile(personId);
    if (!profile) {
      throw Errors.forbidden('Active doctor profile required.');
    }
    const payoutAccount = await this.prisma.doctorPayoutAccount.findUnique({
      where: { doctorProfileId: profile.id },
    });
    if (!payoutAccount) {
      throw Errors.problem(
        409,
        'PAYOUT_ACCOUNT_REQUIRED',
        'Payout account required',
        'Add a bank account or UPI ID before withdrawing from your doctor wallet.',
      );
    }
    let amount: bigint;
    try {
      amount = BigInt(String(input.amount_minor ?? '').trim());
    } catch {
      throw Errors.validation('amount_minor must be an integer string');
    }
    if (amount <= 0n) {
      throw Errors.validation('Withdraw amount must be positive');
    }

    const destination =
      payoutAccount.method === 'UPI'
        ? `UPI ${payoutAccount.upiIdMasked ?? ''}`.trim()
        : `BANK ${payoutAccount.bankName ?? ''} ${payoutAccount.accountNumberMasked ?? ''} ${payoutAccount.ifscOrRouting ?? ''}`.trim();

    const defaultBps = await this.defaultDoctorFeeBps(profile.country.isoAlpha2);
    const result = await this.prisma.$transaction(async (tx) => {
      const wallet = await this.ensureWallet(tx, profile, defaultBps);
      if (wallet.availableMinor < amount) {
        throw Errors.problem(
          409,
          'INSUFFICIENT_WALLET_BALANCE',
          'Insufficient balance',
          `Available ${wallet.availableMinor.toString()} ${wallet.currency}; requested ${amount.toString()}.`,
        );
      }
      const nextAvailable = wallet.availableMinor - amount;
      const nextHeld = wallet.heldMinor + amount;
      await tx.doctorWallet.update({
        where: { id: wallet.id },
        data: { availableMinor: nextAvailable, heldMinor: nextHeld },
      });
      const withdrawId = uuidv7();
      await tx.doctorWalletLedgerEntry.create({
        data: {
          id: uuidv7(),
          walletId: wallet.id,
          kind: DoctorWalletLedgerKind.WITHDRAW_HOLD,
          amountMinor: amount,
          currency: wallet.currency,
          balanceAfterMinor: nextAvailable,
          source: 'withdraw',
          sourceKey: withdrawId,
          note: 'Withdraw hold',
        },
      });
      await tx.doctorWithdrawRequest.create({
        data: {
          id: withdrawId,
          walletId: wallet.id,
          amountMinor: amount,
          currency: wallet.currency,
          status: DoctorWithdrawStatus.PROCESSING,
          destinationHint: input.destination_hint?.trim() || destination,
          sandbox: true,
          livePayout: false,
          requestedBy: personId,
        },
      });

      const paidAvailable = nextAvailable;
      await tx.doctorWallet.update({
        where: { id: wallet.id },
        data: {
          heldMinor: nextHeld - amount,
          lifetimeWithdrawnMinor: wallet.lifetimeWithdrawnMinor + amount,
        },
      });
      await tx.doctorWalletLedgerEntry.create({
        data: {
          id: uuidv7(),
          walletId: wallet.id,
          kind: DoctorWalletLedgerKind.WITHDRAW_PAID,
          amountMinor: amount,
          currency: wallet.currency,
          balanceAfterMinor: paidAvailable,
          source: 'withdraw',
          sourceKey: `${withdrawId}:paid`,
          note: `Sandbox mock payout to ${destination}`,
        },
      });
      const paid = await tx.doctorWithdrawRequest.update({
        where: { id: withdrawId },
        data: {
          status: DoctorWithdrawStatus.PAID,
          providerRef: `mock_doctor_payout_${withdrawId}`,
          paidAt: new Date(),
        },
      });
      return { request: paid, available_minor: paidAvailable, currency: wallet.currency, destination };
    });

    return {
      sandbox: true as const,
      live_payout: false,
      message: `Sandbox withdraw completed to ${result.destination}. Live bank transfer remains EXTERNAL_GATED.`,
      withdraw_request: {
        id: result.request.id,
        amount_minor: minorJson(result.request.amountMinor),
        currency: result.request.currency,
        status: result.request.status,
        destination_hint: result.request.destinationHint,
        provider_ref: result.request.providerRef,
        paid_at: result.request.paidAt?.toISOString() ?? null,
      },
      available_minor: minorJson(result.available_minor),
    };
  }
}
