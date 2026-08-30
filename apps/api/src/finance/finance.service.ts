import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  AffiliateLiabilityStatus,
  ContributionStatus,
  DebitCredit,
  FinanceApprovalKind,
  FinanceReconDomain,
  FinanceReconStatus,
  FinancialFactKind,
  OfferOwnership,
  PaymentIntentStatus,
  PayoutStatus,
  RefundStatus,
  SettlementBatchStatus,
  ShipmentStatus,
  VendorPayableStatus,
} from '@prisma/client';
import { uuidv7 } from '@world-pharma/shared';
import { PrismaService } from '../app/prisma.service';
import { Errors } from '../common/problem';
import { OutboxService } from '../events/outbox.service';
import type { Principal } from '../identity/current-principal';
import { assertMakerChecker } from '../identity/dual-control';
import { assertVendorSellerAccess } from '../catalog/access';
import { CHART } from './chart';
import { MockPayoutAdapter } from './mock-payout.adapter';
import type { MockPayoutScenario } from './payout.port';
import { ReconBreakService } from './recon-break.service';

const PAYABLE_NEXT: Record<VendorPayableStatus, VendorPayableStatus[]> = {
  PENDING: [VendorPayableStatus.ELIGIBLE, VendorPayableStatus.ON_HOLD, VendorPayableStatus.REVERSED],
  ELIGIBLE: [VendorPayableStatus.ON_HOLD, VendorPayableStatus.APPROVED, VendorPayableStatus.REVERSED],
  ON_HOLD: [VendorPayableStatus.ELIGIBLE, VendorPayableStatus.REVERSED],
  APPROVED: [VendorPayableStatus.SCHEDULED, VendorPayableStatus.REVERSED],
  SCHEDULED: [VendorPayableStatus.PAID, VendorPayableStatus.REVERSED],
  PAID: [VendorPayableStatus.REVERSED],
  REVERSED: [],
};

