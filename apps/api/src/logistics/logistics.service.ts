import { createHash } from 'node:crypto';
import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  CarrierReconStatus,
  LogisticsJobType,
  Prisma,
  ProofOfDeliveryKind,
  ShipmentStatus,
} from '@prisma/client';
import { uuidv7 } from '@world-pharma/shared';
import { PrismaService } from '../app/prisma.service';
import { Errors } from '../common/problem';
import { OutboxService } from '../events/outbox.service';
import { FinanceService } from '../finance/finance.service';
import type { Principal } from '../identity/current-principal';
import { assertVendorSellerAccess } from '../catalog/access';
import type { MockBookingScenario } from './carrier.port';
import { MockCarrierAdapter } from './mock.adapter';
import { CarrierRouter } from './router';
import { seedMockCarrier } from './seed';
import { assertShipmentTransition, canTransitionShipment, eventForShipment } from './state';

const WEBHOOK_TTL_MS = 5 * 60 * 1000;

@Injectable()
export class LogisticsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly mock: MockCarrierAdapter,
    private readonly router: CarrierRouter,
    private readonly finance: FinanceService,
  ) {}

  async onModuleInit(): Promise<void> {
    await seedMockCarrier(this.prisma);
  }

  async quote(input: {
    countryIso2: string;
    originIso2: string;
    destIso2: string;
    currency: string;
    international?: boolean;
    rx?: boolean;
    temperature?: string;
  }) {
    const international = Boolean(input.international) || input.originIso2 !== input.destIso2;
    const decision = await this.router.choose({
      countryIso2: input.countryIso2,
      originIso2: input.originIso2,
      destIso2: input.destIso2,
      international,
      rx: Boolean(input.rx),
      temperature: input.temperature ?? 'AMBIENT',
      serviceLevel: 'STANDARD',
    });
    const quoted = await this.mock.quote({
      originIso2: input.originIso2,
      destIso2: input.destIso2,
      currency: input.currency,
      serviceLevel: international ? 'QUOTE_FAILURE' : 'STANDARD',
      weightGrams: 500,
      international,
    });
    return {
      sandbox: true,
      carrier: decision.carrierCode,
      customer_charge_minor: '0',
      carrier_quote_cost_minor: quoted.quotedCostMinor === null ? null : quoted.quotedCostMinor.toString(),
      platform_subsidy_minor: '0',
      vendor_subsidy_minor: '0',
      tax_minor: '0',
      currency: quoted.currency,
      service_level: 'STANDARD',
      routing: decision,
      note: 'Customer charge stays on the Order snapshot. NULL carrier cost is not zero.',
    };
  }

  async requestBooking(shipmentId: string, scenario: MockBookingScenario = 'BOOK_SUCCESS') {
    const shipment = await this.prisma.shipment.findUniqueOrThrow({
      where: { id: shipmentId },
      include: { order: { include: { items: true, country: true } } },
    });
    if (shipment.status === ShipmentStatus.BOOKING_UNKNOWN) {
      throw Errors.problem(
        409,
        'BOOKING_UNKNOWN',
        'Booking unknown',
        'Reconcile this shipment before another carrier. Dual booking is forbidden.',
      );
    }
    if (
      shipment.status === ShipmentStatus.BOOKED ||
      shipment.status === ShipmentStatus.LABEL_CREATED ||
      shipment.status === ShipmentStatus.DELIVERED
    ) {
      return this.present(shipmentId);
    }
    const exclude = shipment.status === ShipmentStatus.BOOKING_FAILED ? shipment.carrierId : null;
    const iso2 = shipment.order.country.isoAlpha2;
    const decision = await this.router.choose({
      countryIso2: iso2,
      originIso2: iso2,
      destIso2: iso2,
      international: false,
      rx: shipment.order.items.some((item) => item.rxRequired),
      temperature: shipment.temperature,
      serviceLevel: shipment.serviceLevel,
      excludeCarrierId: exclude,
    });
    await this.prisma.shipment.update({
      where: { id: shipmentId },
      data: {
        mockScenario: scenario,
        carrierId: decision.carrierId,
        carrierAccountId: decision.accountId,
        routingJson: decision as Prisma.InputJsonValue,
        bookingKey: shipment.bookingKey ?? `book:${shipmentId}`,
      },
    });
    await this.transition(shipmentId, ShipmentStatus.BOOKING, 'booking_start');
    return this.executeBooking(shipmentId);
  }

  async executeBooking(shipmentId: string) {
    const shipment = await this.prisma.shipment.findUniqueOrThrow({ where: { id: shipmentId } });
    const scenario = (shipment.mockScenario as MockBookingScenario) ?? 'BOOK_SUCCESS';
    const result = await this.mock.createShipment({
      shipmentId,
      idempotencyKey: shipment.bookingKey ?? `book:${shipmentId}`,
      scenario,
    });
    if (result.unknown) {
      await this.prisma.shipment.update({
        where: { id: shipmentId },
        data: { providerRef: result.providerRef, carrierRef: result.providerRef },
      });
      return this.transition(shipmentId, ShipmentStatus.BOOKING_UNKNOWN, 'timeout');
    }
    if (!result.submitted || result.accepted === false) {
      return this.transition(shipmentId, ShipmentStatus.BOOKING_FAILED, result.errorCode ?? 'rejected');
    }
    await this.prisma.shipment.update({
      where: { id: shipmentId },
      data: {
        providerRef: result.providerRef,
        trackingNumber: result.trackingNumber,
        carrierRef: result.providerRef,
      },
    });
    await this.ensurePackage(shipmentId);
    await this.transition(shipmentId, ShipmentStatus.BOOKED, 'booked');
    const label = await this.mock.createLabel(result.providerRef!);
    const trackingNumber = result.trackingNumber ?? label.trackingNumber;
    await this.prisma.shipmentLabel.upsert({
      where: { shipmentId },
      update: { trackingNumber: label.trackingNumber, labelRef: label.labelRef },
      create: {
        id: uuidv7(),
        shipmentId,
        carrierCode: 'MOCK',
        trackingNumber: label.trackingNumber,
        labelRef: label.labelRef,
        labelFormat: 'MOCK',
      },
    });
    await this.prisma.shipment.update({
      where: { id: shipmentId },
      data: { trackingNumber },
    });
    const quoted = await this.mock.quote({
      originIso2: '*',
      destIso2: '*',
      currency: shipment.currency,
      serviceLevel: 'STANDARD',
      weightGrams: 500,
      international: false,
    });
    await this.addCost(shipmentId, 'quoted', quoted.quotedCostMinor, shipment.currency);
    return this.transition(shipmentId, ShipmentStatus.LABEL_CREATED, 'label');
  }

  async reconcile(shipmentId: string) {
    const shipment = await this.prisma.shipment.findUniqueOrThrow({ where: { id: shipmentId } });
    if (!shipment.providerRef) {
      throw Errors.problem(409, 'NO_PROVIDER_REF', 'No provider ref', 'Nothing to reconcile.');
    }
    const tracked = await this.mock.track(shipment.providerRef);
    if (shipment.status === ShipmentStatus.BOOKING_UNKNOWN) {
      if (tracked.status === ShipmentStatus.BOOKED) {
        await this.transition(shipmentId, ShipmentStatus.BOOKED, 'reconcile_ok');
      } else {
        this.mock.resolve(shipment.providerRef, ShipmentStatus.BOOKING_FAILED);
        await this.transition(shipmentId, ShipmentStatus.BOOKING_FAILED, 'reconcile_fail');
      }
    }
    const invoice = await this.mock.fetchInvoice(shipment.providerRef);
    const actual = invoice.find((line) => line.kind === 'actual');
    if (!actual || actual.amountMinor === null) {
      await this.prisma.carrierReconciliation.create({
        data: {
          id: uuidv7(),
          shipmentId,
          status: CarrierReconStatus.INVESTIGATE,
          breakType: 'missing_actual_cost',
          detail: 'Actual carrier cost is NULL, not zero.',
        },
      });
      await this.emit(shipmentId, shipment.countryId, 'CARRIER_RECONCILIATION_EXCEPTION', {
        break_type: 'missing_actual_cost',
      });
      return { status: 'BREAK', break_type: 'missing_actual_cost', actual_cost_minor: null };
    }
    await this.addCost(shipmentId, 'actual', actual.amountMinor, actual.currency);
    const quoted = await this.prisma.carrierCost.findFirst({
      where: { shipmentId, kind: 'quoted' },
      orderBy: { createdAt: 'desc' },
    });
    if (quoted?.amountMinor != null && actual.amountMinor !== quoted.amountMinor) {
      await this.prisma.carrierReconciliation.create({
        data: {
          id: uuidv7(),
          shipmentId,
          status: CarrierReconStatus.BREAK,
          breakType: 'amount_mismatch',
          detail: `quoted ${quoted.amountMinor} actual ${actual.amountMinor}`,
        },
      });
      await this.emit(shipmentId, shipment.countryId, 'CARRIER_RECONCILIATION_EXCEPTION', {
        break_type: 'amount_mismatch',
      });
      return { status: 'BREAK', break_type: 'amount_mismatch', actual_cost_minor: actual.amountMinor.toString() };
    }
    await this.emit(shipmentId, shipment.countryId, 'CARRIER_COST_RECORDED', {
      actual_cost_minor: actual.amountMinor.toString(),
    });
    return { status: 'MATCHED', actual_cost_minor: actual.amountMinor.toString() };
  }

  async ingestWebhook(carrierId: string, raw: string, signature: string | undefined) {
    if (carrierId.toLowerCase() !== 'mock') {
      throw Errors.notFound('Unknown sandbox carrier.');
    }
    if (!this.mock.verifyWebhook(raw, signature)) {
      throw Errors.unauthorized('Invalid sandbox carrier signature.');
    }
    const parsed = this.mock.parseWebhook(raw);
    const body = JSON.parse(raw) as { ts?: string; occurred_at?: string };
    const stamp = body.ts ?? body.occurred_at;
    if (stamp) {
      const at = Date.parse(stamp);
      if (Number.isFinite(at) && Math.abs(Date.now() - at) > WEBHOOK_TTL_MS) {
        throw Errors.problem(409, 'WEBHOOK_REPLAY', 'Stale webhook', 'Timestamp is outside the replay window.');
      }
    }
    const uuidish = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(parsed.shipmentRef);
    const shipment = await this.prisma.shipment.findFirst({
      where: uuidish
        ? { OR: [{ providerRef: parsed.shipmentRef }, { id: parsed.shipmentRef }] }
        : { providerRef: parsed.shipmentRef },
    });
    if (!shipment) {
      throw Errors.notFound('Shipment not found.');
    }
    try {
      await this.prisma.shipmentTrackingEvent.create({
        data: {
          id: uuidv7(),
          shipmentId: shipment.id,
          providerEventId: parsed.providerEventId,
          providerCode: parsed.providerCode,
          normalized: parsed.normalized,
          sequence: parsed.sequence,
          occurredAt: new Date(),
          description: parsed.providerCode,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return { accepted: true, duplicate: true, sandbox: true };
      }
      throw err;
    }
    if (shipment.status === ShipmentStatus.DELIVERED && parsed.normalized === ShipmentStatus.IN_TRANSIT) {
      return { accepted: true, ignored: 'stale', sandbox: true };
    }
    if (parsed.normalized === ShipmentStatus.DELIVERY_FAILED) {
      const n = await this.prisma.deliveryAttempt.count({ where: { shipmentId: shipment.id } });
      await this.prisma.deliveryAttempt.create({
        data: { id: uuidv7(), shipmentId: shipment.id, attemptNo: n + 1, status: 'FAILED', reason: 'mock_failed' },
      });
    }
    await this.advanceTo(shipment.id, parsed.normalized, `webhook:${parsed.providerCode}`);
    return { accepted: true, duplicate: false, sandbox: true };
  }

  async createOtp(shipmentId: string) {
    const secretHash = createHash('sha256').update('123456').digest('hex');
    await this.prisma.proofOfDelivery.create({
      data: { id: uuidv7(), shipmentId, kind: ProofOfDeliveryKind.OTP, secretHash },
    });
    return { created: true, hashed: true, plaintext: false };
  }

  async verifyOtp(shipmentId: string, code: string) {
    const row = await this.prisma.proofOfDelivery.findFirst({
      where: { shipmentId, kind: ProofOfDeliveryKind.OTP },
      orderBy: { createdAt: 'desc' },
    });
    if (!row) {
      throw Errors.notFound('No OTP challenge.');
    }
    const secretHash = createHash('sha256').update(code).digest('hex');
    if (secretHash !== row.secretHash) {
      throw Errors.unauthorized('OTP mismatch.');
    }
    return this.advanceTo(shipmentId, ShipmentStatus.DELIVERED, 'otp_ok');
  }

  async markRto(shipmentId: string) {
    let shipment = await this.prisma.shipment.findUniqueOrThrow({ where: { id: shipmentId } });
    if (shipment.status === ShipmentStatus.RETURN_TO_ORIGIN || shipment.status === ShipmentStatus.RETURNED) {
      return {
        disposition: 'QUARANTINE',
        note: 'Medicines are not auto-restocked. QUARANTINE | INSPECT | RESTOCK | DESTROY remain future controlled ops.',
      };
    }
    if (shipment.status !== ShipmentStatus.DELIVERY_FAILED) {
      const toOfd = walk(shipment.status, ShipmentStatus.OUT_FOR_DELIVERY);
      for (const step of toOfd) {
        await this.transition(shipmentId, step, `rto_walk:${step}`);
      }
      shipment = await this.prisma.shipment.findUniqueOrThrow({ where: { id: shipmentId } });
      if (shipment.status !== ShipmentStatus.DELIVERY_FAILED) {
        await this.advanceTo(shipmentId, ShipmentStatus.DELIVERY_FAILED, 'fail_before_rto');
      }
    }
    await this.transition(shipmentId, ShipmentStatus.RETURN_TO_ORIGIN, 'rto');
    return {
      disposition: 'QUARANTINE',
      note: 'Medicines are not auto-restocked. QUARANTINE | INSPECT | RESTOCK | DESTROY remain future controlled ops.',
    };
  }

  async listCustomer(principal: Principal) {
    const rows = await this.prisma.shipment.findMany({
      where: { customerPersonId: principal.personId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return {
      data: rows.map((row) => ({
        id: row.id,
        status: row.status,
        tracking_number: row.trackingNumber,
        sandbox: true,
      })),
    };
  }

  async getCustomer(principal: Principal, id: string) {
    const row = await this.prisma.shipment.findUnique({
      where: { id },
      include: {
        label: true,
        trackingEvents: { orderBy: { sequence: 'asc' } },
        deliveryAttempts: { orderBy: { attemptNo: 'asc' } },
        costs: true,
        recon: true,
      },
    });
    if (!row || row.customerPersonId !== principal.personId) {
      throw Errors.forbidden('You cannot view another customer’s shipment.');
    }
    return {
      id: row.id,
      status: row.status,
      tracking_number: row.trackingNumber,
      service_level: row.serviceLevel,
      sandbox: true,
      attempts: row.deliveryAttempts.map((a) => ({
        attempt_no: a.attemptNo,
        status: a.status,
        reason: a.reason,
        at: a.occurredAt,
      })),
      timeline: row.trackingEvents.map((ev) => ({
        status: ev.normalized,
        at: ev.occurredAt,
        description: ev.description,
      })),
      message: 'Mock carrier. No live DHL.',
    };
  }

  async listVendor(principal: Principal, sellerOrgId: string) {
    await assertVendorSellerAccess(this.prisma, principal, sellerOrgId);
    const rows = await this.prisma.shipment.findMany({
      where: { sellerOrgId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return { data: rows.map((row) => ({ id: row.id, status: row.status, tracking_number: row.trackingNumber })) };
  }

  async getVendor(principal: Principal, id: string) {
    const row = await this.prisma.shipment.findUnique({ where: { id } });
    if (!row) {
      throw Errors.forbidden('You cannot access another seller’s shipments.');
    }
    await assertVendorSellerAccess(this.prisma, principal, row.sellerOrgId);
    return this.present(id);
  }

  async adminSearch() {
    const rows = await this.prisma.shipment.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
    return { data: await Promise.all(rows.map((row) => this.present(row.id))) };
  }

  async partnerJob(principal: Principal, shipmentId: string) {
    const row = await this.load(shipmentId);
    await this.assertSeller(principal, row.sellerOrgId);
    return {
      job_type: LogisticsJobType.MEDICINE_DELIVERY,
      shipment_id: row.id,
      customer: { contact: 'masked' },
      pod: 'OTP',
      note: 'No clinical documents. Rider app is not shipped in 1F. SAMPLE_COLLECTION / SAMPLE_TRANSPORT / REPORT_DELIVERY are contracts only.',
    };
  }

  mockResolve(providerRef: string, status: ShipmentStatus) {
    this.mock.resolve(providerRef, status);
  }

  private async advanceTo(shipmentId: string, target: ShipmentStatus, reason: string) {
    const current = await this.prisma.shipment.findUniqueOrThrow({ where: { id: shipmentId } });
    if (current.status === target) {
      return this.present(shipmentId);
    }
    if (canTransitionShipment(current.status, target)) {
      return this.transition(shipmentId, target, reason);
    }
    const path = walk(current.status, target);
    if (!path.length) {
      if (current.status === ShipmentStatus.DELIVERED) {
        return { accepted: true, ignored: 'stale', sandbox: true };
      }
      throw Errors.problem(
        409,
        'ILLEGAL_SHIPMENT_TRANSITION',
        'Illegal transition',
        `Cannot move ${current.status} → ${target}.`,
      );
    }
    for (const step of path) {
      await this.transition(shipmentId, step, `${reason}:${step}`);
    }
    return this.present(shipmentId);
  }

  private async transition(shipmentId: string, to: ShipmentStatus, reason: string) {
    const shipment = await this.prisma.shipment.findUniqueOrThrow({ where: { id: shipmentId } });
    if (shipment.status === to) {
      return this.present(shipmentId);
    }
    try {
      assertShipmentTransition(shipment.status, to);
    } catch {
      throw Errors.problem(
        409,
        'ILLEGAL_SHIPMENT_TRANSITION',
        'Illegal transition',
        `Cannot move ${shipment.status} → ${to}.`,
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.shipment.update({ where: { id: shipmentId }, data: { status: to } });
      const type = eventForShipment(to);
      if (type) {
        await this.outbox.enqueue(tx, {
          type,
          aggregateType: 'Shipment',
          aggregateId: shipmentId,
          producer: 'logistics',
          countryId: shipment.countryId,
          payload: {
            from: shipment.status,
            to,
            reason,
            customer_person_id: shipment.customerPersonId,
            sandbox: true,
          },
          occurrenceKey: `${type}:${shipmentId}:${shipment.status}:${to}:${reason}:${uuidv7()}`,
        });
      }
    });
    return this.present(shipmentId);
  }

  private async addCost(shipmentId: string, kind: string, amountMinor: bigint | null, currency: string) {
    await this.prisma.carrierCost.create({
      data: { id: uuidv7(), shipmentId, kind, amountMinor, currency },
    });
    await this.finance.syncCarrier(shipmentId);
  }

  private async ensurePackage(shipmentId: string) {
    const existing = await this.prisma.shipmentPackage.findFirst({ where: { shipmentId } });
    if (existing) {
      return;
    }
    const shipment = await this.prisma.shipment.findUniqueOrThrow({
      where: { id: shipmentId },
      include: { order: { include: { items: true } } },
    });
    const pkg = await this.prisma.shipmentPackage.create({
      data: { id: uuidv7(), shipmentId, currency: shipment.currency, temperature: shipment.temperature },
    });
    for (const item of shipment.order.items) {
      await this.prisma.shipmentPackageItem.create({
        data: { id: uuidv7(), packageId: pkg.id, sku: item.sku, qty: item.qty },
      });
    }
  }

  private async emit(shipmentId: string, countryId: string, type: string, payload: Record<string, unknown>) {
    await this.prisma.$transaction(async (tx) => {
      await this.outbox.enqueue(tx, {
        type,
        aggregateType: 'Shipment',
        aggregateId: shipmentId,
        producer: 'logistics',
        countryId,
        payload: { ...payload, sandbox: true },
        occurrenceKey: `${type}:${shipmentId}:${JSON.stringify(payload).slice(0, 24)}:${uuidv7()}`,
      });
    });
  }

  private async assertSeller(principal: Principal, sellerOrgId: string) {
    const allowed = await this.prisma.membership.count({
      where: { personId: principal.personId, organizationId: sellerOrgId, status: 'ACTIVE', deletedAt: null },
    });
    if (!allowed) {
      throw Errors.forbidden('You cannot access another seller’s shipments.');
    }
  }

  private load(id: string) {
    return this.prisma.shipment.findUniqueOrThrow({
      where: { id },
      include: {
        label: true,
        trackingEvents: { orderBy: { sequence: 'asc' } },
        deliveryAttempts: { orderBy: { attemptNo: 'asc' } },
        costs: true,
        recon: true,
      },
    });
  }

  private async present(shipmentId: string) {
    const row = await this.load(shipmentId);
    const actual = row.costs.find((c) => c.kind === 'actual');
    return {
      id: row.id,
      status: row.status,
      tracking_number: row.trackingNumber,
      carrier: 'MOCK',
      sandbox: true,
      routing: row.routingJson,
      quoted_cost_minor: row.costs.find((c) => c.kind === 'quoted')?.amountMinor?.toString() ?? null,
      actual_cost_minor: actual ? (actual.amountMinor?.toString() ?? null) : null,
      label: row.label,
      timeline: row.trackingEvents,
      attempts: row.deliveryAttempts,
      recon: row.recon,
    };
  }
}

function walk(from: ShipmentStatus, to: ShipmentStatus): ShipmentStatus[] {
  const happy: ShipmentStatus[] = [
    ShipmentStatus.READY,
    ShipmentStatus.BOOKING,
    ShipmentStatus.BOOKED,
    ShipmentStatus.LABEL_CREATED,
    ShipmentStatus.PICKUP_SCHEDULED,
    ShipmentStatus.PICKED_UP,
    ShipmentStatus.IN_TRANSIT,
    ShipmentStatus.OUT_FOR_DELIVERY,
    ShipmentStatus.DELIVERED,
  ];
  const fi = happy.indexOf(from);
  const ti = happy.indexOf(to);
  if (fi >= 0 && ti > fi) {
    return happy.slice(fi + 1, ti + 1);
  }
  return [];
}
