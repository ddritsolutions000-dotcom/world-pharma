import { forwardRef, Inject, Injectable, OnModuleInit } from '@nestjs/common';
import {
  CarrierReconStatus,
  LogisticsJobType,
  Prisma,
  ProofOfDeliveryKind,
  ShipmentStatus,
} from '@prisma/client';
import { hmacSha256Hex, safeEqualHex, uuidv7 } from '@world-pharma/shared';
import { createHash } from 'node:crypto';
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
import { isLiveCarrierEnabled, isMockCarrierCode, readLogisticsEnvironment } from './carrier.config';
import { assertProductionLogisticsAvailable, evaluateProductionLogisticsAvailable } from './production-logistics-gate';
import {
  assertProductionCarrierShipmentInitiationAllowed,
  assertProductionCarrierWebhookIngestAllowed,
} from './carrier-logistics-production-activation-path';
import {
  DELIVERY_POD_PURPOSE,
  deliveryOtpHmacPayload,
  revealSandboxDeliveryOtp,
  SANDBOX_DELIVERY_OTP,
} from './sandbox-otp';
import { DeliveryService } from '../delivery/delivery.service';
import { OrderService } from '../orders/order.service';
import { workerTenantContext } from '../tenancy/build-tenant-context';
import { RateLimitService } from '../identity/rate-limit.service';

const WEBHOOK_TTL_MS = 5 * 60 * 1000;
const DELIVERY_OTP_TTL_MS = 15 * 60 * 1000;

