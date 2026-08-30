import { Injectable } from '@nestjs/common';
import {
  FulfillmentStatus,
  ConversionEventKind,
  OrderStatus,
  PackTaskStatus,
  PaymentIntentStatus,
  PaymentMethodFamily,
  PickTaskStatus,
  Prisma,
  ReturnReason,
  ShipmentStatus,
} from '@prisma/client';
import { uuidv7 } from '@world-pharma/shared';
import { PrismaService } from '../app/prisma.service';
import { Errors } from '../common/problem';
import { OutboxService } from '../events/outbox.service';
import type { Principal } from '../identity/current-principal';
import { InventoryService } from '../inventory/inventory.service';
import { LogisticsService } from '../logistics/logistics.service';
import { FinanceService } from '../finance/finance.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { PersonalizationService } from '../personalization/personalization.service';
import { ConversionEventService } from '../crm/conversion-event.service';
import { CooccurrenceService } from '../recommendations/cooccurrence.service';
import { PolicyResolver } from '../policy/resolver';
import { applyTenantGucs } from '../tenancy/apply-tenant-gucs';
import { workerTenantContext } from '../tenancy/build-tenant-context';
import { tenantAls } from '../tenancy/tenant-als';
import { CarrierPort } from './carrier.port';
import {
  assertOrderTransition,
  BUYER_ORDER_NOTIFICATION_EVENTS,
  canTransitionOrder,
  eventForStatus,
} from './state-machine';
import {
  assessOrderRefundEligibility,
  parsePaymentRefundedEnvelope,
  resolveOrderRefundStatusFromIntent,
} from '../payment/refund-orchestration';
import type { EventEnvelope } from '../events/envelope';
import { assertVendorSellerAccess } from '../catalog/access';

type QuoteLine = {
  offer_id: string;
  variant_id: string;
  qty: number;
  sku: string;
  sell_minor: string;
};

type QuotePayload = {
  fingerprint?: string;
  lines?: QuoteLine[];
  promo?: { campaign_id?: string; code?: string; discount_minor?: string; funding?: string };
  affiliate?: { code?: string; preview_minor?: string; clinical_blocked?: boolean };
};

const INCLUDE = {
  items: true,
  address: true,
  pricing: true,
  tax: true,
  promo: true,
  affiliate: true,
  shipping: true,
  payment: true,
  economics: true,
  history: { orderBy: { createdAt: 'desc' as const } },
  fulfillmentGroups: { include: { items: true, pickTasks: true, packTasks: true } },
  shipments: true,
  returnRequests: true,
} satisfies Prisma.OrderInclude;