@Injectable()
export class FinanceService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly payoutRail: MockPayoutAdapter,
    private readonly reconBreaks: ReconBreakService,
  ) {}

  async onModuleInit(): Promise<void> {
    const countries = await this.prisma.country.findMany({ select: { id: true } });
    for (const country of countries) {
      await this.ensureChart(country.id);
    }
  }

  async ensureChart(countryId: string): Promise<void> {
    for (const row of CHART) {
      await this.prisma.ledgerAccount.upsert({
        where: { countryId_code: { countryId, code: row.code } },
        update: { name: row.name, type: row.type, active: true },
        create: { id: uuidv7(), countryId, code: row.code, name: row.name, type: row.type },
      });
    }
    await this.prisma.settlementPolicy.upsert({
      where: { countryId },
      update: {},
      create: { id: uuidv7(), countryId, holdDays: 0, dualControl: false },
    });
  }

  /** R7-F sandbox: lab payable fact on published report (no live payout). */
  async recordSandboxLabPayable(input: {
    countryId: string;
    labBookingId: string;
    amountMinor: bigint;
    currency: string;
  }): Promise<void> {
    await this.recordFact({
      countryId: input.countryId,
      kind: FinancialFactKind.LAB_PAYABLE,
      amountMinor: input.amountMinor,
      currency: input.currency,
      sourceKey: `lab_payable:${input.labBookingId}`,
      note: `sandbox lab payable booking=${input.labBookingId}`,
    });
  }

  /** R7-F sandbox: physical report delivery fee on dispatch (no live payout). */
  async recordSandboxReportDeliveryFee(input: {
    countryId: string;
    physicalReportRequestId: string;
    amountMinor: bigint;
    currency: string;
  }): Promise<void> {
    await this.recordFact({
      countryId: input.countryId,
      kind: FinancialFactKind.REPORT_DELIVERY_FEE,
      amountMinor: input.amountMinor,
      currency: input.currency,
      sourceKey: `report_delivery_fee:${input.physicalReportRequestId}`,
      note: `sandbox report delivery fee request=${input.physicalReportRequestId}`,
    });
  }

  /** R8-F sandbox: imaging payable fact on published report (no live payout). */
  async recordSandboxImagingPayable(input: {
    countryId: string;
    imagingBookingId: string;
    amountMinor: bigint;
    currency: string;
  }): Promise<void> {
    await this.recordFact({
      countryId: input.countryId,
      kind: FinancialFactKind.IMAGING_PAYABLE,
      amountMinor: input.amountMinor,
      currency: input.currency,
      sourceKey: `imaging_payable:${input.imagingBookingId}`,
      note: `sandbox imaging payable booking=${input.imagingBookingId}`,
    });
  }

  /** R8-F sandbox: imaging physical report delivery fee on dispatch (no live payout). */
  async recordSandboxImagingReportDeliveryFee(input: {
    countryId: string;
    imagingPhysicalReportRequestId: string;
    amountMinor: bigint;
    currency: string;
  }): Promise<void> {
    await this.recordFact({
      countryId: input.countryId,
      kind: FinancialFactKind.REPORT_DELIVERY_FEE,
      amountMinor: input.amountMinor,
      currency: input.currency,
      sourceKey: `imaging_report_delivery_fee:${input.imagingPhysicalReportRequestId}`,
      note: `sandbox imaging report delivery fee request=${input.imagingPhysicalReportRequestId}`,
    });
  }

  async syncPayment(intentId: string): Promise<void> {
    const intent = await this.prisma.paymentIntent.findUnique({
      where: { id: intentId },
      include: { transactions: true },
    });
    if (!intent) {
      return;
    }
    if (intent.status === PaymentIntentStatus.CAPTURED || intent.status === PaymentIntentStatus.AUTHORIZED_COD) {
      const captured = intent.capturedMinor > 0n ? intent.capturedMinor : intent.amountMinor;
      await this.recordFact({
        countryId: intent.countryId,
        paymentIntentId: intent.id,
        kind: FinancialFactKind.CAPTURE,
        amountMinor: captured,
        currency: intent.currency,
        sourceKey: `capture:${intent.id}`,
      });
    }
    for (const txn of intent.transactions.filter((t) => t.kind === 'fee')) {
      await this.recordFact({
        countryId: intent.countryId,
        paymentIntentId: intent.id,
        kind: FinancialFactKind.GATEWAY_FEE,
        amountMinor: txn.amountMinor,
        currency: txn.currency,
        sourceKey: `gateway_fee:${txn.id}`,
      });
    }
    if (intent.refundedMinor > 0n) {
      const order = await this.prisma.order.findUnique({
        where: { paymentIntentId: intent.id },
        select: { id: true },
      });
      const refundRows = await this.prisma.refund.findMany({
        where: { intentId: intent.id, status: RefundStatus.REFUNDED },
        orderBy: { createdAt: 'asc' },
      });
      if (refundRows.length > 0) {
        for (const row of refundRows) {
          await this.recordFact({
            countryId: intent.countryId,
            orderId: order?.id,
            paymentIntentId: intent.id,
            kind: FinancialFactKind.REFUND,
            amountMinor: row.amountMinor,
            currency: intent.currency,
            sourceKey: `refund:${row.id}`,
          });
        }
      } else {
        await this.recordFact({
          countryId: intent.countryId,
          orderId: order?.id,
          paymentIntentId: intent.id,
          kind: FinancialFactKind.REFUND,
          amountMinor: intent.refundedMinor,
          currency: intent.currency,
          sourceKey: `refund_total:${intent.id}:${intent.refundedMinor.toString()}`,
        });
      }
    }
  }

  async syncOrder(orderId: string): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: true,
        promo: true,
        affiliate: true,
        shipping: true,
        paymentIntent: true,
        shipments: { include: { costs: true } },
      },
    });
    if (!order) {
      return;
    }
    await this.ensureChart(order.countryId);
    await this.syncPayment(order.paymentIntentId);
    if (
      order.paymentIntent.status === PaymentIntentStatus.FAILED
      || order.paymentIntent.status === PaymentIntentStatus.UNKNOWN
    ) {
      return;
    }
    await this.recordFact({
      countryId: order.countryId,
      orderId,
      kind: FinancialFactKind.TAX,
      amountMinor: order.taxMinor,
      currency: order.currency,
      sourceKey: `tax:${orderId}`,
    });
    await this.recordFact({
      countryId: order.countryId,
      orderId,
      kind: FinancialFactKind.SHIPPING_CHARGE,
      amountMinor: order.shippingMinor,
      currency: order.currency,
      sourceKey: `shipping_charge:${orderId}`,
    });
    if ((order.shipping?.subsidyMinor ?? 0n) > 0n) {
      await this.recordFact({
        countryId: order.countryId,
        orderId,
        kind: FinancialFactKind.SHIPPING_SUBSIDY,
        amountMinor: order.shipping!.subsidyMinor,
        currency: order.currency,
        sourceKey: `shipping_subsidy:${orderId}`,
      });
    }
    if ((order.promo?.platformMinor ?? 0n) > 0n) {
      await this.recordFact({
        countryId: order.countryId,
        orderId,
        kind: FinancialFactKind.PROMO_PLATFORM,
        amountMinor: order.promo!.platformMinor,
        currency: order.currency,
        sourceKey: `promo_platform:${orderId}`,
      });
    }
    if ((order.promo?.vendorMinor ?? 0n) > 0n) {
      await this.recordFact({
        countryId: order.countryId,
        orderId,
        kind: FinancialFactKind.PROMO_VENDOR,
        amountMinor: order.promo!.vendorMinor,
        currency: order.currency,
        sourceKey: `promo_vendor:${orderId}`,
      });
    }
    const ownership = await this.orderOwnership(order.items.map((item) => item.offerId));
    if (ownership === OfferOwnership.PLATFORM_OWNED) {
      const cogs = await this.ownedCogs(order.items);
      await this.recordFact({
        countryId: order.countryId,
        orderId,
        kind: FinancialFactKind.COGS,
        amountMinor: cogs,
        currency: order.currency,
        sourceKey: `cogs:${orderId}`,
      });
    } else {
      const rule = await this.freezeRule(order.countryId, order.sellerOrgId);
      const goods = order.goodsMinor - (order.promo?.vendorMinor ?? 0n);
      const take = (goods * BigInt(rule.takeBps)) / 10000n + rule.takeFlatMinor;
      const payableAmt = goods - take;
      await this.recordFact({
        countryId: order.countryId,
        orderId,
        kind: FinancialFactKind.VENDOR_PAYABLE,
        amountMinor: payableAmt,
        currency: order.currency,
        sourceKey: `vendor_payable:${orderId}`,
      });
      await this.prisma.vendorPayable.upsert({
        where: { orderId },
        update: {},
        create: {
          id: uuidv7(),
          orderId,
          sellerOrgId: order.sellerOrgId,
          countryId: order.countryId,
          amountMinor: payableAmt,
          currency: order.currency,
          status: VendorPayableStatus.PENDING,
          takeBpsFrozen: rule.takeBps,
          takeFlatFrozen: rule.takeFlatMinor,
          commercialRuleId: rule.id,
        },
      });
    }
    if (
      order.affiliate
      && !order.affiliate.clinicalBlocked
      && order.affiliate.payable
      && order.affiliate.estimateMinor > 0n
    ) {
      await this.recordFact({
        countryId: order.countryId,
        orderId,
        kind: FinancialFactKind.AFFILIATE,
        amountMinor: order.affiliate.estimateMinor,
        currency: order.currency,
        sourceKey: `affiliate:${orderId}`,
      });
      await this.prisma.affiliateLiability.upsert({
        where: { orderId },
        update: {},
        create: {
          id: uuidv7(),
          orderId,
          amountMinor: order.affiliate.estimateMinor,
          currency: order.currency,
          status: AffiliateLiabilityStatus.PENDING,
          clinicalBlocked: false,
          affiliateCode: order.affiliate.affiliateCode,
        },
      });
    }
    for (const shipment of order.shipments) {
      await this.syncCarrier(shipment.id);
    }
    await this.maybeEligible(orderId);
    await this.postOrderJournals(orderId);
    await this.applyVendorPayableRefundAdjustments(orderId);
    await this.rebuildContribution(orderId);
  }

  async syncCarrier(shipmentId: string): Promise<void> {
    const shipment = await this.prisma.shipment.findUnique({
      where: { id: shipmentId },
      include: { costs: true },
    });
    if (!shipment) {
      return;
    }
    const quoted = [...shipment.costs].reverse().find((row) => row.kind === 'quoted');
    if (quoted) {
      await this.recordFact({
        countryId: shipment.countryId,
        orderId: shipment.orderId,
        shipmentId,
        kind: FinancialFactKind.CARRIER_QUOTED,
        amountMinor: quoted.amountMinor,
        currency: quoted.currency,
        sourceKey: `carrier_quoted:${quoted.id}`,
      });
    }
    const actual = [...shipment.costs].reverse().find((row) => row.kind === 'actual');
    if (actual) {
      await this.recordFact({
        countryId: shipment.countryId,
        orderId: shipment.orderId,
        shipmentId,
        kind: FinancialFactKind.CARRIER_ACTUAL,
        amountMinor: actual.amountMinor,
        currency: actual.currency,
        sourceKey: `carrier_actual:${actual.id}`,
      });
      if (actual.amountMinor != null) {
        await this.postJournal({
          countryId: shipment.countryId,
          sourceEventId: `freight:${actual.id}`,
          postingRuleId: 'freight_actual',
          currency: actual.currency,
          lines: [
            { code: 'EXP_FREIGHT', dc: DebitCredit.DEBIT, amountMinor: actual.amountMinor },
            { code: 'AP_CARRIER', dc: DebitCredit.CREDIT, amountMinor: actual.amountMinor },
          ],
        });
      }
    }
    await this.maybeEligible(shipment.orderId);
    await this.rebuildContribution(shipment.orderId);
  }

  async recordGatewayFee(input: { paymentIntentId: string; amountMinor: bigint; currency: string; sourceKey: string }) {
    const intent = await this.prisma.paymentIntent.findUniqueOrThrow({ where: { id: input.paymentIntentId } });
    await this.recordFact({
      countryId: intent.countryId,
      paymentIntentId: intent.id,
      kind: FinancialFactKind.GATEWAY_FEE,
      amountMinor: input.amountMinor,
      currency: input.currency,
      sourceKey: input.sourceKey,
    });
    const order = await this.prisma.order.findUnique({ where: { paymentIntentId: intent.id } });
    if (order) {
      await this.postJournal({
        countryId: order.countryId,
        sourceEventId: input.sourceKey,
        postingRuleId: 'gateway_fee',
        currency: input.currency,
        lines: [
          { code: 'EXP_GATEWAY_FEE', dc: DebitCredit.DEBIT, amountMinor: input.amountMinor },
          { code: 'AST_GATEWAY_CLEARING', dc: DebitCredit.CREDIT, amountMinor: input.amountMinor },
        ],
      });
      await this.rebuildContribution(order.id);
    }
    return { recorded: true, sandbox: true };
  }

  async transitionPayable(id: string, to: VendorPayableStatus) {
    const row = await this.prisma.vendorPayable.findUniqueOrThrow({ where: { id } });
    if (row.status === to) {
      return this.presentPayable(row);
    }
    if (!PAYABLE_NEXT[row.status].includes(to)) {
      throw Errors.problem(409, 'ILLEGAL_PAYABLE_TRANSITION', 'Illegal payable transition', `${row.status} → ${to}`);
    }
    const updated = await this.prisma.vendorPayable.update({ where: { id }, data: { status: to } });
    return this.presentPayable(updated);
  }

  async approveAffiliate(orderId: string) {
    const row = await this.prisma.affiliateLiability.findUnique({ where: { orderId } });
    if (!row) {
      throw Errors.notFound('Affiliate liability not found.');
    }
    if (row.clinicalBlocked) {
      throw Errors.problem(409, 'AFFILIATE_CLINICAL_BLOCKED', 'Clinical blocked', 'Clinical affiliate payout is not enabled.');
    }
    if (row.status === AffiliateLiabilityStatus.PENDING) {
      await this.prisma.affiliateLiability.update({
        where: { orderId },
        data: { status: AffiliateLiabilityStatus.APPROVED },
      });
    }
    return this.prisma.affiliateLiability.findUniqueOrThrow({ where: { orderId } });
  }

  async reverseAffiliate(orderId: string) {
    const row = await this.prisma.affiliateLiability.findUnique({ where: { orderId } });
    if (!row) {
      throw Errors.notFound('Affiliate liability not found.');
    }
    await this.prisma.affiliateLiability.update({
      where: { orderId },
      data: { status: AffiliateLiabilityStatus.REVERSED },
    });
    return { reversed: true };
  }

  async openSettlement(principal: Principal, countryId: string, currency: string) {
    await this.ensureChart(countryId);
    const period = await this.prisma.settlementPeriod.create({
      data: {
        id: uuidv7(),
        countryId,
        currency,
        startsAt: new Date(Date.now() - 86400000),
        endsAt: new Date(),
      },
    });
    const batch = await this.prisma.settlementBatch.create({
      data: {
        id: uuidv7(),
        periodId: period.id,
        status: SettlementBatchStatus.OPEN,
        currency,
        createdBy: principal.personId,
      },
    });
    const payables = await this.prisma.vendorPayable.findMany({
      where: { countryId, currency, status: VendorPayableStatus.APPROVED },
    });
    for (const payable of payables) {
      const originalGross =
        (await this.findAmount(payable.orderId, FinancialFactKind.VENDOR_PAYABLE)) ?? payable.amountMinor;
      const refunds = await this.refundTotalForOrder(payable.orderId);
      const netMinor = originalGross > refunds ? originalGross - refunds : 0n;
      if (payable.amountMinor !== netMinor) {
        await this.prisma.vendorPayable.update({
          where: { id: payable.id },
          data: { amountMinor: netMinor },
        });
      }
      await this.prisma.settlementLine.create({
        data: {
          id: uuidv7(),
          batchId: batch.id,
          sellerOrgId: payable.sellerOrgId,
          vendorPayableId: payable.id,
          grossMinor: originalGross,
          refundMinor: refunds,
          feeMinor: 0n,
          netMinor,
          currency,
        },
      });
      await this.prisma.vendorPayable.update({
        where: { id: payable.id },
        data: { status: VendorPayableStatus.SCHEDULED },
      });
    }
    return this.getBatch(batch.id);
  }

  async approveSettlement(principal: Principal, batchId: string) {
    const batch = await this.prisma.settlementBatch.findUniqueOrThrow({
      where: { id: batchId },
      include: { period: true },
    });
    const policy = await this.prisma.settlementPolicy.findUnique({ where: { countryId: batch.period.countryId } });
    assertMakerChecker({
      dualControlRequired: Boolean(policy?.dualControl),
      createdByPersonId: batch.createdBy,
      actorPersonId: principal.personId,
      actionLabel: 'settlement approval',
    });
    if (batch.status !== SettlementBatchStatus.OPEN && batch.status !== SettlementBatchStatus.PREVIEW) {
      throw Errors.problem(409, 'ILLEGAL_SETTLEMENT_TRANSITION', 'Illegal settlement transition', batch.status);
    }
    await this.prisma.settlementBatch.update({
      where: { id: batchId },
      data: { status: SettlementBatchStatus.APPROVED, approvedBy: principal.personId },
    });
    await this.prisma.financeApproval.create({
      data: {
        id: uuidv7(),
        kind: FinanceApprovalKind.SETTLEMENT,
        targetId: batchId,
        requestedBy: batch.createdBy ?? principal.personId,
        approvedBy: principal.personId,
        status: 'APPROVED',
        decidedAt: new Date(),
      },
    });
    return this.getBatch(batchId);
  }

  async submitPayout(principal: Principal, batchId: string, idempotencyKey: string, scenario: MockPayoutScenario = 'SUCCESS') {
    const existing = await this.prisma.payout.findUnique({ where: { idempotencyKey } });
    if (existing) {
      return this.presentPayout(existing);
    }
    const batch = await this.prisma.settlementBatch.findUniqueOrThrow({
      where: { id: batchId },
      include: { lines: true },
    });
    if (batch.status !== SettlementBatchStatus.APPROVED) {
      throw Errors.problem(409, 'SETTLEMENT_NOT_APPROVED', 'Settlement not approved', 'Approve the batch before payout.');
    }
    const net = batch.lines.reduce((sum, line) => sum + line.netMinor, 0n);
    const payout = await this.prisma.payout.create({
      data: {
        id: uuidv7(),
        batchId,
        kind: 'VENDOR',
        amountMinor: net,
        currency: batch.currency,
        status: PayoutStatus.CREATED,
        idempotencyKey,
        scenario,
        sandbox: true,
        createdBy: principal.personId,
      },
    });
    return this.presentPayout(payout);
  }

  async approvePayout(principal: Principal, payoutId: string) {
    const payout = await this.prisma.payout.findUniqueOrThrow({ where: { id: payoutId } });
    if (payout.batchId) {
      const batch = await this.prisma.settlementBatch.findUnique({
        where: { id: payout.batchId },
        include: { period: true },
      });
      const policy = batch
        ? await this.prisma.settlementPolicy.findUnique({ where: { countryId: batch.period.countryId } })
        : null;
      assertMakerChecker({
        dualControlRequired: Boolean(policy?.dualControl),
        createdByPersonId: payout.createdBy,
        actorPersonId: principal.personId,
        actionLabel: 'payout approval',
      });
    }
    if (payout.status !== PayoutStatus.CREATED) {
      throw Errors.problem(409, 'ILLEGAL_PAYOUT_TRANSITION', 'Illegal payout transition', payout.status);
    }
    const updated = await this.prisma.payout.update({
      where: { id: payoutId },
      data: { status: PayoutStatus.APPROVED, approvedBy: principal.personId },
    });
    return this.presentPayout(updated);
  }

  async executePayout(payoutId: string) {
    const payout = await this.prisma.payout.findUnique({
      where: { id: payoutId },
      include: { batch: { include: { period: true, lines: { include: { vendorPayable: true } } } } },
    });
    if (!payout) {
      throw Errors.notFound('Payout not found.');
    }
    if (payout.status === PayoutStatus.UNKNOWN) {
      throw Errors.problem(
        409,
        'PAYOUT_UNKNOWN',
        'Payout unknown',
        'UNKNOWN payout must not be resubmitted until reconciled.',
      );
    }
    if (payout.status === PayoutStatus.PAID) {
      return this.presentPayoutWithLedger(payout);
    }
    if (payout.status !== PayoutStatus.APPROVED && payout.status !== PayoutStatus.CREATED) {
      throw Errors.problem(409, 'ILLEGAL_PAYOUT_TRANSITION', 'Illegal payout transition', payout.status);
    }
    if (payout.batch?.status === SettlementBatchStatus.CANCELLED) {
      throw Errors.problem(
        409,
        'SETTLEMENT_BATCH_CANCELLED',
        'Settlement batch cancelled',
        'Cannot execute payout against a cancelled settlement batch.',
      );
    }
    const result = await this.payoutRail.submit({
      payoutId: payout.id,
      idempotencyKey: payout.idempotencyKey,
      amountMinor: payout.amountMinor,
      currency: payout.currency,
      scenario: (payout.scenario as MockPayoutScenario) ?? 'SUCCESS',
    });
    let status: PayoutStatus = PayoutStatus.SUBMITTED;
    if (result.unknown) {
      status = PayoutStatus.UNKNOWN;
    } else if (result.failed) {
      status = PayoutStatus.FAILED;
    } else if (result.paid) {
      status = PayoutStatus.PAID;
    }

    let ledgerResult: { journalId: string | null; duplicate: boolean } | null = null;
    if (status === PayoutStatus.PAID) {
      const countryId = payout.batch?.period.countryId;
      if (!countryId) {
        throw Errors.problem(
          409,
          'PAYOUT_COUNTRY_UNKNOWN',
          'Payout country unknown',
          'PAID payout requires a settlement batch with country scope.',
        );
      }
      this.assertPayoutCountryScope(payout);
      ledgerResult = await this.postVendorPayoutPaidJournal({
        countryId,
        payoutId: payout.id,
        amountMinor: payout.amountMinor,
        currency: payout.currency,
        kind: payout.kind,
      });
      if (!ledgerResult.journalId) {
        throw Errors.problem(
          503,
          'PAYOUT_LEDGER_POST_FAILED',
          'Payout ledger posting failed',
          'PAID payout cannot be finalized without a balanced AP→clearing journal.',
        );
      }
    }

    const updated = await this.prisma.payout.update({
      where: { id: payoutId },
      data: { status, providerRef: result.providerRef ?? payout.providerRef },
    });
    if (status === PayoutStatus.PAID && payout.batchId) {
      await this.prisma.settlementBatch.update({
        where: { id: payout.batchId },
        data: { status: SettlementBatchStatus.EXECUTED },
      });
      await this.prisma.vendorPayable.updateMany({
        where: { settlementLines: { some: { batchId: payout.batchId } } },
        data: { status: VendorPayableStatus.PAID },
      });
    }
    if (status === PayoutStatus.UNKNOWN && payout.batch?.period.countryId) {
      await this.reconBreaks.ensurePayoutUnknownBreak({
        payoutId: payout.id,
        countryId: payout.batch.period.countryId,
        amountMinor: payout.amountMinor,
        currency: payout.currency,
        providerRef: result.providerRef ?? payout.providerRef,
      });
    }
    await this.prisma.$transaction(async (tx) => {
      await this.outbox.enqueue(tx, {
        type: status === PayoutStatus.PAID ? 'PAYOUT_PAID' : result.unknown ? 'PAYOUT_UNKNOWN' : 'PAYOUT_FAILED',
        aggregateType: 'Payout',
        aggregateId: payout.id,
        producer: 'finance',
        payload: {
          sandbox: true,
          mock: true,
          status,
          journal_id: ledgerResult?.journalId ?? null,
          ledger_duplicate: ledgerResult?.duplicate ?? false,
        },
        occurrenceKey: `payout:${payout.id}:${status}`,
      });
    });
    return this.presentPayoutWithLedger(updated, ledgerResult);
  }

  async importExistingRecon() {
    const payments = await this.prisma.paymentReconciliation.findMany({ take: 50, orderBy: { createdAt: 'desc' } });
    const carriers = await this.prisma.carrierReconciliation.findMany({ take: 50, orderBy: { createdAt: 'desc' } });
    let imported = 0;
    let skipped = 0;
    for (const row of payments) {
      const status =
        row.status === 'MATCHED'
          ? FinanceReconStatus.MATCHED
          : row.status === 'BREAK'
            ? FinanceReconStatus.BREAK
            : FinanceReconStatus.INVESTIGATE;
      const existing = await this.prisma.financeReconciliation.findFirst({
        where: {
          domain: FinanceReconDomain.PSP,
          internalRef: row.intentId,
          breakType: row.breakType,
          status,
        },
      });
      if (existing) {
        skipped += 1;
        continue;
      }
      await this.prisma.financeReconciliation.create({
        data: {
          id: uuidv7(),
          domain: FinanceReconDomain.PSP,
          status,
          breakType: row.breakType,
          internalRef: row.intentId,
          detail: row.detail,
        },
      });
      imported += 1;
    }
    for (const row of carriers) {
      const status =
        row.status === 'MATCHED'
          ? FinanceReconStatus.MATCHED
          : row.status === 'BREAK'
            ? FinanceReconStatus.BREAK
            : FinanceReconStatus.INVESTIGATE;
      const existing = await this.prisma.financeReconciliation.findFirst({
        where: {
          domain: FinanceReconDomain.CARRIER,
          internalRef: row.shipmentId,
          breakType: row.breakType,
          status,
        },
      });
      if (existing) {
        skipped += 1;
        continue;
      }
      await this.prisma.financeReconciliation.create({
        data: {
          id: uuidv7(),
          domain: FinanceReconDomain.CARRIER,
          status,
          breakType: row.breakType,
          internalRef: row.shipmentId,
          detail: row.detail,
        },
      });
      imported += 1;
    }
    return { imported, skipped, total: payments.length + carriers.length };
  }

  async listFinanceReconciliations(query: {
    domain?: FinanceReconDomain;
    status?: FinanceReconStatus;
    limit?: number;
  } = {}) {
    const take = Math.min(Math.max(query.limit ?? 50, 1), 100);
    const rows = await this.prisma.financeReconciliation.findMany({
      where: {
        domain: query.domain,
        status: query.status,
      },
      orderBy: { createdAt: 'desc' },
      take,
    });
    return {
      data: rows.map((row) => ({
        id: row.id,
        domain: row.domain,
        status: row.status,
        workflow_status: row.workflowStatus,
        break_type: row.breakType,
        classification: row.classification,
        source_kind: row.sourceKind,
        source_ref: row.sourceRef,
        country_id: row.countryId,
        internal_ref: row.internalRef,
        external_ref: row.externalRef,
        amount_minor: row.amountMinor === null ? null : row.amountMinor.toString(),
        currency: row.currency,
        detail: row.detail,
        created_at: row.createdAt.toISOString(),
        updated_at: row.updatedAt.toISOString(),
      })),
      sandbox: true,
      live_psp: false,
    };
  }

  async dashboard(principal?: Principal) {
    const { loadAccessScope, countryFilter } = await import('../identity/scope');
    const scope = principal ? await loadAccessScope(this.prisma, principal) : undefined;
    const countryId = scope ? countryFilter(scope) : undefined;
    const [facts, payables, payouts, contributions] = await Promise.all([
      this.prisma.financialFact.count({ where: countryId ? { countryId } : undefined }),
      this.prisma.vendorPayable.count({ where: countryId ? { countryId } : undefined }),
      this.prisma.payout.count({
        where: countryId ? { batch: { period: { countryId } } } : undefined,
      }),
      this.prisma.contributionSnapshot.count({
        where: countryId ? { order: { countryId } } : undefined,
      }),
    ]);
    return {
      sandbox: true,
      live_payout: false,
      facts,
      vendor_payables: payables,
      payouts,
      contributions,
      note: 'Contribution is not net profit. Mock payout only.',
    };
  }

  async listFacts(orderId?: string) {
    const rows = await this.prisma.financialFact.findMany({
      where: orderId ? { orderId } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return { data: rows.map((row) => this.presentFact(row)) };
  }

  async listJournals() {
    const rows = await this.prisma.journal.findMany({
      include: { lines: { include: { account: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return { data: rows.map((row) => this.presentJournal(row)) };
  }

  async getContribution(orderId: string) {
    const row = await this.prisma.contributionSnapshot.findUnique({ where: { orderId } });
    if (!row) {
      throw Errors.notFound('Contribution not found.');
    }
    return this.presentContribution(row);
  }

  async listPayables(sellerOrgId?: string) {
    const rows = await this.prisma.vendorPayable.findMany({
      where: sellerOrgId ? { sellerOrgId } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return { data: rows.map((row) => this.presentPayable(row)) };
  }

  /** Admin oversight — finance:read. Not a vendor seller-scoped path. */
  async listSettlementLines(sellerOrgId?: string) {
    const rows = await this.prisma.settlementLine.findMany({
      where: sellerOrgId ? { sellerOrgId } : undefined,
      include: {
        batch: { include: { period: true } },
        vendorPayable: true,
      },
      orderBy: { id: 'desc' },
      take: 50,
    });
    return {
      data: rows.map((row) => this.presentVendorSettlementLine(row)),
      sandbox: true,
      live_payout: false,
      message: 'Sandbox settlement oversight. Real bank payout remains OFF.',
    };
  }

  async listVendorSettlements(principal: Principal, sellerOrgId: string) {
    await assertVendorSellerAccess(this.prisma, principal, sellerOrgId);
    const rows = await this.prisma.settlementLine.findMany({
      where: { sellerOrgId },
      include: {
        batch: { include: { period: true } },
        vendorPayable: true,
      },
      orderBy: { id: 'desc' },
      take: 50,
    });
    return { data: rows.map((row) => this.presentVendorSettlementLine(row)) };
  }

  async getVendorSettlementLine(principal: Principal, lineId: string) {
    // Do not include payouts — payouts RLS remains company/platform-only; vendors see sandbox flags only.
    const row = await this.prisma.settlementLine.findUnique({
      where: { id: lineId },
      include: {
        batch: { include: { period: true } },
        vendorPayable: true,
      },
    });
    if (!row) {
      throw Errors.forbidden('You cannot access this settlement.');
    }
    await assertVendorSellerAccess(this.prisma, principal, row.sellerOrgId);
    return this.presentVendorSettlementLine(row, true);
  }

  private presentVendorSettlementLine(
    row: {
      id: string;
      batchId: string;
      sellerOrgId: string;
      grossMinor: bigint;
      refundMinor: bigint;
      feeMinor: bigint;
      netMinor: bigint;
      currency: string;
      batch: {
        status: string;
        createdAt: Date;
        period?: { startsAt: Date; endsAt: Date } | null;
        payouts?: Array<{ id: string; status: string; sandbox: boolean; amountMinor: bigint; currency: string }>;
      };
      vendorPayable: {
        id: string;
        orderId: string;
        status: string;
        amountMinor: bigint;
        takeBpsFrozen: number;
        takeFlatFrozen: bigint;
        holdUntil: Date | null;
      };
    },
    detailed = false,
  ) {
    const base = {
      id: row.id,
      batch_id: row.batchId,
      seller_org_id: row.sellerOrgId,
      status: row.batch.status,
      currency: row.currency,
      gross_minor: row.grossMinor.toString(),
      refund_minor: row.refundMinor.toString(),
      fee_minor: row.feeMinor.toString(),
      net_minor: row.netMinor.toString(),
      payable_status: row.vendorPayable.status,
      order_id: row.vendorPayable.orderId,
      payable_id: row.vendorPayable.id,
      period_starts_at: row.batch.period?.startsAt ?? null,
      period_ends_at: row.batch.period?.endsAt ?? null,
      batch_created_at: row.batch.createdAt,
      sandbox: true,
      live_payout: false,
      message: 'Sandbox settlement line. Real bank payout remains OFF.',
    };
    if (!detailed) {
      return base;
    }
    return {
      ...base,
      take_bps_frozen: row.vendorPayable.takeBpsFrozen,
      take_flat_frozen: row.vendorPayable.takeFlatFrozen.toString(),
      hold_until: row.vendorPayable.holdUntil,
      payable_amount_minor: row.vendorPayable.amountMinor.toString(),
      // Payout rows stay company-scoped; vendors only see sandbox boundary flags.
      payouts: (row.batch.payouts ?? []).map((payout) => ({
        id: payout.id,
        status: payout.status,
        amount_minor: payout.amountMinor.toString(),
        currency: payout.currency,
        sandbox: payout.sandbox,
        live_payout: false,
      })),
      payout_visibility: 'sandbox_flags_only',
    };
  }

  async getBatch(id: string) {
    const batch = await this.prisma.settlementBatch.findUniqueOrThrow({
      where: { id },
      include: { lines: true, payouts: true },
    });
    return {
      id: batch.id,
      status: batch.status,
      currency: batch.currency,
      sandbox: true,
      lines: batch.lines.map((line) => ({
        id: line.id,
        seller_org_id: line.sellerOrgId,
        gross_minor: line.grossMinor.toString(),
        refund_minor: line.refundMinor.toString(),
        net_minor: line.netMinor.toString(),
      })),
      payouts: batch.payouts.map((row) => this.presentPayout(row)),
    };
  }

  /** R14-B: sync payment facts/journals after PSP settlement match. */
  async syncFinanceForPaymentIntent(intentId: string): Promise<void> {
    const order = await this.prisma.order.findUnique({ where: { paymentIntentId: intentId } });
    await this.syncPayment(intentId);
    if (order) {
      await this.syncOrder(order.id);
    }
  }

  /** R14-B: idempotent vendor payout execution journal (AP → clearing). */
  async postVendorPayoutPaidJournal(input: {
    countryId: string;
    payoutId: string;
    amountMinor: bigint;
    currency: string;
    kind: string;
  }): Promise<{ journalId: string | null; duplicate: boolean }> {
    const sourceEventId = `payout:${input.payoutId}`;
    const postingRuleId = 'vendor_payout_paid';
    const existing = await this.prisma.journal.findUnique({
      where: { sourceEventId_postingRuleId: { sourceEventId, postingRuleId } },
    });
    if (existing) {
      return { journalId: existing.id, duplicate: true };
    }
    if (input.amountMinor <= 0n) {
      throw Errors.problem(
        409,
        'INVALID_PAYOUT_AMOUNT',
        'Invalid payout amount',
        'PAID payout journal requires a positive amount.',
      );
    }
    const payableAccount = input.kind === 'VENDOR' ? 'AP_VENDOR' : `AP_${input.kind}`;
    const journal = await this.postJournal({
      countryId: input.countryId,
      sourceEventId,
      postingRuleId,
      currency: input.currency,
      lines: [
        { code: payableAccount, dc: DebitCredit.DEBIT, amountMinor: input.amountMinor },
        { code: 'AST_GATEWAY_CLEARING', dc: DebitCredit.CREDIT, amountMinor: input.amountMinor },
      ],
    });
    return { journalId: journal?.id ?? null, duplicate: false };
  }

  /** R14-B: idempotent PSP settlement confirmation journal. */
  async postPspSettlementMatchJournal(input: {
    countryId: string;
    recordId: string;
    amountMinor: bigint;
    feeMinor: bigint;
    currency: string;
  }): Promise<{ journalId: string | null; duplicate: boolean }> {
    const sourceEventId = `psp_settlement:${input.recordId}`;
    const postingRuleId = 'psp_settlement_match';
    const existing = await this.prisma.journal.findUnique({
      where: { sourceEventId_postingRuleId: { sourceEventId, postingRuleId } },
    });
    if (existing) {
      return { journalId: existing.id, duplicate: true };
    }
    const fee = input.feeMinor > 0n ? input.feeMinor : 0n;
    const gross = input.amountMinor;
    if (gross <= 0n) {
      return { journalId: null, duplicate: false };
    }
    const lines: Array<{ code: string; dc: DebitCredit; amountMinor: bigint }> = [];
    if (fee > 0n) {
      lines.push({ code: 'EXP_GATEWAY_FEE', dc: DebitCredit.DEBIT, amountMinor: fee });
    }
    lines.push({ code: 'AST_GATEWAY_CLEARING', dc: DebitCredit.DEBIT, amountMinor: gross - fee });
    lines.push({ code: 'AST_GATEWAY_CLEARING', dc: DebitCredit.CREDIT, amountMinor: gross });
    const journal = await this.postJournal({
      countryId: input.countryId,
      sourceEventId,
      postingRuleId,
      currency: input.currency,
      lines,
    });
    return { journalId: journal?.id ?? null, duplicate: false };
  }

  async reverseJournal(journalId: string) {
    const journal = await this.prisma.journal.findUniqueOrThrow({
      where: { id: journalId },
      include: { lines: { include: { account: true } } },
    });
    return this.postJournal({
      countryId: journal.countryId,
      sourceEventId: `reverse:${journal.id}`,
      postingRuleId: `reverse:${journal.postingRuleId}`,
      currency: journal.currency,
      reversesJournalId: journal.id,
      lines: journal.lines.map((line) => ({
        code: line.account.code,
        dc: line.dc === DebitCredit.DEBIT ? DebitCredit.CREDIT : DebitCredit.DEBIT,
        amountMinor: line.amountMinor,
      })),
    });
  }

  private async maybeEligible(orderId: string) {
    const payable = await this.prisma.vendorPayable.findUnique({ where: { orderId } });
    if (!payable || payable.status !== VendorPayableStatus.PENDING) {
      return;
    }
    const shipment = await this.prisma.shipment.findFirst({ where: { orderId } });
    const shipped =
      shipment &&
      (shipment.status === ShipmentStatus.DELIVERED
        || shipment.status === ShipmentStatus.LABEL_CREATED
        || shipment.status === ShipmentStatus.IN_TRANSIT
        || shipment.status === ShipmentStatus.OUT_FOR_DELIVERY);
    if (!shipped) {
      return;
    }
    const policy = await this.prisma.settlementPolicy.findUnique({ where: { countryId: payable.countryId } });
    if (policy && policy.holdDays > 0) {
      await this.prisma.vendorPayable.update({
        where: { id: payable.id },
        data: { status: VendorPayableStatus.ON_HOLD, holdUntil: new Date(Date.now() + policy.holdDays * 86400000) },
      });
      return;
    }
    await this.prisma.vendorPayable.update({
      where: { id: payable.id },
      data: { status: VendorPayableStatus.ELIGIBLE },
    });
  }

  private async postOrderJournals(orderId: string) {
    const order = await this.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { paymentIntent: true },
    });
    const capture = await this.prisma.financialFact.findUnique({ where: { sourceKey: `capture:${order.paymentIntentId}` } });
    if (!capture?.amountMinor) {
      return;
    }
    await this.postJournal({
      countryId: order.countryId,
      sourceEventId: `capture:${order.paymentIntentId}`,
      postingRuleId: 'customer_capture',
      currency: order.currency,
      lines: [
        { code: 'AST_GATEWAY_CLEARING', dc: DebitCredit.DEBIT, amountMinor: capture.amountMinor },
        { code: 'LIAB_UNEARNED', dc: DebitCredit.CREDIT, amountMinor: capture.amountMinor },
      ],
    });
    const vendor = await this.prisma.financialFact.findUnique({ where: { sourceKey: `vendor_payable:${orderId}` } });
    if (vendor?.amountMinor != null) {
      const remainder = capture.amountMinor - vendor.amountMinor;
      const lines = [
        { code: 'LIAB_UNEARNED', dc: DebitCredit.DEBIT, amountMinor: capture.amountMinor },
        { code: 'AP_VENDOR', dc: DebitCredit.CREDIT, amountMinor: vendor.amountMinor },
      ];
      if (remainder > 0n) {
        lines.push({ code: 'REV_COMMISSION', dc: DebitCredit.CREDIT, amountMinor: remainder });
      } else if (remainder < 0n) {
        lines.push({ code: 'REV_COMMISSION', dc: DebitCredit.DEBIT, amountMinor: -remainder });
      }
      await this.postJournal({
        countryId: order.countryId,
        sourceEventId: `vendor:${orderId}`,
        postingRuleId: 'marketplace_split',
        currency: order.currency,
        lines,
      });
    }
    const cogs = await this.prisma.financialFact.findUnique({ where: { sourceKey: `cogs:${orderId}` } });
    if (cogs?.amountMinor != null) {
      await this.postJournal({
        countryId: order.countryId,
        sourceEventId: `owned:${orderId}`,
        postingRuleId: 'owned_revenue_cogs',
        currency: order.currency,
        lines: [
          { code: 'LIAB_UNEARNED', dc: DebitCredit.DEBIT, amountMinor: capture.amountMinor },
          { code: 'REV_OWNED', dc: DebitCredit.CREDIT, amountMinor: capture.amountMinor },
          { code: 'COGS_OWNED', dc: DebitCredit.DEBIT, amountMinor: cogs.amountMinor },
          { code: 'AST_INVENTORY', dc: DebitCredit.CREDIT, amountMinor: cogs.amountMinor },
        ],
      });
    }
    await this.postRefundJournalsForOrder(orderId);
  }

  private async listRefundedAmounts(intentId: string): Promise<Array<{ reference: string; amountMinor: bigint }>> {
    const rows = await this.prisma.refund.findMany({
      where: { intentId, status: RefundStatus.REFUNDED },
      orderBy: { createdAt: 'asc' },
      select: { id: true, amountMinor: true },
    });
    if (rows.length > 0) {
      return rows.map((row) => ({ reference: row.id, amountMinor: row.amountMinor }));
    }
    const intent = await this.prisma.paymentIntent.findUnique({
      where: { id: intentId },
      select: { refundedMinor: true },
    });
    if (!intent || intent.refundedMinor <= 0n) {
      return [];
    }
    return [
      {
        reference: `refund_total:${intentId}:${intent.refundedMinor.toString()}`,
        amountMinor: intent.refundedMinor,
      },
    ];
  }

  private async postRefundJournalsForOrder(orderId: string): Promise<void> {
    const order = await this.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { paymentIntent: true },
    });
    const capture = await this.prisma.financialFact.findUnique({
      where: { sourceKey: `capture:${order.paymentIntentId}` },
    });
    if (!capture?.amountMinor) {
      return;
    }
    const vendorFact = await this.prisma.financialFact.findUnique({
      where: { sourceKey: `vendor_payable:${orderId}` },
    });
    const originalVendor = vendorFact?.amountMinor ?? null;
    const refundAmounts = await this.listRefundedAmounts(order.paymentIntentId);
    let priorRefundTotal = 0n;
    for (const refund of refundAmounts) {
      await this.postJournal({
        countryId: order.countryId,
        sourceEventId: `customer_refund:${refund.reference}`,
        postingRuleId: 'customer_refund',
        currency: order.currency,
        lines: [
          { code: 'LIAB_UNEARNED', dc: DebitCredit.DEBIT, amountMinor: refund.amountMinor },
          { code: 'AST_GATEWAY_CLEARING', dc: DebitCredit.CREDIT, amountMinor: refund.amountMinor },
        ],
      });
      if (originalVendor != null && originalVendor > 0n) {
        const remainingVendor = originalVendor > priorRefundTotal ? originalVendor - priorRefundTotal : 0n;
        const vendorDebit = refund.amountMinor > remainingVendor ? remainingVendor : refund.amountMinor;
        priorRefundTotal += refund.amountMinor;
        if (vendorDebit > 0n) {
          await this.postJournal({
            countryId: order.countryId,
            sourceEventId: `vendor_refund:${refund.reference}`,
            postingRuleId: 'vendor_refund_adjustment',
            currency: order.currency,
            lines: [
              { code: 'AP_VENDOR', dc: DebitCredit.DEBIT, amountMinor: vendorDebit },
              { code: 'LIAB_UNEARNED', dc: DebitCredit.CREDIT, amountMinor: vendorDebit },
            ],
          });
        }
      }
    }
  }

  private async applyVendorPayableRefundAdjustments(orderId: string): Promise<void> {
    const payable = await this.prisma.vendorPayable.findUnique({ where: { orderId } });
    if (!payable) {
      return;
    }
    const originalGross = await this.findAmount(orderId, FinancialFactKind.VENDOR_PAYABLE);
    if (originalGross == null || originalGross <= 0n) {
      return;
    }
    const refundTotal = await this.refundTotalForOrder(orderId);
    const outstanding = originalGross > refundTotal ? originalGross - refundTotal : 0n;
    if (payable.amountMinor !== outstanding) {
      await this.prisma.vendorPayable.update({
        where: { id: payable.id },
        data: { amountMinor: outstanding },
      });
    }
  }

  private async rebuildContribution(orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) {
      return;
    }
    const capture = await this.sumFactsByPayment(order.paymentIntentId, FinancialFactKind.CAPTURE);
    const refunds =
      (await this.sumFacts(orderId, FinancialFactKind.REFUND))
      + (await this.sumFactsByPayment(order.paymentIntentId, FinancialFactKind.REFUND));
    const fee =
      (await this.findAmount(orderId, FinancialFactKind.GATEWAY_FEE))
      ?? (await this.findAmountByPayment(order.paymentIntentId, FinancialFactKind.GATEWAY_FEE));
    const cogs = await this.findAmount(orderId, FinancialFactKind.COGS);
    const vendor = await this.findAmount(orderId, FinancialFactKind.VENDOR_PAYABLE);
    const promo = await this.sumFacts(orderId, FinancialFactKind.PROMO_PLATFORM);
    const affiliate = await this.sumFacts(orderId, FinancialFactKind.AFFILIATE);
    const tax = await this.sumFacts(orderId, FinancialFactKind.TAX);
    const shipRev = await this.sumFacts(orderId, FinancialFactKind.SHIPPING_CHARGE);
    const shipSub = await this.sumFacts(orderId, FinancialFactKind.SHIPPING_SUBSIDY);
    const actualFact = await this.prisma.financialFact.findFirst({
      where: { orderId, kind: FinancialFactKind.CARRIER_ACTUAL },
      orderBy: { createdAt: 'desc' },
    });
    const adj = await this.sumFacts(orderId, FinancialFactKind.ADJUSTMENT);
    const actualCarrier = actualFact ? actualFact.amountMinor : null;
    const net = capture - refunds;
    const hasCapture = await this.prisma.financialFact.findFirst({
      where: { paymentIntentId: order.paymentIntentId, kind: FinancialFactKind.CAPTURE },
    });
    const contribution =
      capture
      - refunds
      - (vendor ?? 0n)
      - (cogs ?? 0n)
      - (fee ?? 0n)
      - promo
      - affiliate
      - tax
      - (actualCarrier ?? 0n)
      - shipSub
      - adj;
    const status: ContributionStatus = !hasCapture
      ? ContributionStatus.BLOCKED_UNKNOWN
      : actualFact == null || actualFact.amountMinor === null || fee === null
        ? ContributionStatus.PROVISIONAL
        : ContributionStatus.COMPLETE;
    const bps = net > 0n ? Number((contribution * 10000n) / net) : null;
    await this.prisma.contributionSnapshot.upsert({
      where: { orderId },
      update: {
        gmvMinor: order.goodsMinor + order.shippingMinor,
        grossRevenueMinor: capture,
        netRevenueMinor: net,
        cogsMinor: cogs,
        vendorCostMinor: vendor,
        gatewayFeeMinor: fee,
        promoCostMinor: promo,
        affiliateCostMinor: affiliate,
        taxMinor: tax,
        shippingRevenueMinor: shipRev,
        shippingSubsidyMinor: shipSub,
        actualCarrierCostMinor: actualCarrier,
        refundsMinor: refunds,
        adjustmentsMinor: adj,
        contributionMinor: contribution,
        contributionBps: bps,
        status,
        version: { increment: 1 },
      },
      create: {
        id: uuidv7(),
        orderId,
        currency: order.currency,
        gmvMinor: order.goodsMinor + order.shippingMinor,
        grossRevenueMinor: capture,
        netRevenueMinor: net,
        cogsMinor: cogs,
        vendorCostMinor: vendor,
        gatewayFeeMinor: fee,
        promoCostMinor: promo,
        affiliateCostMinor: affiliate,
        taxMinor: tax,
        shippingRevenueMinor: shipRev,
        shippingSubsidyMinor: shipSub,
        actualCarrierCostMinor: actualCarrier,
        refundsMinor: refunds,
        adjustmentsMinor: adj,
        contributionMinor: contribution,
        contributionBps: bps,
        status,
      },
    });
  }

  private async recordFact(input: {
    countryId: string;
    orderId?: string;
    paymentIntentId?: string;
    shipmentId?: string;
    kind: FinancialFactKind;
    amountMinor: bigint | null;
    currency: string;
    sourceKey: string;
    note?: string;
  }) {
    await this.prisma.financialFact.upsert({
      where: { sourceKey: input.sourceKey },
      update: {},
      create: {
        id: uuidv7(),
        countryId: input.countryId,
        orderId: input.orderId,
        paymentIntentId: input.paymentIntentId,
        shipmentId: input.shipmentId,
        kind: input.kind,
        amountMinor: input.amountMinor,
        currency: input.currency,
        sourceKey: input.sourceKey,
        note: input.note,
      },
    });
  }

  private async postJournal(input: {
    countryId: string;
    sourceEventId: string;
    postingRuleId: string;
    currency: string;
    reversesJournalId?: string;
    lines: Array<{ code: string; dc: DebitCredit; amountMinor: bigint }>;
  }) {
    const usable = input.lines.filter((line) => line.amountMinor > 0n);
    if (!usable.length) {
      return null;
    }
    const debit = usable.filter((l) => l.dc === DebitCredit.DEBIT).reduce((s, l) => s + l.amountMinor, 0n);
    const credit = usable.filter((l) => l.dc === DebitCredit.CREDIT).reduce((s, l) => s + l.amountMinor, 0n);
    if (debit !== credit) {
      throw Errors.problem(409, 'UNBALANCED_JOURNAL', 'Unbalanced journal', `debit ${debit} credit ${credit}`);
    }
    const existing = await this.prisma.journal.findUnique({
      where: { sourceEventId_postingRuleId: { sourceEventId: input.sourceEventId, postingRuleId: input.postingRuleId } },
    });
    if (existing) {
      return existing;
    }
    const accounts = await this.prisma.ledgerAccount.findMany({ where: { countryId: input.countryId } });
    const byCode = new Map(accounts.map((a) => [a.code, a]));
    try {
      return await this.prisma.$transaction(async (tx) => {
        const journal = await tx.journal.create({
          data: {
            id: uuidv7(),
            countryId: input.countryId,
            sourceEventId: input.sourceEventId,
            postingRuleId: input.postingRuleId,
            reversesJournalId: input.reversesJournalId,
            currency: input.currency,
            sandbox: true,
          },
        });
        for (const line of usable) {
          const account = byCode.get(line.code);
          if (!account) {
            throw Errors.problem(409, 'UNKNOWN_ACCOUNT', 'Unknown account', line.code);
          }
          await tx.journalLine.create({
            data: {
              id: uuidv7(),
              journalId: journal.id,
              accountId: account.id,
              dc: line.dc,
              amountMinor: line.amountMinor,
              currency: input.currency,
            },
          });
        }
        await this.outbox.enqueue(tx, {
          type: 'LEDGER_JOURNAL_POSTED',
          aggregateType: 'Journal',
          aggregateId: journal.id,
          producer: 'finance',
          countryId: input.countryId,
          payload: { sandbox: true, posting_rule_id: input.postingRuleId },
          occurrenceKey: `journal:${journal.id}`,
        });
        return journal;
      });
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === 'P2002') {
        return this.prisma.journal.findUniqueOrThrow({
          where: {
            sourceEventId_postingRuleId: { sourceEventId: input.sourceEventId, postingRuleId: input.postingRuleId },
          },
        });
      }
      throw error;
    }
  }

  private async orderOwnership(offerIds: string[]): Promise<OfferOwnership> {
    const offers = await this.prisma.catalogOffer.findMany({ where: { id: { in: offerIds } } });
    if (offers.length && offers.every((o) => o.ownership === OfferOwnership.PLATFORM_OWNED)) {
      return OfferOwnership.PLATFORM_OWNED;
    }
    return OfferOwnership.VENDOR_OWNED;
  }

  private async ownedCogs(items: Array<{ offerId: string; qty: number }>): Promise<bigint | null> {
    let total = 0n;
    for (const item of items) {
      const price = await this.prisma.priceVersion.findFirst({
        where: { offerId: item.offerId, isCurrent: true },
      });
      if (!price) {
        return null;
      }
      total += price.costMinor * BigInt(item.qty);
    }
    return total;
  }

  private async freezeRule(countryId: string, sellerOrgId: string) {
    const rule =
      (await this.prisma.commercialRule.findFirst({
        where: { sellerOrgId },
        orderBy: { priority: 'desc' },
      }))
      ?? (await this.prisma.commercialRule.findFirst({
        where: { countryId, sellerOrgId: null },
        orderBy: { priority: 'desc' },
      }));
    return { id: rule?.id ?? null, takeBps: rule?.takeBps ?? 0, takeFlatMinor: rule?.takeFlatMinor ?? 0n };
  }

  private async refundTotalForOrder(orderId: string): Promise<bigint> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { paymentIntentId: true },
    });
    if (!order) {
      return 0n;
    }
    const intent = await this.prisma.paymentIntent.findUnique({
      where: { id: order.paymentIntentId },
      select: { refundedMinor: true },
    });
    return intent?.refundedMinor ?? 0n;
  }

  private async sumFacts(orderId: string, kind: FinancialFactKind) {
    const rows = await this.prisma.financialFact.findMany({ where: { orderId, kind } });
    return rows.reduce((s, r) => s + (r.amountMinor ?? 0n), 0n);
  }

  private async sumFactsByPayment(paymentIntentId: string, kind: FinancialFactKind) {
    const rows = await this.prisma.financialFact.findMany({ where: { paymentIntentId, kind } });
    return rows.reduce((s, r) => s + (r.amountMinor ?? 0n), 0n);
  }

  private async findAmount(orderId: string, kind: FinancialFactKind) {
    const row = await this.prisma.financialFact.findFirst({ where: { orderId, kind }, orderBy: { createdAt: 'desc' } });
    return row ? row.amountMinor : null;
  }

  private async findAmountByPayment(paymentIntentId: string, kind: FinancialFactKind) {
    const row = await this.prisma.financialFact.findFirst({
      where: { paymentIntentId, kind },
      orderBy: { createdAt: 'desc' },
    });
    return row ? row.amountMinor : null;
  }

  private presentFact(row: { id: string; kind: string; amountMinor: bigint | null; currency: string; sourceKey: string }) {
    return {
      id: row.id,
      kind: row.kind,
      amount_minor: row.amountMinor === null ? null : row.amountMinor.toString(),
      currency: row.currency,
      source_key: row.sourceKey,
    };
  }

  private presentJournal(row: {
    id: string;
    currency: string;
    postingRuleId: string;
    lines: Array<{ dc: DebitCredit; amountMinor: bigint; account: { code: string } }>;
  }) {
    const debit = row.lines.filter((l) => l.dc === DebitCredit.DEBIT).reduce((s, l) => s + l.amountMinor, 0n);
    const credit = row.lines.filter((l) => l.dc === DebitCredit.CREDIT).reduce((s, l) => s + l.amountMinor, 0n);
    return {
      id: row.id,
      currency: row.currency,
      posting_rule_id: row.postingRuleId,
      balanced: debit === credit,
      debit_minor: debit.toString(),
      credit_minor: credit.toString(),
      lines: row.lines.map((l) => ({ account: l.account.code, dc: l.dc, amount_minor: l.amountMinor.toString() })),
    };
  }

  private presentPayable(row: {
    id: string;
    orderId: string;
    sellerOrgId: string;
    amountMinor: bigint;
    currency: string;
    status: VendorPayableStatus;
    takeBpsFrozen: number;
  }) {
    return {
      id: row.id,
      order_id: row.orderId,
      seller_org_id: row.sellerOrgId,
      amount_minor: row.amountMinor.toString(),
      currency: row.currency,
      status: row.status,
      take_bps_frozen: row.takeBpsFrozen,
    };
  }

  private assertPayoutCountryScope(payout: {
    batch: {
      period: { countryId: string };
      lines: Array<{ vendorPayable: { countryId: string; currency: string } | null; currency: string }>;
    } | null;
    currency: string;
  }) {
    if (!payout.batch) {
      return;
    }
    const batchCountryId = payout.batch.period.countryId;
    for (const line of payout.batch.lines) {
      if (!line.vendorPayable) {
        continue;
      }
      if (line.vendorPayable.countryId !== batchCountryId) {
        throw Errors.problem(
          409,
          'PAYOUT_COUNTRY_MISMATCH',
          'Payout country mismatch',
          'Settlement line payable country does not match batch country.',
        );
      }
      if (line.vendorPayable.currency !== payout.currency || line.currency !== payout.currency) {
        throw Errors.problem(
          409,
          'PAYOUT_CURRENCY_MISMATCH',
          'Payout currency mismatch',
          'Settlement payout currency does not match payable currency.',
        );
      }
    }
  }

  private async presentPayoutWithLedger(
    row: {
      id: string;
      status: PayoutStatus;
      amountMinor: bigint;
      currency: string;
      idempotencyKey: string;
      providerRef: string | null;
      sandbox: boolean;
    },
    ledgerResult?: { journalId: string | null; duplicate: boolean } | null,
  ) {
    const base = this.presentPayout(row);
    if (row.status !== PayoutStatus.PAID) {
      return {
        ...base,
        ledger_posting_status: 'NOT_APPLICABLE' as const,
        journal_id: null,
        journal_source_event_id: null,
        posting_rule_id: null,
        ledger_duplicate: false,
      };
    }
    const sourceEventId = `payout:${row.id}`;
    const postingRuleId = 'vendor_payout_paid';
    let journalId = ledgerResult?.journalId ?? null;
    let duplicate = ledgerResult?.duplicate ?? false;
    if (!journalId) {
      const journal = await this.prisma.journal.findUnique({
        where: { sourceEventId_postingRuleId: { sourceEventId, postingRuleId } },
      });
      journalId = journal?.id ?? null;
      duplicate = Boolean(journal);
    }
    return {
      ...base,
      ledger_posting_status: journalId ? ('POSTED' as const) : ('FAILED' as const),
      journal_id: journalId,
      journal_source_event_id: sourceEventId,
      posting_rule_id: postingRuleId,
      ledger_duplicate: duplicate,
    };
  }

  private presentPayout(row: {
    id: string;
    status: PayoutStatus;
    amountMinor: bigint;
    currency: string;
    idempotencyKey: string;
    providerRef: string | null;
    sandbox: boolean;
  }) {
    return {
      id: row.id,
      status: row.status,
      amount_minor: row.amountMinor.toString(),
      currency: row.currency,
      idempotency_key: row.idempotencyKey,
      provider_ref: row.providerRef,
      sandbox: row.sandbox,
      live: false,
    };
  }

  private presentContribution(row: {
    orderId: string;
    currency: string;
    gmvMinor: bigint;
    grossRevenueMinor: bigint;
    netRevenueMinor: bigint;
    cogsMinor: bigint | null;
    vendorCostMinor: bigint | null;
    gatewayFeeMinor: bigint | null;
    promoCostMinor: bigint;
    affiliateCostMinor: bigint;
    taxMinor: bigint;
    shippingRevenueMinor: bigint;
    shippingSubsidyMinor: bigint;
    actualCarrierCostMinor: bigint | null;
    refundsMinor: bigint;
    adjustmentsMinor: bigint;
    contributionMinor: bigint | null;
    contributionBps: number | null;
    status: ContributionStatus;
  }) {
    return {
      order_id: row.orderId,
      currency: row.currency,
      gmv_minor: row.gmvMinor.toString(),
      gross_revenue_minor: row.grossRevenueMinor.toString(),
      net_revenue_minor: row.netRevenueMinor.toString(),
      cogs_minor: row.cogsMinor === null ? null : row.cogsMinor.toString(),
      vendor_cost_minor: row.vendorCostMinor === null ? null : row.vendorCostMinor.toString(),
      gateway_fee_minor: row.gatewayFeeMinor === null ? null : row.gatewayFeeMinor.toString(),
      promo_cost_minor: row.promoCostMinor.toString(),
      affiliate_cost_minor: row.affiliateCostMinor.toString(),
      tax_minor: row.taxMinor.toString(),
      shipping_revenue_minor: row.shippingRevenueMinor.toString(),
      shipping_subsidy_minor: row.shippingSubsidyMinor.toString(),
      actual_carrier_cost_minor: row.actualCarrierCostMinor === null ? null : row.actualCarrierCostMinor.toString(),
      refunds_minor: row.refundsMinor.toString(),
      adjustments_minor: row.adjustmentsMinor.toString(),
      contribution_minor: row.contributionMinor === null ? null : row.contributionMinor.toString(),
      contribution_bps: row.contributionBps,
      status: row.status,
      label: 'contribution',
      not_net_profit: true,
    };
  }
}
