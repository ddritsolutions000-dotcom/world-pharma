import { Injectable } from '@nestjs/common';
import {
  AffiliateLiabilityStatus,
  FinancialFactKind,
  LabReportVersionStatus,
  LogisticsJobStatus,
  OrganizationKind,
  PartnerStatus,
  PartnerWalletLedgerKind,
  PartnerWithdrawStatus,
  Prisma,
} from '@prisma/client';
import { uuidv7 } from '@world-pharma/shared';
import { PrismaService } from '../app/prisma.service';
import { minorJson } from '../catalog/money';
import { Errors } from '../common/problem';
import { assertLabOrgAccess } from '../catalog/access';
import type { Principal } from '../identity/current-principal';
import { canEncryptBeneficiaries, encryptBeneficiarySecret, decryptBeneficiarySecret } from './beneficiary-crypto';
import { isLivePartnerPayoutReady, isMockPayoutProvider, readPartnerPayoutRuntimeConfig } from './payout.config';
import { PayoutPort } from './payout.port';
import {
  computePartnerNet,
  partnerNetLedgerNote,
  resolvePartnerPlatformFeeBps,
  type PartnerFeeCommerce,
  type PartnerFeeVertical,
} from './partner-platform-fee';
import { PolicyResolver } from '../policy/resolver';
import { missingRequiredDocuments } from '../partner/join-document-rules';

export type PartnerWalletScope =
  | { kind: 'LAB'; organizationId: string }
  | { kind: 'AFFILIATE' }
  | { kind: 'DELIVERY' }
  | { kind: 'DOCTOR' };

const SANDBOX_DEFAULT_DELIVERY_FEE_MINOR = 15_000n;
const SANDBOX_DEFAULT_DOCTOR_FEE_MINOR = 50_000n;