function uuidFromStableKey(key: string): string {
  const hex = createHash('sha256').update(`carrier-unknown:${key}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

@Injectable()
export class LogisticsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly mock: MockCarrierAdapter,
    private readonly router: CarrierRouter,
    private readonly finance: FinanceService,
    private readonly rateLimit: RateLimitService,
    @Inject(forwardRef(() => DeliveryService))
    private readonly delivery: DeliveryService,
    @Inject(forwardRef(() => OrderService))
    private readonly orders: OrderService,
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
    if (readLogisticsEnvironment() === 'production') {
      assertProductionCarrierShipmentInitiationAllowed('logistics.quote');
      await assertProductionLogisticsAvailable(this.prisma, { countryCode: input.countryIso2 });
    }
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

  async requestBooking(
    shipmentId: string,
    scenario: MockBookingScenario = 'BOOK_SUCCESS',
    carrierCode?: string | null,
  ) {
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
    if (readLogisticsEnvironment() === 'production') {
      assertProductionCarrierShipmentInitiationAllowed('logistics.requestBooking');
      await assertProductionLogisticsAvailable(this.prisma, { countryId: shipment.countryId });
      throw Errors.problem(
        409,
        'MOCK_CARRIER_PRODUCTION_FORBIDDEN',
        'Mock carrier forbidden',
        'Production shipment creation cannot use MockCarrierAdapter. Live carrier adapters remain EXTERNAL_GATED.',
      );
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
      preferredCarrierCode: carrierCode ?? null,
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
    const shipment = await this.prisma.shipment.findUniqueOrThrow({
      where: { id: shipmentId },
      include: { carrier: true },
    });
    if (readLogisticsEnvironment() === 'production') {
      assertProductionCarrierShipmentInitiationAllowed('logistics.executeBooking');
      await assertProductionLogisticsAvailable(this.prisma, { countryId: shipment.countryId });
      throw Errors.problem(
        409,
        'MOCK_CARRIER_PRODUCTION_FORBIDDEN',
        'Mock carrier forbidden',
        'Production executeBooking cannot call MockCarrierAdapter.',
      );
    }
    const scenario = (shipment.mockScenario as MockBookingScenario) ?? 'BOOK_SUCCESS';
    const carrierCode = shipment.carrier?.code ?? 'MOCK';
    if (isMockCarrierCode(carrierCode) && readLogisticsEnvironment() === 'production') {
      throw Errors.problem(
        409,
        'MOCK_CARRIER_PRODUCTION_FORBIDDEN',
        'Mock carrier forbidden',
        'Production routing cannot select a MOCK/SANDBOX carrier.',
      );
    }
    const result = await this.mock.createShipment({
      shipmentId,
      idempotencyKey: shipment.bookingKey ?? `book:${shipmentId}`,
      scenario,
      carrierCode,
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
        carrierCode,
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
    const labeled = await this.transition(shipmentId, ShipmentStatus.LABEL_CREATED, 'label');
    await this.delivery.ensureJobForShipment(shipmentId);
    return labeled;
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
    const webhookHit = await this.rateLimit.hit(`webhook:carrier:${carrierId}`, 300, 60);
    if (!webhookHit.allowed) {
      throw Errors.rateLimited(webhookHit.retryAfter);
    }
    if (readLogisticsEnvironment() === 'production') {
      assertProductionCarrierWebhookIngestAllowed('logistics.ingestWebhook');
      throw Errors.problem(
        503,
        'PRODUCTION_CARRIER_WEBHOOK_EXTERNAL_GATED',
        'Production carrier webhooks gated',
        'Production webhook verification requires configured carrier credentials. Sandbox only.',
      );
    }
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
      const occurrenceKey = `unknown-provider:${parsed.providerEventId}`;
      const prior = await this.prisma.outboxEvent.findFirst({
        where: { type: 'CARRIER_WEBHOOK_UNKNOWN', occurrenceKey },
        select: { id: true },
      });
      if (!prior) {
        try {
          await this.outbox.enqueue(this.prisma, {
            type: 'CARRIER_WEBHOOK_UNKNOWN',
            aggregateType: 'CarrierWebhook',
            aggregateId: uuidFromStableKey(parsed.providerEventId),
            producer: 'logistics',
            payload: {
              provider_ref: parsed.shipmentRef,
              provider_event_id: parsed.providerEventId,
              provider_code: parsed.providerCode,
              reviewable: true,
              discrepancy: 'UNKNOWN_PROVIDER_SHIPMENT',
            },
            occurrenceKey,
          });
        } catch (err) {
          if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) {
            throw err;
          }
        }
      }
      return {
        accepted: true,
        duplicate: Boolean(prior),
        sandbox: true,
        discrepancy: 'UNKNOWN_PROVIDER_SHIPMENT',
        reviewable: true,
      };
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

  async ensureOtp(shipmentId: string) {
    const existing = await this.prisma.proofOfDelivery.findFirst({
      where: {
        shipmentId,
        kind: ProofOfDeliveryKind.OTP,
        purpose: DELIVERY_POD_PURPOSE,
        consumedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) {
      const expired = existing.expiresAt && existing.expiresAt <= new Date();
      if (!expired) {
        return {
          created: false,
          hashed: true,
          sandbox: true,
          purpose: DELIVERY_POD_PURPOSE,
          expires_at: existing.expiresAt?.toISOString() ?? null,
          sandbox_code: revealSandboxDeliveryOtp(),
        };
      }
    }
    return this.createOtp(shipmentId);
  }

  async createOtp(shipmentId: string) {
    const pepper = process.env['OTP_PEPPER'];
    if (!pepper || pepper.length < 32) {
      throw Errors.problem(
        503,
        'OTP_PEPPER_MISSING',
        'OTP configuration missing',
        'Delivery OTP requires OTP_PEPPER.',
      );
    }
    // Sandbox uses deterministic fixture code for e2e; production live SMS remains EXTERNAL_GATED.
    const code = SANDBOX_DELIVERY_OTP;
    const secretHash = hmacSha256Hex(pepper, deliveryOtpHmacPayload(shipmentId, code));
    const now = new Date();
    await this.prisma.proofOfDelivery.create({
      data: {
        id: uuidv7(),
        shipmentId,
        kind: ProofOfDeliveryKind.OTP,
        secretHash,
        purpose: DELIVERY_POD_PURPOSE,
        attemptCount: 0,
        maxAttempts: 5,
        expiresAt: new Date(now.getTime() + DELIVERY_OTP_TTL_MS),
      },
    });
    const shipment = await this.prisma.shipment.findUnique({
      where: { id: shipmentId },
      select: { id: true, countryId: true, orderId: true, customerPersonId: true },
    });
    if (shipment) {
      await this.outbox.enqueue(this.prisma, {
        type: 'DELIVERY_OTP_REQUESTED',
        aggregateType: 'Shipment',
        aggregateId: shipmentId,
        producer: 'logistics',
        countryId: shipment.countryId,
        payload: {
          shipment_id: shipmentId,
          order_id: shipment.orderId,
          customer_person_id: shipment.customerPersonId,
          purpose: DELIVERY_POD_PURPOSE,
          // Never include OTP code in outbox payload.
        },
        occurrenceKey: `delivery-otp:${shipmentId}:${now.toISOString().slice(0, 16)}`,
      });
    }
    return {
      created: true,
      hashed: true,
      sandbox: true,
      purpose: DELIVERY_POD_PURPOSE,
      expires_at: new Date(now.getTime() + DELIVERY_OTP_TTL_MS).toISOString(),
      sandbox_code: revealSandboxDeliveryOtp(),
    };
  }

  async advanceShipmentForRiderPickup(shipmentId: string) {
    const shipment = await this.prisma.shipment.findUniqueOrThrow({ where: { id: shipmentId } });
    if (shipment.status === ShipmentStatus.OUT_FOR_DELIVERY || shipment.status === ShipmentStatus.DELIVERED) {
      return this.present(shipmentId);
    }
    await this.advanceTo(shipmentId, ShipmentStatus.PICKED_UP, 'rider_pickup');
    await this.advanceTo(shipmentId, ShipmentStatus.IN_TRANSIT, 'rider_pickup');
    return this.advanceTo(shipmentId, ShipmentStatus.OUT_FOR_DELIVERY, 'rider_pickup');
  }

  async advanceShipmentForDeliveryFailure(shipmentId: string, reason: string) {
    const shipment = await this.prisma.shipment.findUniqueOrThrow({ where: { id: shipmentId } });
    if (
      shipment.status === ShipmentStatus.DELIVERY_FAILED ||
      shipment.status === ShipmentStatus.RETURN_TO_ORIGIN ||
      shipment.status === ShipmentStatus.RETURNED ||
      shipment.status === ShipmentStatus.DELIVERED
    ) {
      return this.present(shipmentId);
    }
    const toOfd = walk(shipment.status, ShipmentStatus.OUT_FOR_DELIVERY);
    for (const step of toOfd) {
      await this.transition(shipmentId, step, `fail_walk:${step}`);
    }
    const n = await this.prisma.deliveryAttempt.count({ where: { shipmentId } });
    await this.prisma.deliveryAttempt.create({
      data: { id: uuidv7(), shipmentId, attemptNo: n + 1, status: 'FAILED', reason },
    });
    return this.advanceTo(shipmentId, ShipmentStatus.DELIVERY_FAILED, reason);
  }

  async verifyOtp(shipmentId: string, code: string) {
    const shipment = await this.prisma.shipment.findUniqueOrThrow({ where: { id: shipmentId } });
    if (shipment.status === ShipmentStatus.DELIVERED) {
      return this.present(shipmentId);
    }
    const row = await this.prisma.proofOfDelivery.findFirst({
      where: { shipmentId, kind: ProofOfDeliveryKind.OTP, purpose: DELIVERY_POD_PURPOSE },
      orderBy: { createdAt: 'desc' },
    });
    if (!row) {
      throw Errors.notFound('No OTP challenge.');
    }
    if (row.consumedAt) {
      // Already consumed — if shipment not delivered yet something is inconsistent; still fail closed.
      throw Errors.problem(
        409,
        'OTP_ALREADY_CONSUMED',
        'OTP already used',
        'This delivery OTP was already consumed.',
      );
    }
    if (row.expiresAt && row.expiresAt <= new Date()) {
      throw Errors.problem(409, 'OTP_EXPIRED', 'OTP expired', 'Delivery OTP has expired.');
    }
    if (row.attemptCount >= row.maxAttempts) {
      throw Errors.problem(
        429,
        'OTP_LOCKED',
        'OTP locked',
        'Too many failed delivery OTP attempts.',
      );
    }
    const pepper = process.env['OTP_PEPPER'];
    if (!pepper || pepper.length < 32) {
      throw Errors.problem(
        503,
        'OTP_PEPPER_MISSING',
        'OTP configuration missing',
        'Delivery OTP requires OTP_PEPPER.',
      );
    }
    const expected = hmacSha256Hex(pepper, deliveryOtpHmacPayload(shipmentId, code.trim()));
    if (!safeEqualHex(row.secretHash, expected)) {
      // Backward-compat: accept legacy unsalted SHA-256 hashes from pre-S45 rows during transition.
      const legacy = await this.legacyDeliveryOtpMatch(row.secretHash, code.trim());
      if (!legacy) {
        const attempts = row.attemptCount + 1;
        await this.prisma.runWithTenant(
          workerTenantContext({ countryId: shipment.countryId }),
          async () => {
            await this.prisma.proofOfDelivery.update({
              where: { id: row.id },
              data: { attemptCount: attempts },
            });
          },
          { fresh: true },
        );
        if (attempts >= row.maxAttempts) {
          throw Errors.problem(
            429,
            'OTP_LOCKED',
            'OTP locked',
            'Too many failed delivery OTP attempts.',
          );
        }
        throw Errors.unauthorized('OTP mismatch.');
      }
    }
    await this.prisma.proofOfDelivery.update({
      where: { id: row.id },
      data: { consumedAt: new Date() },
    });
    return this.advanceTo(shipmentId, ShipmentStatus.DELIVERED, 'otp_ok');
  }

  private async legacyDeliveryOtpMatch(secretHash: string, code: string): Promise<boolean> {
    const { createHash } = await import('node:crypto');
    const legacy = createHash('sha256').update(code).digest('hex');
    return legacy === secretHash;
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
      pod: await this.podSummary(row.id, row.status),
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
      latest_event: row.trackingEvents.length
        ? {
            status: row.trackingEvents[row.trackingEvents.length - 1]!.normalized,
            at: row.trackingEvents[row.trackingEvents.length - 1]!.occurredAt,
          }
        : null,
      live_tracking: false,
      expected_delivery: null,
      message: 'Sandbox mock carrier. Live tracking is external-gated until a production carrier is connected.',
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
    return this.presentVendor(id);
  }

  async evaluateProductionLogisticsAvailable(countryCode: string) {
    return evaluateProductionLogisticsAvailable(this.prisma, { countryCode });
  }

  async assertProductionLogisticsAvailable(countryCode: string) {
    return assertProductionLogisticsAvailable(this.prisma, { countryCode });
  }

  async cancelShipment(shipmentId: string) {
    const shipment = await this.prisma.shipment.findUniqueOrThrow({ where: { id: shipmentId } });
    if (shipment.status === ShipmentStatus.CANCELLED) {
      return this.present(shipmentId);
    }
    const blocked: ShipmentStatus[] = [
      ShipmentStatus.DELIVERED,
      ShipmentStatus.RETURNED,
      ShipmentStatus.IN_TRANSIT,
      ShipmentStatus.OUT_FOR_DELIVERY,
      ShipmentStatus.PICKED_UP,
      ShipmentStatus.LOST,
      ShipmentStatus.DAMAGED,
    ];
    if (blocked.includes(shipment.status)) {
      throw Errors.problem(
        409,
        'ILLEGAL_SHIPMENT_TRANSITION',
        'Illegal transition',
        `Cannot cancel a shipment in ${shipment.status}.`,
      );
    }
    if (readLogisticsEnvironment() === 'production') {
      assertProductionCarrierShipmentInitiationAllowed('logistics.cancel');
      await assertProductionLogisticsAvailable(this.prisma, { countryId: shipment.countryId });
    }
    if (shipment.providerRef && readLogisticsEnvironment() !== 'production') {
      await this.mock.cancelShipment(shipment.providerRef);
    }
    if (canTransitionShipment(shipment.status, ShipmentStatus.CANCELLED)) {
      return this.transition(shipmentId, ShipmentStatus.CANCELLED, 'cancel');
    }
    if (canTransitionShipment(shipment.status, ShipmentStatus.CANCEL_REQUESTED)) {
      await this.transition(shipmentId, ShipmentStatus.CANCEL_REQUESTED, 'cancel_requested');
      return this.transition(shipmentId, ShipmentStatus.CANCELLED, 'cancel');
    }
    throw Errors.problem(
      409,
      'ILLEGAL_SHIPMENT_TRANSITION',
      'Illegal transition',
      `Cannot cancel a shipment in ${shipment.status}.`,
    );
  }

  async adminExceptions() {
    const recon = await this.prisma.carrierReconciliation.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { shipment: { select: { id: true, status: true, trackingNumber: true } } },
    });
    const unknown = await this.prisma.outboxEvent.findMany({
      where: { type: 'CARRIER_WEBHOOK_UNKNOWN' },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    const stuck = await this.prisma.shipment.findMany({
      where: {
        status: {
          in: [ShipmentStatus.BOOKING_UNKNOWN, ShipmentStatus.BOOKING, ShipmentStatus.DELIVERY_FAILED],
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: 50,
      select: { id: true, status: true, trackingNumber: true, updatedAt: true },
    });
    return {
      recon: recon.map((row) => ({
        id: row.id,
        shipment_id: row.shipmentId,
        status: row.status,
        break_type: row.breakType,
        detail: row.detail,
        shipment_status: row.shipment.status,
      })),
      unknown_webhooks: unknown.map((row) => ({
        id: row.id,
        occurrence_key: row.occurrenceKey,
        payload: row.payload,
        created_at: row.createdAt.toISOString(),
      })),
      stuck: stuck.map((row) => ({
        id: row.id,
        status: row.status,
        tracking_number: row.trackingNumber,
        updated_at: row.updatedAt.toISOString(),
      })),
    };
  }

  async adminSnapshot() {
    const grouped = await this.prisma.shipment.groupBy({
      by: ['status'],
      _count: { _all: true },
    });
    const counts: Record<string, number> = {};
    for (const row of grouped) {
      counts[row.status] = row._count._all;
    }
    return {
      environment: readLogisticsEnvironment(),
      live_logistics_enabled: isLiveCarrierEnabled(),
      counts,
      sandbox: true as const,
    };
  }

  async adminSearch() {
    const rows = await this.prisma.shipment.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
    return { data: await Promise.all(rows.map((row) => this.present(row.id))) };
  }

  async listCarriers() {
    const rows = await this.prisma.carrier.findMany({
      where: { active: true, environment: 'sandbox' },
      include: { accounts: { where: { active: true }, orderBy: { priority: 'asc' } } },
      orderBy: { name: 'asc' },
    });
    return {
      data: rows.map((row) => ({
        code: row.code,
        name: row.name,
        priority: row.accounts[0]?.priority ?? 100,
        sandbox: true,
      })),
    };
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
        const occurrenceKey = `${type}:${shipmentId}:${to}`;
        const existing = await tx.outboxEvent.findFirst({
          where: { aggregateId: shipmentId, type, occurrenceKey },
          select: { id: true },
        });
        if (!existing) {
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
            occurrenceKey,
          });
        }
      }
    });
    await this.delivery.syncJobWithShipmentStatus(shipmentId, to);
    await this.orders.syncFromShipmentStatus(shipment.orderId, to, reason);
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
        carrier: true,
        label: true,
        trackingEvents: { orderBy: { sequence: 'asc' } },
        deliveryAttempts: { orderBy: { attemptNo: 'asc' } },
        costs: true,
        recon: true,
      },
    });
  }

  private async presentVendor(shipmentId: string) {
    const row = await this.load(shipmentId);
    const routing = row.routingJson as { carrierCode?: string } | null;
    return {
      id: row.id,
      status: row.status,
      tracking_number: row.trackingNumber,
      carrier: row.carrier?.code ?? routing?.carrierCode ?? 'MOCK',
      sandbox: true,
      quoted_cost_minor: row.costs.find((c) => c.kind === 'quoted')?.amountMinor?.toString() ?? null,
      currency: row.currency,
      timeline: row.trackingEvents.map((ev) => ({
        status: ev.normalized,
        occurred_at: ev.occurredAt,
        description: ev.description,
      })),
      attempts: row.deliveryAttempts.map((a) => ({
        attempt_no: a.attemptNo,
        status: a.status,
        reason: a.reason,
        at: a.occurredAt,
      })),
      pod: await this.podSummary(row.id, row.status),
      message: 'Fulfillment view only. Rider identity and POD evidence objects are not exposed.',
    };
  }

  private async present(shipmentId: string) {
    const row = await this.load(shipmentId);
    const actual = row.costs.find((c) => c.kind === 'actual');
    const routing = row.routingJson as { carrierCode?: string } | null;
    return {
      id: row.id,
      status: row.status,
      tracking_number: row.trackingNumber,
      carrier: row.carrier?.code ?? routing?.carrierCode ?? 'MOCK',
      carrier_name: row.carrier?.name ?? row.carrier?.code ?? routing?.carrierCode ?? 'MOCK',
      sandbox: true,
      routing: row.routingJson,
      quoted_cost_minor: row.costs.find((c) => c.kind === 'quoted')?.amountMinor?.toString() ?? null,
      actual_cost_minor: actual ? (actual.amountMinor?.toString() ?? null) : null,
      currency: row.currency,
      label: row.label,
      timeline: row.trackingEvents,
      attempts: row.deliveryAttempts,
      recon: row.recon,
      pod: await this.podSummary(row.id, row.status),
    };
  }

  private async podSummary(shipmentId: string, status: ShipmentStatus) {
    const rows = await this.prisma.proofOfDelivery.findMany({
      where: { shipmentId },
      select: { kind: true, objectKey: true },
    });
    return {
      delivered: status === ShipmentStatus.DELIVERED,
      otp_recorded: rows.some((row) => row.kind === ProofOfDeliveryKind.OTP),
      photo_attached: rows.some((row) => row.kind === ProofOfDeliveryKind.PHOTO),
      signature_attached: rows.some((row) => row.kind === ProofOfDeliveryKind.SIGNATURE),
      sandbox: true as const,
      note: 'POD metadata only. Private evidence requires authorized worker ticket — no public URLs.',
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