@Injectable()
export class OrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly policy: PolicyResolver,
    private readonly inventory: InventoryService,
    private readonly carrier: CarrierPort,
    private readonly logistics: LogisticsService,
    private readonly finance: FinanceService,
    private readonly loyalty: LoyaltyService,
    private readonly personalization: PersonalizationService,
    private readonly conversionEvents: ConversionEventService,
    private readonly cooccurrence: CooccurrenceService,
  ) {}

  createFromPayment(principal: Principal, paymentIntentId: string, idempotencyKey: string) {
    return this.withIdempotency(principal.personId, idempotencyKey, 'POST', '/me/orders', () =>
      this.insertFromPayment(principal, paymentIntentId),
    );
  }

  async listMine(principal: Principal) {
    const rows = await this.prisma.order.findMany({
      where: { customerPersonId: principal.personId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: INCLUDE,
    });
    return { data: rows.map((row) => this.present(row)) };
  }

  async getMine(principal: Principal, idOrNumber: string) {
    const order = await this.prisma.order.findFirst({
      where: { OR: [{ id: idOrNumber }, { orderNumber: idOrNumber }] },
      include: INCLUDE,
    });
    if (!order || order.customerPersonId !== principal.personId) {
      throw Errors.forbidden('You cannot access another customer’s order.');
    }
    return this.present(order);
  }

  async listVendor(principal: Principal, sellerOrgId: string) {
    await assertVendorSellerAccess(this.prisma, principal, sellerOrgId);
    const rows = await this.prisma.order.findMany({
      where: { sellerOrgId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: INCLUDE,
    });
    return { data: rows.map((row) => this.presentVendor(row)) };
  }

  async getVendor(principal: Principal, id: string) {
    const order = await this.prisma.order.findUnique({ where: { id }, include: INCLUDE });
    if (!order) {
      throw Errors.forbidden('You cannot fulfill this order.');
    }
    await assertVendorSellerAccess(this.prisma, principal, order.sellerOrgId);
    return this.presentVendor(order);
  }

  /** Vendor Web fulfillment — VENDOR seller access + Rx-safe presenter. */
  async startPickForVendor(principal: Principal, id: string) {
    await this.assertVendorCanFulfill(principal, id);
    await this.startPick(principal, id);
    return this.presentVendor(await this.load(id));
  }

  async completePickForVendor(principal: Principal, id: string) {
    await this.assertVendorCanFulfill(principal, id);
    await this.completePick(principal, id);
    return this.presentVendor(await this.load(id));
  }

  async startPackForVendor(principal: Principal, id: string) {
    await this.assertVendorCanFulfill(principal, id);
    await this.startPack(principal, id);
    return this.presentVendor(await this.load(id));
  }

  async completePackForVendor(principal: Principal, id: string) {
    await this.assertVendorCanFulfill(principal, id);
    await this.completePack(principal, id);
    return this.presentVendor(await this.load(id));
  }

  async markReadyToShipForVendor(principal: Principal, id: string) {
    await this.assertVendorCanFulfill(principal, id);
    await this.markReadyToShip(principal, id);
    return this.presentVendor(await this.load(id));
  }

  async adminSearch() {
    const rows = await this.prisma.order.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: INCLUDE,
    });
    return { data: rows.map((row) => this.present(row)) };
  }

  async adminGet(id: string) {
    return this.present(await this.load(id));
  }

  cancel(principal: Principal, id: string, idempotencyKey: string, admin = false) {
    return this.withIdempotency(principal.personId, idempotencyKey, 'POST', `/orders/${id}/cancel`, async () => {
      const order = await this.load(id);
      if (!admin && order.customerPersonId !== principal.personId) {
        await this.assertSellerMember(principal, order.sellerOrgId);
      }
      const next =
        order.status === OrderStatus.CONFIRMED || order.status === OrderStatus.ALLOCATED
          ? OrderStatus.CANCELLED
          : OrderStatus.CANCEL_REQUESTED;
      return this.transition(order.id, next, principal.personId, 'cancel');
    });
  }

  async requestReturn(principal: Principal, id: string, reason: ReturnReason, note?: string) {
    const order = await this.load(id);
    if (order.customerPersonId !== principal.personId) {
      throw Errors.forbidden('You cannot return another customer’s order.');
    }
    await this.prisma.returnRequest.create({
      data: { id: uuidv7(), orderId: order.id, reason, note: note ?? null },
    });
    return this.transition(order.id, OrderStatus.RETURN_REQUESTED, principal.personId, reason);
  }

  async startPick(principal: Principal, id: string) {
    await this.assertCanFulfill(principal, id);
    await this.prisma.pickTask.updateMany({
      where: { group: { orderId: id }, status: PickTaskStatus.OPEN },
      data: { status: PickTaskStatus.IN_PROGRESS },
    });
    return this.transition(id, OrderStatus.PICKING, principal.personId, 'pick_start');
  }

  async completePick(principal: Principal, id: string, pickedQty?: number) {
    const order = await this.load(id);
    await this.assertCanFulfill(principal, id);
    const task = order.fulfillmentGroups[0]?.pickTasks[0];
    if (!task) {
      throw Errors.notFound('Pick task not found.');
    }
    const qty = pickedQty ?? task.requiredQty;
    if (qty > task.requiredQty) {
      throw Errors.problem(409, 'OVER_PICK', 'Over pick', 'Picked quantity cannot exceed required quantity.');
    }
    await this.prisma.pickTask.update({
      where: { id: task.id },
      data: { pickedQty: qty, status: PickTaskStatus.PICKED },
    });
    return this.transition(id, OrderStatus.PICKED, principal.personId, 'pick_complete');
  }

  async startPack(principal: Principal, id: string) {
    await this.assertCanFulfill(principal, id);
    await this.prisma.packTask.updateMany({
      where: { group: { orderId: id } },
      data: { status: PackTaskStatus.IN_PROGRESS },
    });
    return this.transition(id, OrderStatus.PACKING, principal.personId, 'pack_start');
  }

  async completePack(principal: Principal, id: string) {
    const order = await this.load(id);
    await this.assertCanFulfill(principal, id);
    if (order.status === OrderStatus.PICKED) {
      await this.transition(id, OrderStatus.PACKING, principal.personId, 'pack_start');
    }
    await this.prisma.packTask.updateMany({
      where: { group: { orderId: id } },
      data: { status: PackTaskStatus.PACKED },
    });
    await this.transition(id, OrderStatus.PACKED, principal.personId, 'pack_complete');
    return this.markReadyToShip(principal, id);
  }

  async markReadyToShip(principal: Principal, id: string) {
    const order = await this.load(id);
    await this.assertCanFulfill(principal, id);
    await this.carrier.createShipment(order.shipments[0]?.id ?? id);
    const presented = await this.transition(id, OrderStatus.READY_TO_SHIP, principal.personId, 'ready_to_ship');
    const store = tenantAls.getStore();
    const previous = store?.ctx;
    const bookingCtx = workerTenantContext({
      organizationId: order.sellerOrgId,
      countryId: order.countryId,
      personId: principal.personId,
    });
    if (store) {
      await applyTenantGucs(store.tx, bookingCtx);
      store.ctx = bookingCtx;
    }
    try {
      const shipment = await this.prisma.shipment.findFirst({ where: { orderId: id } });
      if (shipment) {
        await this.prisma.shipment.update({
          where: { id: shipment.id },
          data: { status: ShipmentStatus.READY },
        });
        await this.logistics.requestBooking(shipment.id, 'BOOK_SUCCESS');
      }
    } finally {
      if (store && previous) {
        store.ctx = previous;
        try {
          await applyTenantGucs(store.tx, previous);
        } catch {
          // Parent request transaction is already aborted.
        }
      }
    }
    return presented;
  }

  async requestRefund(principal: Principal, id: string, admin = false) {
    const order = await this.load(id);
    if (!admin && order.customerPersonId !== principal.personId) {
      throw Errors.forbidden('You cannot refund another customer’s order.');
    }
    if (order.paymentIntentId) {
      const intent = await this.prisma.paymentIntent.findUnique({
        where: { id: order.paymentIntentId },
        select: {
          status: true,
          method: true,
          capturedMinor: true,
          refundedMinor: true,
          countryId: true,
        },
      });
      const eligibility = assessOrderRefundEligibility(intent);
      if (!eligibility.eligible) {
        throw Errors.problem(409, eligibility.code, eligibility.title, eligibility.detail);
      }
      const presented = await this.transition(order.id, OrderStatus.REFUND_PENDING, principal.personId, 'refund_requested');
      if (intent) {
        await this.prisma.$transaction(async (tx) => {
          await this.outbox.enqueue(tx, {
            type: 'PAYMENT_REFUND_REQUESTED',
            aggregateType: 'PaymentIntent',
            aggregateId: order.paymentIntentId!,
            producer: 'order',
            countryId: intent.countryId,
            actorId: principal.personId,
            payload: {
              order_id: order.id,
              payment_intent_id: order.paymentIntentId,
              sandbox: true,
            },
            occurrenceKey: `payment-refund-requested:${order.id}:${order.paymentIntentId}`,
          });
        });
      }
      return presented;
    }
    return this.transition(order.id, OrderStatus.REFUND_PENDING, principal.personId, 'refund_requested');
  }

  /**
   * Consumes PAYMENT_REFUNDED and syncs linked commerce order to REFUNDED or PARTIALLY_REFUNDED.
   * No-op when no order exists (lab/imaging payments). Idempotent on replay.
   */
  async syncRefundStatusFromPaymentEvent(envelope: EventEnvelope): Promise<void> {
    let paymentIntentId: string;
    try {
      ({ paymentIntentId } = parsePaymentRefundedEnvelope(envelope));
    } catch {
      throw Errors.validation('PAYMENT_REFUNDED payload is invalid.');
    }
    const intent = await this.prisma.paymentIntent.findUnique({
      where: { id: paymentIntentId },
      select: { id: true, countryId: true, capturedMinor: true, refundedMinor: true },
    });
    if (!intent) {
      throw Errors.notFound('Payment intent not found.');
    }
    if (envelope.countryId && intent.countryId !== envelope.countryId) {
      throw Errors.forbidden('Payment country scope mismatch.');
    }
    const order = await this.prisma.order.findUnique({
      where: { paymentIntentId },
      select: { id: true, status: true, countryId: true, customerPersonId: true },
    });
    if (!order) {
      return;
    }
    if (envelope.countryId && order.countryId !== envelope.countryId) {
      throw Errors.forbidden('Order country scope mismatch.');
    }
    const targetStatus = resolveOrderRefundStatusFromIntent(intent);
    if (!targetStatus) {
      return;
    }
    if (order.status === targetStatus || order.status === OrderStatus.REFUNDED) {
      return;
    }
    if (order.status === OrderStatus.PARTIALLY_REFUNDED && targetStatus === OrderStatus.PARTIALLY_REFUNDED) {
      return;
    }
    if (!canTransitionOrder(order.status, targetStatus)) {
      return;
    }
    await this.transition(
      order.id,
      targetStatus,
      envelope.actorId ?? order.customerPersonId,
      `payment_refunded:${targetStatus}`,
    );
  }

  private async insertFromPayment(principal: Principal, paymentIntentId: string) {
    const existing = await this.prisma.order.findUnique({ where: { paymentIntentId }, include: INCLUDE });
    if (existing) {
      return this.present(existing);
    }
    const intent = await this.prisma.paymentIntent.findUnique({
      where: { id: paymentIntentId },
      include: { checkoutSession: { include: { address: true, country: true } }, checkoutQuote: true },
    });
    if (!intent) {
      throw Errors.notFound('Payment intent not found.');
    }
    if (intent.labBookingId) {
      throw Errors.problem(
        409,
        'LAB_BOOKING_NO_ORDER',
        'Lab booking payment',
        'Sandbox lab bookings confirm LabBooking only — they do not create commerce Orders.',
      );
    }
    if (!intent.checkoutSession || !intent.checkoutQuote) {
      throw Errors.problem(
        409,
        'CHECKOUT_REQUIRED',
        'Checkout required',
        'Commerce orders require a checkout session and frozen quote.',
      );
    }
    if (intent.customerPersonId !== principal.personId) {
      throw Errors.forbidden('You cannot create an order for another customer.');
    }
    this.assertEligiblePayment(intent.status, intent.method);
    const session = intent.checkoutSession;
    const quote = intent.checkoutQuote;
    if (intent.method === PaymentMethodFamily.COD) {
      const resolved = await this.policy.resolvePublished(session.country.isoAlpha2);
      if (!resolved?.document.payments.methods.includes('COD')) {
        throw Errors.problem(409, 'COD_NOT_ALLOWED', 'COD not allowed', 'Country policy does not permit COD.');
      }
    }
    if (quote.expiresAt < new Date()) {
      throw Errors.problem(409, 'QUOTE_STALE', 'Quote stale', 'Frozen checkout quote has expired.');
    }
    if (intent.amountMinor !== quote.totalMinor || intent.currency !== quote.currency) {
      throw Errors.problem(409, 'AMOUNT_MISMATCH', 'Amount mismatch', 'Payment does not match the frozen quote.');
    }
    const payload = (quote.payload ?? {}) as QuotePayload & {
      rx_handoff?: boolean;
      dispensing_case_id?: string | null;
      dispense_event_id?: string | null;
      lines?: Array<{
        offer_id: string;
        variant_id: string;
        sku: string;
        qty: number;
        sell_minor: string;
      }>;
    };
    const lines = payload.lines ?? [];
    if (!lines.length) {
      throw Errors.problem(409, 'QUOTE_EMPTY', 'Quote empty', 'Frozen quote has no lines.');
    }
    const skipInventory =
      session.skipInventoryHold === true || payload.rx_handoff === true;
    const dispenseEventId =
      session.dispenseEventId ?? payload.dispense_event_id ?? null;
    const dispensingCaseId =
      session.dispensingCaseId ?? payload.dispensing_case_id ?? null;

    if (skipInventory && dispenseEventId) {
      const existingByDispense = await this.prisma.order.findUnique({
        where: { dispenseEventId },
        include: INCLUDE,
      });
      if (existingByDispense) {
        return this.present(existingByDispense);
      }
    }

    let locationId: string;
    let consumed: Array<{ id: string; variantId: string; lotId: string; qty: number }> = [];
    let prescriptionId: string | null = null;
    let prescriptionVersionId: string | null = null;

    if (skipInventory) {
      // ED-R5D-01 Option B: do NOT call consumeCheckoutReservations / second PICK.
      if (!dispensingCaseId || !dispenseEventId) {
        throw Errors.problem(
          409,
          'RX_HANDOFF_INCOMPLETE',
          'Rx handoff incomplete',
          'skip_inventory_hold requires dispensing case and event linkage.',
        );
      }
      const mappings = await this.prisma.dispenseLineMapping.findMany({
        where: { caseId: dispensingCaseId },
      });
      const caseRow = await this.prisma.dispensingCase.findUnique({ where: { id: dispensingCaseId } });
      if (!caseRow?.locationId) {
        throw Errors.problem(409, 'RX_HANDOFF_INCOMPLETE', 'Rx handoff incomplete', 'Dispense location missing.');
      }
      locationId = caseRow.locationId;
      prescriptionId = caseRow.prescriptionId;
      prescriptionVersionId = caseRow.prescriptionVersionId;
      consumed = lines.map((line) => {
        const mapping = mappings.find((m) => m.catalogVariantId === line.variant_id);
        return {
          id: `rx-lot:${mapping?.inventoryLotId ?? line.variant_id}`,
          variantId: line.variant_id,
          lotId: mapping?.inventoryLotId ?? '',
          qty: line.qty,
        };
      });
      if (consumed.some((c) => !c.lotId)) {
        throw Errors.problem(409, 'RX_HANDOFF_INCOMPLETE', 'Rx handoff incomplete', 'Lot mapping missing for a line.');
      }
    } else {
      const holds = await this.prisma.inventoryReservation.findMany({
        where: { id: { in: session.reservationIds } },
      });
      if (!holds.length) {
        throw Errors.problem(409, 'RESERVATION_EXPIRED', 'Reservation expired', 'No checkout inventory hold remains.');
      }
      locationId = holds[0]!.locationId;
      if (holds.some((row) => row.locationId !== locationId)) {
        throw Errors.problem(409, 'SPLIT_LOCATION_FORBIDDEN', 'Split location', 'v1 does not split fulfillment locations.');
      }
    }
    const orderId = uuidv7();
    const country = session.country;
    const address = session.address;
    const store = tenantAls.getStore();
    const previous = store?.ctx;
    const sellerCtx = workerTenantContext({
      organizationId: session.sellerOrgId,
      countryId: intent.countryId,
      personId: principal.personId,
    });
    if (store) {
      await applyTenantGucs(store.tx, sellerCtx);
      store.ctx = sellerCtx;
    }
    try {
      const tx = this.prisma;
        await tx.$executeRaw`SELECT id FROM payment_intents WHERE id = ${paymentIntentId}::uuid FOR UPDATE`;
        const dup = await tx.order.findUnique({ where: { paymentIntentId }, include: INCLUDE });
        if (dup) {
          return this.present(dup);
        }
        const consumedHolds = skipInventory
          ? consumed
          : await this.inventory.consumeCheckoutReservations(
              tx as unknown as Prisma.TransactionClient,
              session.reservationIds,
              principal.personId,
              orderId,
            );
        const discount = quote.discountMinor;
        const promo = payload.promo;
        const affiliate = payload.affiliate;
        await tx.order.create({
          data: {
            id: orderId,
            orderNumber: `WP-${country.isoAlpha2}-${uuidv7().replace(/-/g, '').slice(-10).toUpperCase()}`,
            customerPersonId: intent.customerPersonId,
            sellerOrgId: session.sellerOrgId,
            countryId: intent.countryId,
            checkoutSessionId: session.id,
            checkoutQuoteId: quote.id,
            paymentIntentId: intent.id,
            fulfillingLocationId: locationId,
            dispensingCaseId: dispensingCaseId,
            dispenseEventId: dispenseEventId,
            prescriptionId,
            prescriptionVersionId,
            rxInventoryConsumedAtDispense: skipInventory,
            status: OrderStatus.ALLOCATED,
            currency: quote.currency,
            goodsMinor: quote.sellMinor,
            discountMinor: discount,
            taxMinor: quote.taxMinor,
            shippingMinor: quote.shippingMinor,
            totalMinor: quote.totalMinor,
            sandbox: true,
            items: {
              create: lines.map((line) => {
                const hold = consumedHolds.find((row) => row.variantId === line.variant_id);
                return {
                  id: uuidv7(),
                  offerId: line.offer_id,
                  variantId: line.variant_id,
                  sku: line.sku,
                  title: line.sku,
                  qty: line.qty,
                  unitMinor: BigInt(line.sell_minor) / BigInt(Math.max(line.qty, 1)),
                  lineMinor: BigInt(line.sell_minor),
                  currency: quote.currency,
                  reservationId: skipInventory ? null : hold?.id,
                  lotId: hold?.lotId || null,
                  rxRequired: skipInventory,
                };
              }),
            },
          },
        });
        if (skipInventory && dispenseEventId) {
          await tx.rxCommerceHandoff.updateMany({
            where: { dispenseEventId },
            data: { orderId },
          });
        }
        await tx.orderAddressSnapshot.create({
          data: {
            id: uuidv7(),
            orderId,
            countryCode: country.isoAlpha2,
            region: address?.region ?? null,
            city: address?.city ?? 'UNSPECIFIED',
            postalCode: address?.postalCode ?? null,
            line1: address?.line1 ?? 'UNSPECIFIED',
            line2: address?.line2 ?? null,
            recipientName: address?.recipientName ?? 'Customer',
            phone: address?.phone ?? null,
          },
        });
        await tx.orderPricingSnapshot.create({
          data: {
            id: uuidv7(),
            orderId,
            currency: quote.currency,
            goodsMinor: quote.sellMinor,
            discountMinor: discount,
            totalMinor: quote.totalMinor,
            fingerprint: quote.fingerprint,
            payload: quote.payload as Prisma.InputJsonValue,
          },
        });
        await tx.orderTaxSnapshot.create({
          data: {
            id: uuidv7(),
            orderId,
            status: quote.taxStatus,
            taxMinor: quote.taxMinor,
            currency: quote.currency,
            adapterRef: 'none',
          },
        });
        await tx.orderPromoSnapshot.create({
          data: {
            id: uuidv7(),
            orderId,
            campaignId: promo?.campaign_id ?? null,
            code: promo?.code ?? null,
            discountMinor: discount,
            funding: promo?.funding ?? 'NONE',
            platformMinor: promo?.funding === 'VENDOR' ? 0n : discount,
            vendorMinor: promo?.funding === 'VENDOR' ? discount : 0n,
          },
        });
        await tx.orderAffiliateSnapshot.create({
          data: {
            id: uuidv7(),
            orderId,
            affiliateCode: affiliate?.code ?? null,
            estimateMinor: BigInt(affiliate?.preview_minor ?? '0'),
            clinicalBlocked: affiliate?.clinical_blocked !== false,
            payable: false,
          },
        });
        await tx.orderShippingSnapshot.create({
          data: {
            id: uuidv7(),
            orderId,
            chargedMinor: quote.shippingMinor,
            subsidyMinor: 0n,
            taxMinor: 0n,
            actualCostMinor: null,
            currency: quote.currency,
          },
        });
        await tx.orderPaymentSnapshot.create({
          data: {
            id: uuidv7(),
            orderId,
            paymentIntentId: intent.id,
            method: intent.method,
            status: intent.status,
            amountMinor: intent.amountMinor,
            currency: intent.currency,
            sandbox: true,
          },
        });
        await tx.orderEconomicsSnapshot.create({
          data: {
            id: uuidv7(),
            orderId,
            customerPaidMinor: intent.method === PaymentMethodFamily.COD ? 0n : intent.amountMinor,
            vendorPayableEstMinor: quote.sellMinor - discount,
            platformTakeEstMinor: 0n,
            gatewayFeeEstMinor: 0n,
            promoSubsidyMinor: discount,
            affiliateEstMinor: BigInt(affiliate?.preview_minor ?? '0'),
            taxMinor: quote.taxMinor,
            shippingChargedMinor: quote.shippingMinor,
            shippingSubsidyMinor: 0n,
            actualCarrierCostMinor: null,
            currency: quote.currency,
          },
        });
        const createdItems = await tx.orderItem.findMany({ where: { orderId } });
        const groupId = uuidv7();
        await tx.fulfillmentGroup.create({
          data: {
            id: groupId,
            orderId,
            locationId,
            status: FulfillmentStatus.ALLOCATED,
            items: {
              create: createdItems.map((item) => ({
                id: uuidv7(),
                orderItemId: item.id,
                qty: item.qty,
                lotId: item.lotId,
              })),
            },
          },
        });
        const requiredQty = createdItems.reduce((sum, item) => sum + item.qty, 0);
        await tx.pickTask.create({
          data: {
            id: uuidv7(),
            groupId,
            requiredQty,
            lotSuggestion: consumedHolds[0]?.lotId ?? null,
          },
        });
        await tx.packTask.create({ data: { id: uuidv7(), groupId } });
        await tx.shipment.create({
          data: {
            id: uuidv7(),
            orderId,
            groupId,
            locationId,
            sellerOrgId: session.sellerOrgId,
            countryId: intent.countryId,
            customerPersonId: intent.customerPersonId,
            status: ShipmentStatus.DRAFT,
            customerChargeMinor: quote.shippingMinor,
            currency: quote.currency,
          },
        });
        await tx.orderStatusHistory.create({
          data: {
            id: uuidv7(),
            orderId,
            fromStatus: null,
            toStatus: OrderStatus.ALLOCATED,
            actorId: principal.personId,
            reason: 'payment_commit',
          },
        });
        for (const type of ['ORDER_CREATED', 'ORDER_CONFIRMED', 'ORDER_ALLOCATED'] as const) {
          const payload: Record<string, unknown> = {
            payment_intent_id: intent.id,
            sandbox: true,
            status: OrderStatus.ALLOCATED,
          };
          if (type === 'ORDER_CREATED' || type === 'ORDER_CONFIRMED') {
            payload.customer_person_id = intent.customerPersonId;
          }
          await this.outbox.enqueue(tx, {
            type,
            aggregateType: 'Order',
            aggregateId: orderId,
            producer: 'order',
            countryId: intent.countryId,
            actorId: principal.personId,
            payload,
            occurrenceKey: `${type}:${orderId}`,
          });
        }
        await this.finance.syncOrder(orderId);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const row = await this.prisma.order.findUniqueOrThrow({
          where: { paymentIntentId },
          include: INCLUDE,
        });
        return this.present(row);
      }
      throw err;
    } finally {
      if (store && previous) {
        store.ctx = previous;
        try {
          await applyTenantGucs(store.tx, previous);
        } catch {
          // Parent request transaction is already aborted; interceptor will roll it back.
        }
      }
    }
    await this.loyalty
      .accrueForPaidOrder({
        orderId,
        personId: principal.personId,
        countryId: intent.countryId,
        countryCode: session.country.isoAlpha2,
        totalMinor: quote.totalMinor,
      })
      .catch(() => undefined);
    await this.personalization
      .recordHook({
        countryCode: session.country.isoAlpha2,
        personId: principal.personId,
        orderId,
        eventKind: 'ORDER_PLACED',
        source: 'order_paid',
        sourceKey: orderId,
      })
      .catch(() => undefined);
    await this.conversionEvents
      .recordHook({
        countryCode: session.country.isoAlpha2,
        personId: principal.personId,
        orderId,
        eventKind: ConversionEventKind.ORDER_PAID,
        source: 'order_paid',
        sourceKey: orderId,
        metadata: {
          total_minor: quote.totalMinor.toString(),
          currency: quote.currency,
        },
      })
      .catch(() => undefined);
    await this.cooccurrence.recordOrderPairs(orderId, intent.countryId).catch(() => undefined);
    return this.present(await this.load(orderId));
  }

  private assertEligiblePayment(status: PaymentIntentStatus, method: PaymentMethodFamily) {
    if (status === PaymentIntentStatus.CAPTURED) {
      return;
    }
    if (status === PaymentIntentStatus.AUTHORIZED_COD && method === PaymentMethodFamily.COD) {
      return;
    }
    throw Errors.problem(
      409,
      'PAYMENT_NOT_COMMITTED',
      'Payment not committed',
      'Order is created only after CAPTURED or AUTHORIZED_COD (server-side).',
    );
  }

  private async transition(orderId: string, to: OrderStatus, actorId: string, reason: string) {
    const order = await this.load(orderId);
    if (order.status === to) {
      return this.present(order);
    }
    try {
      assertOrderTransition(order.status, to);
    } catch {
      throw Errors.problem(409, 'ILLEGAL_ORDER_TRANSITION', 'Illegal transition', `Cannot move ${order.status} → ${to}.`);
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({ where: { id: orderId }, data: { status: to } });
      await tx.orderStatusHistory.create({
        data: { id: uuidv7(), orderId, fromStatus: order.status, toStatus: to, actorId, reason },
      });
      const type = eventForStatus(to);
      if (type) {
        const payload: Record<string, unknown> = { from: order.status, to, reason, sandbox: true };
        const enqueueInput = {
          type,
          aggregateType: 'Order' as const,
          aggregateId: orderId,
          producer: 'order',
          countryId: order.countryId,
          payload,
          occurrenceKey: `${type}:${orderId}:${reason}`,
        };
        if (BUYER_ORDER_NOTIFICATION_EVENTS.has(type)) {
          payload.customer_person_id = order.customerPersonId;
          payload.fulfillment_actor_id = actorId;
        } else {
          Object.assign(enqueueInput, { actorId });
        }
        await this.outbox.enqueue(tx, enqueueInput);
      }
    });
    return this.present(await this.load(orderId));
  }

  private async assertSellerMember(principal: Principal, sellerOrgId: string) {
    const allowed = await this.prisma.membership.count({
      where: { personId: principal.personId, organizationId: sellerOrgId, status: 'ACTIVE', deletedAt: null },
    });
    if (!allowed) {
      throw Errors.forbidden('You cannot access another seller’s orders.');
    }
  }

  private async assertCanFulfill(principal: Principal, orderId: string) {
    const order = await this.load(idOrThrow(orderId));
    const member = await this.prisma.membership.count({
      where: { personId: principal.personId, organizationId: order.sellerOrgId, status: 'ACTIVE', deletedAt: null },
    });
    if (member) {
      return;
    }
    const admin = await this.prisma.membership.count({
      where: {
        personId: principal.personId,
        status: 'ACTIVE',
        deletedAt: null,
        role: { permissions: { some: { permission: { code: { in: ['order:fulfill', 'order:admin', 'order:manage'] } } } } },
      },
    });
    if (!admin) {
      throw Errors.forbidden('You cannot fulfill this order.');
    }
  }

  private async assertVendorCanFulfill(principal: Principal, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { sellerOrgId: true },
    });
    if (!order) {
      throw Errors.forbidden('You cannot fulfill this order.');
    }
    await assertVendorSellerAccess(this.prisma, principal, order.sellerOrgId);
  }

  /**
   * Vendor-facing order DTO — commercial/fulfillment minimum necessary.
   * Does not replace shared `present()` used by customer/admin/store.
   */
  private presentVendor(order: Prisma.OrderGetPayload<{ include: typeof INCLUDE }>) {
    const rxOrigin = Boolean(order.prescriptionId || order.dispensingCaseId || order.dispenseEventId);
    const exceptions: string[] = [];
    if (order.status === OrderStatus.CANCEL_REQUESTED) {
      exceptions.push('cancel_requested');
    }
    if (order.status === OrderStatus.ON_HOLD) {
      exceptions.push('on_hold');
    }
    if (order.status === OrderStatus.RETURN_REQUESTED) {
      exceptions.push('return_requested');
    }
    if (order.status === OrderStatus.FAILED) {
      exceptions.push('failed');
    }
    return {
      id: order.id,
      order_number: order.orderNumber,
      status: order.status,
      sandbox: true,
      currency: order.currency,
      goods_minor: order.goodsMinor.toString(),
      discount_minor: order.discountMinor.toString(),
      tax_minor: order.taxMinor.toString(),
      shipping_minor: order.shippingMinor.toString(),
      total_minor: order.totalMinor.toString(),
      seller_org_id: order.sellerOrgId,
      fulfilling_location_id: order.fulfillingLocationId,
      created_at: order.createdAt,
      updated_at: order.updatedAt,
      rx_origin: rxOrigin,
      prescription_id: order.prescriptionId,
      items: order.items.map((item) => ({
        id: item.id,
        sku: item.sku,
        qty: item.qty,
        unit_minor: item.unitMinor.toString(),
        line_minor: item.lineMinor.toString(),
      })),
      ship_to: order.address
        ? {
            country_code: order.address.countryCode,
            region: order.address.region,
            city: order.address.city,
            postal_code: order.address.postalCode,
            line1: order.address.line1,
            line2: order.address.line2,
            recipient_name: order.address.recipientName,
            phone: order.address.phone,
          }
        : null,
      economics: order.economics
        ? {
            customer_paid_minor: order.economics.customerPaidMinor.toString(),
            vendor_payable_est_minor: order.economics.vendorPayableEstMinor.toString(),
            tax_minor: order.economics.taxMinor.toString(),
            shipping_charged_minor: order.economics.shippingChargedMinor.toString(),
          }
        : null,
      history: order.history.map((row) => ({
        from_status: row.fromStatus,
        to_status: row.toStatus,
        reason: row.reason ?? '',
        created_at: row.createdAt,
      })),
      fulfillment: {
        groups: order.fulfillmentGroups.map((group) => ({
          id: group.id,
          status: group.status,
          pick_tasks: group.pickTasks.map((task) => ({
            id: task.id,
            status: task.status,
            required_qty: task.requiredQty,
            picked_qty: task.pickedQty,
          })),
          pack_tasks: group.packTasks.map((task) => ({
            id: task.id,
            status: task.status,
          })),
        })),
      },
      shipments: order.shipments.map((row) => ({
        id: row.id,
        status: row.status,
        tracking_number: row.trackingNumber ?? null,
        carrier: 'sandbox',
      })),
      returns: order.returnRequests.map((row) => ({
        id: row.id,
        reason: row.reason,
        created_at: row.createdAt,
      })),
      exceptions,
      message: 'Seller fulfillment view. Clinical prescription content is not included. Sandbox carrier only.',
    };
  }

  private load(id: string) {
    return this.prisma.order.findUniqueOrThrow({ where: { id }, include: INCLUDE });
  }

  private async byIdOrNumber(idOrNumber: string) {
    const row = await this.prisma.order.findFirst({
      where: { OR: [{ id: idOrNumber }, { orderNumber: idOrNumber }] },
      include: INCLUDE,
    });
    if (!row) {
      throw Errors.notFound('Order not found.');
    }
    return row;
  }

  private present(order: Prisma.OrderGetPayload<{ include: typeof INCLUDE }>) {
    return {
      id: order.id,
      order_number: order.orderNumber,
      status: order.status,
      sandbox: true,
      currency: order.currency,
      goods_minor: order.goodsMinor.toString(),
      discount_minor: order.discountMinor.toString(),
      tax_minor: order.taxMinor.toString(),
      shipping_minor: order.shippingMinor.toString(),
      total_minor: order.totalMinor.toString(),
      seller_org_id: order.sellerOrgId,
      payment_intent_id: order.paymentIntentId,
      fulfilling_location_id: order.fulfillingLocationId,
      dispensing_case_id: order.dispensingCaseId,
      dispense_event_id: order.dispenseEventId,
      prescription_id: order.prescriptionId,
      rx_inventory_consumed_at_dispense: order.rxInventoryConsumedAtDispense,
      items: order.items.map((item) => ({
        id: item.id,
        sku: item.sku,
        qty: item.qty,
        unit_minor: item.unitMinor.toString(),
        line_minor: item.lineMinor.toString(),
      })),
      address: order.address,
      pricing: order.pricing
        ? {
            goods_minor: order.pricing.goodsMinor.toString(),
            discount_minor: order.pricing.discountMinor.toString(),
            total_minor: order.pricing.totalMinor.toString(),
            fingerprint: order.pricing.fingerprint,
          }
        : null,
      tax: order.tax ? { status: order.tax.status, tax_minor: order.tax.taxMinor.toString() } : null,
      promo: order.promo,
      affiliate: order.affiliate
        ? {
            code: order.affiliate.affiliateCode,
            estimate_minor: order.affiliate.estimateMinor.toString(),
            clinical_blocked: order.affiliate.clinicalBlocked,
            payable: false,
          }
        : null,
      shipping: order.shipping
        ? {
            charged_minor: order.shipping.chargedMinor.toString(),
            subsidy_minor: order.shipping.subsidyMinor.toString(),
            actual_carrier_cost_minor: null,
          }
        : null,
      payment: order.payment,
      economics: order.economics
        ? {
            customer_paid_minor: order.economics.customerPaidMinor.toString(),
            vendor_payable_est_minor: order.economics.vendorPayableEstMinor.toString(),
            platform_take_est_minor: '0',
            gateway_fee_est_minor: order.economics.gatewayFeeEstMinor.toString(),
            promo_subsidy_minor: order.economics.promoSubsidyMinor.toString(),
            affiliate_est_minor: order.economics.affiliateEstMinor.toString(),
            tax_minor: order.economics.taxMinor.toString(),
            shipping_charged_minor: order.economics.shippingChargedMinor.toString(),
            shipping_subsidy_minor: order.economics.shippingSubsidyMinor.toString(),
            actual_carrier_cost_minor: null,
          }
        : null,
      history: order.history,
      fulfillment: order.fulfillmentGroups,
      shipments: order.shipments.map((row) => ({ id: row.id, status: row.status, carrier: 'none' })),
      tracking: { placeholder: true, carrier: null, message: 'Tracking is available after Phase 1F.' },
      returns: order.returnRequests,
      message: 'Order recorded. No carrier was contacted. Settlement is not run.',
    };
  }

  private async withIdempotency<T>(
    personId: string,
    key: string,
    method: string,
    path: string,
    run: () => Promise<T>,
  ): Promise<T> {
    if (!key) {
      throw Errors.validation('Idempotency-Key is required.');
    }
    const prior = await this.prisma.idempotencyRecord.findUnique({
      where: { personId_key: { personId, key } },
    });
    if (prior) {
      return prior.body as T;
    }
    const result = await run();
    await this.prisma.idempotencyRecord.create({
      data: {
        id: uuidv7(),
        personId,
        key,
        method,
        path,
        statusCode: 200,
        body: result as Prisma.InputJsonValue,
      },
    });
    return result;
  }
}

function idOrThrow(id: string): string {
  return id;
}