@Injectable()
export class PartnerWalletService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly payoutRail: PayoutPort,
    private readonly policy: PolicyResolver,
  ) {}

  private async partnerFeeRates(countryCode: string): Promise<PartnerFeeCommerce> {
    const resolved = await this.policy.resolvePublished(countryCode);
    return (resolved?.document.commerce ?? {}) as PartnerFeeCommerce;
  }

  private netCredit(
    vertical: PartnerFeeVertical,
    gross: bigint,
    commerce: PartnerFeeCommerce,
  ) {
    return computePartnerNet({
      grossMinor: gross,
      platformFeeBps: resolvePartnerPlatformFeeBps(vertical, commerce),
      platformFeeFlatMinor: commerce.partner_platform_fee_flat_minor ?? 0,
    });
  }

  private presentWallet(
    wallet: {
      availableMinor: bigint;
      heldMinor: bigint;
      lifetimeEarnedMinor: bigint;
      lifetimeWithdrawnMinor: bigint;
      currency: string;
    },
    extras: {
      partner_type: string;
      country_code: string;
      message: string;
      payout_account: null | Record<string, unknown>;
      ledger: unknown[];
      withdraw_requests: unknown[];
      fee_policy?: Record<string, unknown>;
    },
  ) {
    const live = isLivePartnerPayoutReady();
    const cfg = readPartnerPayoutRuntimeConfig();
    return {
      sandbox: !live,
      live_payout: live,
      wallet_enabled: true,
      self_withdraw_enabled: Boolean(extras.payout_account),
      payout_account_required: !extras.payout_account,
      partner_type: extras.partner_type,
      message: extras.message,
      country_code: extras.country_code,
      currency: wallet.currency,
      available_minor: minorJson(wallet.availableMinor),
      held_minor: minorJson(wallet.heldMinor),
      lifetime_earned_minor: minorJson(wallet.lifetimeEarnedMinor),
      lifetime_withdrawn_minor: minorJson(wallet.lifetimeWithdrawnMinor),
      payout_account: extras.payout_account,
      ledger: extras.ledger,
      withdraw_requests: extras.withdraw_requests,
      fee_policy: extras.fee_policy ?? null,
      payout_runtime: {
        adapter: cfg.adapter_code,
        live_ready: live,
        remaining_blocker: cfg.remaining_blocker,
        phase: live ? 'LIVE_READY' : 'SANDBOX_READY_AWAITING_GATEWAY',
        gateway_connected: !isMockPayoutProvider(cfg.adapter_code) && cfg.credentials_present,
      },
    };
  }

  private async resolvePartner(principal: Principal, scope: PartnerWalletScope) {
    if (scope.kind === 'LAB') {
      await assertLabOrgAccess(this.prisma, principal, scope.organizationId);
      const org = await this.prisma.organization.findFirstOrThrow({
        where: { id: scope.organizationId, kind: OrganizationKind.LAB },
        include: { country: true },
      });
      let partner = await this.prisma.partner.findFirst({
        where: {
          organizationId: org.id,
          partnerTypeCode: 'LAB',
          status: PartnerStatus.ACTIVE,
        },
      });
      if (!partner) {
        partner = await this.prisma.partner.findFirst({
          where: {
            personId: principal.personId,
            partnerTypeCode: 'LAB',
            countryId: org.countryId,
          },
        });
        if (partner) {
          partner = await this.prisma.partner.update({
            where: { id: partner.id },
            data: {
              organizationId: org.id,
              status: PartnerStatus.ACTIVE,
              activatedAt: partner.activatedAt ?? new Date(),
              suspendedAt: null,
              deactivatedAt: null,
            },
          });
        } else {
          partner = await this.prisma.partner.create({
            data: {
              id: uuidv7(),
              personId: principal.personId,
              partnerTypeCode: 'LAB',
              countryId: org.countryId,
              organizationId: org.id,
              status: PartnerStatus.ACTIVE,
              activatedAt: new Date(),
            },
          });
        }
      }
      return {
        partner,
        countryCode: org.country.isoAlpha2,
        currency: org.country.defaultCurrency,
        organizationId: org.id,
      };
    }

    if (scope.kind === 'AFFILIATE') {
      const membership = await this.prisma.membership.findFirst({
        where: {
          personId: principal.personId,
          status: 'ACTIVE',
          deletedAt: null,
          organization: { kind: OrganizationKind.AFFILIATE_ORG },
        },
        include: { organization: { include: { country: true } } },
      });
      if (!membership?.organization) {
        throw Errors.forbidden('Affiliate organization membership required.');
      }
      const org = membership.organization;
      let partner = await this.prisma.partner.findFirst({
        where: { organizationId: org.id, partnerTypeCode: 'AFFILIATE', status: PartnerStatus.ACTIVE },
      });
      if (!partner) {
        partner = await this.prisma.partner.findFirst({
          where: {
            personId: principal.personId,
            partnerTypeCode: 'AFFILIATE',
            countryId: org.countryId,
            status: PartnerStatus.ACTIVE,
          },
        });
      }
      if (!partner) {
        throw Errors.forbidden('Active AFFILIATE partner required for wallet.');
      }
      return {
        partner,
        countryCode: org.country.isoAlpha2,
        currency: org.country.defaultCurrency,
        organizationId: org.id,
      };
    }

    if (scope.kind === 'DELIVERY') {
      const partner = await this.prisma.partner.findFirst({
        where: {
          personId: principal.personId,
          partnerTypeCode: 'DELIVERY_PARTNER',
          status: PartnerStatus.ACTIVE,
        },
        include: { country: true },
      });
      if (!partner) {
        throw Errors.forbidden('Active DELIVERY_PARTNER required for wallet.');
      }
      return {
        partner,
        countryCode: partner.country.isoAlpha2,
        currency: partner.country.defaultCurrency,
      };
    }

    const partner = await this.prisma.partner.findFirst({
      where: {
        personId: principal.personId,
        partnerTypeCode: 'DOCTOR',
        status: PartnerStatus.ACTIVE,
      },
      include: { country: true },
    });
    if (!partner) {
      throw Errors.forbidden('Active DOCTOR partner required for wallet.');
    }
    return {
      partner,
      countryCode: partner.country.isoAlpha2,
      currency: partner.country.defaultCurrency,
    };
  }

  private async ensureWallet(
    tx: Prisma.TransactionClient,
    partner: { id: string; personId: string; organizationId: string | null; countryId: string },
    currency: string,
  ) {
    const existing = await tx.partnerWallet.findUnique({ where: { partnerId: partner.id } });
    if (existing) {
      return existing;
    }
    return tx.partnerWallet.create({
      data: {
        id: uuidv7(),
        partnerId: partner.id,
        personId: partner.personId,
        organizationId: partner.organizationId,
        countryId: partner.countryId,
        currency,
        availableMinor: 0n,
        heldMinor: 0n,
        lifetimeEarnedMinor: 0n,
        lifetimeWithdrawnMinor: 0n,
      },
    });
  }

  private async creditOnce(
    tx: Prisma.TransactionClient,
    walletId: string,
    input: { amount: bigint; currency: string; source: string; sourceKey: string; note: string },
  ) {
    if (input.amount <= 0n) {
      return;
    }
    const existing = await tx.partnerWalletLedgerEntry.findUnique({
      where: {
        source_sourceKey_kind: {
          source: input.source,
          sourceKey: input.sourceKey,
          kind: PartnerWalletLedgerKind.EARNING_CREDIT,
        },
      },
    });
    if (existing) {
      return;
    }
    const wallet = await tx.partnerWallet.findUniqueOrThrow({ where: { id: walletId } });
    const next = wallet.availableMinor + input.amount;
    await tx.partnerWallet.update({
      where: { id: walletId },
      data: {
        availableMinor: next,
        lifetimeEarnedMinor: wallet.lifetimeEarnedMinor + input.amount,
        currency: input.currency || wallet.currency,
      },
    });
    await tx.partnerWalletLedgerEntry.create({
      data: {
        id: uuidv7(),
        walletId,
        kind: PartnerWalletLedgerKind.EARNING_CREDIT,
        amountMinor: input.amount,
        currency: input.currency || wallet.currency,
        balanceAfterMinor: next,
        source: input.source,
        sourceKey: input.sourceKey,
        note: input.note,
      },
    });
  }

  async syncCredits(principal: Principal, scope: PartnerWalletScope) {
    const resolved = await this.resolvePartner(principal, scope);
    const wallet = await this.prisma.$transaction((tx) =>
      this.ensureWallet(tx, resolved.partner, resolved.currency),
    );
    const commerce = await this.partnerFeeRates(resolved.countryCode);

    if (scope.kind === 'LAB') {
      const published = await this.prisma.labReport.findMany({
        where: {
          labOrgId: scope.organizationId,
          currentVersion: { status: LabReportVersionStatus.PUBLISHED },
        },
        include: { booking: { select: { id: true, totalMinor: true, currency: true } } },
        take: 200,
      });
      const bookingIds = published.map((r) => r.labBookingId);
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
      for (const report of published) {
        const fact = factByBooking.get(report.labBookingId);
        const gross = fact?.amountMinor ?? report.booking.totalMinor;
        const currency = fact?.currency ?? report.booking.currency ?? resolved.currency;
        if (!gross || gross <= 0n) {
          continue;
        }
        const breakdown = this.netCredit('lab', gross, commerce);
        await this.prisma.$transaction((tx) =>
          this.creditOnce(tx, wallet.id, {
            amount: breakdown.netMinor,
            currency,
            source: 'lab_payable',
            sourceKey: `lab_payable:${report.labBookingId}`,
            note: partnerNetLedgerNote('Lab payable', breakdown),
          }),
        );
      }
    }

    if (scope.kind === 'AFFILIATE') {
      // Affiliate marketing commission is a separate payout line — credit full liability (no platform fee).
      const affiliateOrgId = (resolved as { organizationId?: string }).organizationId;
      if (!affiliateOrgId) {
        return;
      }
      const codes = await this.prisma.affiliateReferralCode.findMany({
        where: { organizationId: affiliateOrgId },
        select: { code: true },
      });
      const codeList = codes.map((c) => c.code);
      const rows = codeList.length
        ? await this.prisma.affiliateLiability.findMany({
            where: {
              affiliateCode: { in: codeList },
              status: { in: [AffiliateLiabilityStatus.APPROVED, AffiliateLiabilityStatus.PAYABLE] },
            },
            take: 200,
          })
        : [];
      for (const row of rows) {
        await this.prisma.$transaction((tx) =>
          this.creditOnce(tx, wallet.id, {
            amount: row.amountMinor,
            currency: row.currency,
            source: 'affiliate_liability',
            sourceKey: row.id,
            note: `Affiliate marketing commission ${row.status}`,
          }),
        );
      }
    }

    if (scope.kind === 'DELIVERY') {
      const jobs = await this.prisma.logisticsJob.findMany({
        where: {
          assigneeId: principal.personId,
          status: LogisticsJobStatus.DELIVERED,
        },
        take: 200,
        orderBy: { updatedAt: 'desc' },
      });
      for (const job of jobs) {
        const breakdown = this.netCredit('delivery', SANDBOX_DEFAULT_DELIVERY_FEE_MINOR, commerce);
        await this.prisma.$transaction((tx) =>
          this.creditOnce(tx, wallet.id, {
            amount: breakdown.netMinor,
            currency: resolved.currency,
            source: 'delivery_job',
            sourceKey: job.id,
            note: partnerNetLedgerNote('Delivery fee', breakdown),
          }),
        );
      }
    }

    if (scope.kind === 'DOCTOR') {
      const profile = await this.prisma.doctorProfile.findFirst({
        where: { partnerId: resolved.partner.id },
      });
      if (profile) {
        const completed = await this.prisma.appointment.findMany({
          where: { doctorProfileId: profile.id, status: 'COMPLETED' },
          take: 200,
        });
        for (const row of completed) {
          const breakdown = this.netCredit('doctor', SANDBOX_DEFAULT_DOCTOR_FEE_MINOR, commerce);
          await this.prisma.$transaction((tx) =>
            this.creditOnce(tx, wallet.id, {
              amount: breakdown.netMinor,
              currency: resolved.currency,
              source: 'appointment',
              sourceKey: row.id,
              note: partnerNetLedgerNote('Consult fee', breakdown),
            }),
          );
        }
      }
    }

    return wallet.id;
  }

  async getWalletView(principal: Principal, scope: PartnerWalletScope) {
    await this.syncCredits(principal, scope);
    const resolved = await this.resolvePartner(principal, scope);
    const wallet = await this.prisma.$transaction((tx) =>
      this.ensureWallet(tx, resolved.partner, resolved.currency),
    );
    const fresh = await this.prisma.partnerWallet.findUniqueOrThrow({ where: { id: wallet.id } });
    const payoutAccount = await this.prisma.partnerPayoutAccount.findUnique({
      where: { walletId: wallet.id },
    });
    const entries = await this.prisma.partnerWalletLedgerEntry.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    const withdraws = await this.prisma.partnerWithdrawRequest.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    const live = isLivePartnerPayoutReady();
    const commerce = await this.partnerFeeRates(resolved.countryCode);
    const vertical: PartnerFeeVertical | null =
      scope.kind === 'LAB'
        ? 'lab'
        : scope.kind === 'DELIVERY'
          ? 'delivery'
          : scope.kind === 'DOCTOR'
            ? 'doctor'
            : null;
    const feeBps = vertical ? resolvePartnerPlatformFeeBps(vertical, commerce) : null;
    return this.presentWallet(fresh, {
      partner_type: resolved.partner.partnerTypeCode,
      country_code: resolved.countryCode,
      message: !payoutAccount
        ? 'Add a bank or UPI payout account before withdrawing. Earnings credit as net after platform fee (affiliate commission is separate).'
        : live
          ? 'Withdraw anytime to your saved bank/UPI. Credits are net after platform fee.'
          : 'Withdraw anytime (Paytm-style). Credits are net after platform fee; affiliate marketing is a separate line.',
      fee_policy: {
        affiliate_marketing_separate: true,
        partner_receives: 'net_after_platform_fee',
        platform_fee_bps: feeBps,
        platform_fee_flat_minor: commerce.partner_platform_fee_flat_minor ?? 0,
        note:
          scope.kind === 'AFFILIATE'
            ? 'Affiliate marketing commission credits in full (not reduced by platform fee).'
            : 'Platform fee bundles gateway, ops, margin, listing; company must not lose.',
      },
      payout_account: payoutAccount
        ? {
            method: payoutAccount.method,
            account_holder_name: payoutAccount.accountHolderName,
            bank_name: payoutAccount.bankName,
            account_number_masked: payoutAccount.accountNumberMasked,
            ifsc_or_routing: payoutAccount.ifscOrRouting,
            upi_id_masked: payoutAccount.upiIdMasked,
            verified_sandbox: payoutAccount.verifiedSandbox,
            beneficiary_live_ready: payoutAccount.beneficiaryLiveReady,
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
    });
  }

  async upsertPayoutAccount(
    principal: Principal,
    scope: PartnerWalletScope,
    input: {
      method?: 'BANK' | 'UPI';
      account_holder_name: string;
      bank_name?: string;
      account_number?: string;
      ifsc_or_routing?: string;
      upi_id?: string;
    },
  ) {
    const resolved = await this.resolvePartner(principal, scope);
    const wallet = await this.prisma.$transaction((tx) =>
      this.ensureWallet(tx, resolved.partner, resolved.currency),
    );
    const holder = input.account_holder_name?.trim();
    if (!holder || holder.length < 2) {
      throw Errors.validation('account_holder_name is required');
    }
    const method = input.method === 'UPI' ? 'UPI' : 'BANK';
    let accountNumberMasked: string | null = null;
    let upiIdMasked: string | null = null;
    let accountNumberCipher: string | null = null;
    let upiIdCipher: string | null = null;
    let beneficiaryLiveReady = false;
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
      if (canEncryptBeneficiaries()) {
        accountNumberCipher = encryptBeneficiarySecret(raw);
        beneficiaryLiveReady = Boolean(ifscOrRouting);
      }
    } else {
      const upi = (input.upi_id ?? '').trim().toLowerCase();
      if (!upi.includes('@') || upi.length < 5) {
        throw Errors.validation('upi_id must look like name@bank');
      }
      const [user, host] = upi.split('@');
      upiIdMasked = `${user.slice(0, 2)}***@${host}`;
      if (canEncryptBeneficiaries()) {
        upiIdCipher = encryptBeneficiarySecret(upi);
        beneficiaryLiveReady = true;
      }
    }

    const row = await this.prisma.partnerPayoutAccount.upsert({
      where: { walletId: wallet.id },
      create: {
        id: uuidv7(),
        walletId: wallet.id,
        method,
        accountHolderName: holder,
        bankName,
        accountNumberMasked,
        ifscOrRouting,
        upiIdMasked,
        accountNumberCipher,
        upiIdCipher,
        beneficiaryLiveReady,
        verifiedSandbox: true,
      },
      update: {
        method,
        accountHolderName: holder,
        bankName,
        accountNumberMasked,
        ifscOrRouting,
        upiIdMasked,
        ...(accountNumberCipher ? { accountNumberCipher } : {}),
        ...(upiIdCipher ? { upiIdCipher } : {}),
        beneficiaryLiveReady,
        verifiedSandbox: true,
      },
    });

    const liveReady = isLivePartnerPayoutReady();
    return {
      sandbox: !liveReady,
      live_payout: liveReady,
      message: liveReady
        ? 'Payout account saved with encrypted beneficiary. Live withdraws submit to the payout provider.'
        : canEncryptBeneficiaries()
          ? 'Payout account saved (encrypted for future live use). Sandbox mock withdraw until live gates clear.'
          : 'Payout account saved (masked only). Set PAYOUT_BENEFICIARY_ENCRYPTION_KEY before live disbursements.',
      payout_account: {
        method: row.method,
        account_holder_name: row.accountHolderName,
        bank_name: row.bankName,
        account_number_masked: row.accountNumberMasked,
        ifsc_or_routing: row.ifscOrRouting,
        upi_id_masked: row.upiIdMasked,
        verified_sandbox: row.verifiedSandbox,
        beneficiary_live_ready: row.beneficiaryLiveReady,
      },
    };
  }

  async requestWithdraw(
    principal: Principal,
    scope: PartnerWalletScope,
    input: { amount_minor: string },
  ) {
    const resolved = await this.resolvePartner(principal, scope);
    const wallet = await this.prisma.$transaction((tx) =>
      this.ensureWallet(tx, resolved.partner, resolved.currency),
    );
    const payoutAccount = await this.prisma.partnerPayoutAccount.findUnique({
      where: { walletId: wallet.id },
    });
    if (!payoutAccount) {
      throw Errors.problem(
        409,
        'PAYOUT_ACCOUNT_REQUIRED',
        'Payout account required',
        'Add a bank account or UPI ID before withdrawing from your partner wallet.',
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

    const live = isLivePartnerPayoutReady();

    /**
     * Paytm-style self-withdraw: partner withdraws own wallet balance immediately.
     * No Super Admin approval. Live path submits to gateway and stays PROCESSING until webhook.
     */
    if (live) {
      await this.assertRequiredDocsVerifiedForLivePayout(resolved.partner);
      if (!payoutAccount.beneficiaryLiveReady) {
        throw Errors.problem(
          409,
          'BENEFICIARY_NOT_LIVE_READY',
          'Beneficiary not ready',
          'Re-save bank/UPI after PAYOUT_BENEFICIARY_ENCRYPTION_KEY is configured.',
        );
      }
      let accountNumber: string | null = null;
      let upiId: string | null = null;
      try {
        if (payoutAccount.method === 'BANK' && payoutAccount.accountNumberCipher) {
          accountNumber = decryptBeneficiarySecret(payoutAccount.accountNumberCipher);
        }
        if (payoutAccount.method === 'UPI' && payoutAccount.upiIdCipher) {
          upiId = decryptBeneficiarySecret(payoutAccount.upiIdCipher);
        }
      } catch {
        throw Errors.problem(
          503,
          'BENEFICIARY_DECRYPT_FAILED',
          'Beneficiary decrypt failed',
          'Could not decrypt stored payout destination.',
        );
      }

      const withdrawId = uuidv7();
      const held = await this.prisma.$transaction(async (tx) => {
        const current = await tx.partnerWallet.findUniqueOrThrow({ where: { id: wallet.id } });
        if (current.availableMinor < amount) {
          throw Errors.problem(
            409,
            'INSUFFICIENT_WALLET_BALANCE',
            'Insufficient balance',
            `Available ${current.availableMinor.toString()} ${current.currency}; requested ${amount.toString()}.`,
          );
        }
        const nextAvailable = current.availableMinor - amount;
        const nextHeld = current.heldMinor + amount;
        await tx.partnerWallet.update({
          where: { id: current.id },
          data: { availableMinor: nextAvailable, heldMinor: nextHeld },
        });
        await tx.partnerWalletLedgerEntry.create({
          data: {
            id: uuidv7(),
            walletId: current.id,
            kind: PartnerWalletLedgerKind.WITHDRAW_HOLD,
            amountMinor: amount,
            currency: current.currency,
            balanceAfterMinor: nextAvailable,
            source: 'withdraw',
            sourceKey: withdrawId,
            note: 'Self-withdraw hold — awaiting provider confirmation',
          },
        });
        await tx.partnerWithdrawRequest.create({
          data: {
            id: withdrawId,
            walletId: current.id,
            amountMinor: amount,
            currency: current.currency,
            status: PartnerWithdrawStatus.PROCESSING,
            destinationHint: destination,
            sandbox: false,
            livePayout: true,
            requestedBy: principal.personId,
          },
        });
        return { nextAvailable, currency: current.currency };
      });

      const submit = await this.payoutRail.submit({
        payoutId: withdrawId,
        idempotencyKey: `partner-self-withdraw-${withdrawId}`,
        amountMinor: amount,
        currency: held.currency,
        beneficiary: {
          method: payoutAccount.method,
          account_holder_name: payoutAccount.accountHolderName,
          bank_name: payoutAccount.bankName,
          account_number: accountNumber,
          ifsc_or_routing: payoutAccount.ifscOrRouting,
          upi_id: upiId,
        },
        purpose: 'partner_wallet_self_withdraw',
        notes: `${resolved.partner.partnerTypeCode} self withdraw`,
      });

      if (submit.failed || !submit.submitted) {
        await this.prisma.$transaction(async (tx) => {
          const current = await tx.partnerWallet.findUniqueOrThrow({ where: { id: wallet.id } });
          await tx.partnerWallet.update({
            where: { id: current.id },
            data: {
              availableMinor: current.availableMinor + amount,
              heldMinor: current.heldMinor - amount,
            },
          });
          await tx.partnerWalletLedgerEntry.create({
            data: {
              id: uuidv7(),
              walletId: current.id,
              kind: PartnerWalletLedgerKind.WITHDRAW_RELEASE,
              amountMinor: amount,
              currency: current.currency,
              balanceAfterMinor: current.availableMinor + amount,
              source: 'withdraw',
              sourceKey: `${withdrawId}:release`,
              note: `Self-withdraw submit failed — ${submit.errorCode ?? 'FAILED'}`,
            },
          });
          await tx.partnerWithdrawRequest.update({
            where: { id: withdrawId },
            data: {
              status: PartnerWithdrawStatus.FAILED,
              failureCode: submit.errorCode ?? 'SUBMIT_FAILED',
              providerRef: submit.providerRef ?? null,
            },
          });
        });
        throw Errors.problem(
          502,
          'LIVE_PAYOUT_SUBMIT_FAILED',
          'Live payout submit failed',
          submit.errorCode ?? 'Provider rejected the payout submit.',
        );
      }

      const updated = await this.prisma.partnerWithdrawRequest.update({
        where: { id: withdrawId },
        data: { providerRef: submit.providerRef ?? null, status: PartnerWithdrawStatus.PROCESSING },
      });

      return {
        sandbox: false as const,
        live_payout: true,
        message:
          'Withdraw submitted. Wallet balance is held until the payout provider confirms PAID.',
        available_minor: minorJson(held.nextAvailable),
        withdraw_request: {
          id: updated.id,
          amount_minor: minorJson(updated.amountMinor),
          currency: updated.currency,
          status: updated.status,
          destination_hint: updated.destinationHint,
          provider_ref: updated.providerRef,
          paid_at: null,
        },
      };
    }

    // Sandbox self-withdraw: immediate mock PAID (Paytm-style UX).
    const result = await this.prisma.$transaction(async (tx) => {
      const current = await tx.partnerWallet.findUniqueOrThrow({ where: { id: wallet.id } });
      if (current.availableMinor < amount) {
        throw Errors.problem(
          409,
          'INSUFFICIENT_WALLET_BALANCE',
          'Insufficient balance',
          `Available ${current.availableMinor.toString()} ${current.currency}; requested ${amount.toString()}.`,
        );
      }
      const nextAvailable = current.availableMinor - amount;
      const nextHeld = current.heldMinor + amount;
      await tx.partnerWallet.update({
        where: { id: current.id },
        data: { availableMinor: nextAvailable, heldMinor: nextHeld },
      });
      const withdrawId = uuidv7();
      await tx.partnerWalletLedgerEntry.create({
        data: {
          id: uuidv7(),
          walletId: current.id,
          kind: PartnerWalletLedgerKind.WITHDRAW_HOLD,
          amountMinor: amount,
          currency: current.currency,
          balanceAfterMinor: nextAvailable,
          source: 'withdraw',
          sourceKey: withdrawId,
          note: 'Self-withdraw hold',
        },
      });
      await tx.partnerWithdrawRequest.create({
        data: {
          id: withdrawId,
          walletId: current.id,
          amountMinor: amount,
          currency: current.currency,
          status: PartnerWithdrawStatus.PROCESSING,
          destinationHint: destination,
          sandbox: true,
          livePayout: false,
          requestedBy: principal.personId,
        },
      });
      const mock = await this.payoutRail.submit({
        payoutId: withdrawId,
        idempotencyKey: `partner-self-withdraw-sandbox-${withdrawId}`,
        amountMinor: amount,
        currency: current.currency,
        scenario: 'SUCCESS',
      });
      await tx.partnerWallet.update({
        where: { id: current.id },
        data: {
          heldMinor: nextHeld - amount,
          lifetimeWithdrawnMinor: current.lifetimeWithdrawnMinor + amount,
        },
      });
      await tx.partnerWalletLedgerEntry.create({
        data: {
          id: uuidv7(),
          walletId: current.id,
          kind: PartnerWalletLedgerKind.WITHDRAW_PAID,
          amountMinor: amount,
          currency: current.currency,
          balanceAfterMinor: nextAvailable,
          source: 'withdraw',
          sourceKey: `${withdrawId}:paid`,
          note: `Self-withdraw (sandbox) to ${destination}`,
        },
      });
      const paid = await tx.partnerWithdrawRequest.update({
        where: { id: withdrawId },
        data: {
          status: PartnerWithdrawStatus.PAID,
          providerRef: mock.providerRef ?? `mock_self_withdraw_${withdrawId}`,
          paidAt: new Date(),
        },
      });
      return { paid, available_minor: nextAvailable, destination };
    });

    return {
      sandbox: true as const,
      live_payout: false,
      message: `Withdrawn ${minorJson(result.paid.amountMinor)} ${result.paid.currency} to ${result.destination}. Sandbox mock — live gateway later.`,
      available_minor: minorJson(result.available_minor),
      withdraw_request: {
        id: result.paid.id,
        amount_minor: minorJson(result.paid.amountMinor),
        currency: result.paid.currency,
        status: result.paid.status,
        destination_hint: result.paid.destinationHint,
        provider_ref: result.paid.providerRef,
        paid_at: result.paid.paidAt?.toISOString() ?? null,
      },
    };
  }

  /** Live payouts require admin-verified join KYC docs when the country pack lists them. */
  private async assertRequiredDocsVerifiedForLivePayout(partner: {
    id: string;
    partnerTypeCode: string;
    countryId: string;
  }): Promise<void> {
    const country = await this.prisma.country.findUnique({ where: { id: partner.countryId } });
    const pack = country ? await this.policy.resolvePublished(country.isoAlpha2) : null;
    const row = pack?.document.partner_types[
      partner.partnerTypeCode as keyof typeof pack.document.partner_types
    ];
    const required = row?.required_documents ?? [];
    if (!required.length) {
      return;
    }
    const kycCase = await this.prisma.kycCase.findFirst({
      where: { partnerId: partner.id },
      orderBy: { createdAt: 'desc' },
    });
    const docs = kycCase
      ? await this.prisma.partnerDocument.findMany({ where: { kycCaseId: kycCase.id } })
      : [];
    const missing = missingRequiredDocuments(required, docs, 'activate');
    if (missing.length) {
      throw Errors.problem(
        409,
        'KYC_DOCS_NOT_VERIFIED',
        'KYC documents required',
        `Admin-verified documents required before live withdraw: ${missing.join(', ')}.`,
      );
    }
  }
}
