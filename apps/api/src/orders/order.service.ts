import { forwardRef, Inject, Injectable } from '@nestjs/common';
import {
  FulfillmentStatus,
  ConversionEventKind,
  KycCaseStatus,
  OrderStatus,
  OrganizationStatus,
  PackTaskStatus,
  PartnerStatus,
  PaymentIntentStatus,
  PaymentMethodFamily,
  PickTaskStatus,
  Prisma,
  ProofOfDeliveryKind,
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
import { orderIdOrNumberWhere } from './order-lookup';
import { tenantAls } from '../tenancy/tenant-als';
import {
  assertOrderTransition,
  BUYER_ORDER_NOTIFICATION_EVENTS,
  canTransitionOrder,
  eventForStatus,
  VENDOR_ORDER_NOTIFICATION_EVENTS,
} from './state-machine';
import { orderStatusForShipment, walkOrderToward } from './order-shipment-sync';
import {
  assessOrderRefundEligibility,
  parsePaymentRefundedEnvelope,
  resolveOrderRefundStatusFromIntent,
} from '../payment/refund-orchestration';
import type { EventEnvelope } from '../events/envelope';
import { assertVendorSellerAccess } from '../catalog/access';
import { evaluatePartnerFulfillmentEligibility } from '../partner/pharmacy-vendor-network-closure';
import { aggregateBuyAgain } from './buy-again';
import { isReorderEligible } from './reorder-eligibility';
import { assessReturnEligibility } from './return-eligibility';
import { pickNearestOnlineRider } from '../logistics/geo';


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
  affiliate?: { code?: string; preview_minor?: string; clinical_blocked?: boolean; payable?: boolean };
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
  // Do NOT include sellerOrg here: customer tenant RLS hides other orgs and Prisma
  // treats the required relation as an error when the join row is filtered out.
} satisfies Prisma.OrderInclude;

@Injectable()
export class OrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly policy: PolicyResolver,
    private readonly inventory: InventoryService,
    @Inject(forwardRef(() => LogisticsService))
    private readonly logistics: LogisticsService,
    private readonly finance: FinanceService,
    private readonly loyalty: LoyaltyService,
    private readonly personalization: PersonalizationService,
    private readonly conversionEvents: ConversionEventService,
    private readonly cooccurrence: CooccurrenceService,
  ) {}

  /**
   * Keep customer OrderStatus aligned with shipment/delivery outcomes.
   * Idempotent — skips when already at/beyond the mapped status.
   */
  async syncFromShipmentStatus(
    orderId: string,
    shipmentStatus: ShipmentStatus,
    reason = 'shipment_sync',
  ): Promise<void> {
    const target = orderStatusForShipment(shipmentStatus);
    if (!target) {
      return;
    }
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, select: { status: true } });
    if (!order) {
      return;
    }
    // Do not clobber refund/return terminal customer flows.
    if (
      order.status === OrderStatus.REFUND_PENDING ||
      order.status === OrderStatus.REFUNDED ||
      order.status === OrderStatus.PARTIALLY_REFUNDED ||
      order.status === OrderStatus.RETURN_REQUESTED ||
      order.status === OrderStatus.RETURNED ||
      order.status === OrderStatus.CANCELLED ||
      order.status === OrderStatus.CANCEL_REQUESTED
    ) {
      return;
    }
    const steps = walkOrderToward(order.status, target);
    for (const step of steps) {
      await this.transition(orderId, step, null, `${reason}:${shipmentStatus}`);
    }
  }

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
    const catalog = await this.catalogByVariantIds(rows.flatMap((row) => row.items.map((item) => item.variantId)));
    const pods = await this.podSummariesForShipments(rows.flatMap((row) => row.shipments));
    const sellers = await this.sellerNamesByOrgIds(rows.map((row) => row.sellerOrgId));
    return { data: rows.map((row) => this.present(row, catalog, pods, sellers)) };
  }

  async listBuyAgain(principal: Principal) {
    const rows = await this.prisma.order.findMany({
      where: { customerPersonId: principal.personId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { items: true },
    });
    const aggregated = aggregateBuyAgain(rows);
    if (!aggregated.length) {
      return { data: [] as Array<Record<string, unknown>> };
    }
    const offers = await this.prisma.catalogOffer.findMany({
      where: { id: { in: aggregated.map((row) => row.offer_id) } },
      include: {
        prices: { where: { isCurrent: true }, take: 1 },
        variant: {
          include: {
            item: {
              include: {
                translations: { take: 1, orderBy: { locale: 'asc' } },
                assets: { take: 1, orderBy: { sortOrder: 'asc' } },
              },
            },
          },
        },
      },
    });
    const byId = new Map(offers.map((offer) => [offer.id, offer]));
    return {
      data: aggregated.map((row) => {
        const offer = byId.get(row.offer_id);
        const price = offer?.prices[0];
        const item = offer?.variant.item;
        return {
          ...row,
          available: offer?.status === 'PUBLISHED',
          product_slug: item?.slug ?? null,
          product_title: item?.translations[0]?.title ?? row.title,
          currency: offer?.currency ?? null,
          sell_minor: price?.sellMinor?.toString() ?? null,
          list_minor: price?.listMinor?.toString() ?? null,
          image_url: item?.assets[0]?.publicUrl ?? null,
        };
      }),
    };
  }

  async getMine(principal: Principal, idOrNumber: string) {
    const order = await this.prisma.order.findFirst({
      where: orderIdOrNumberWhere(idOrNumber),
      include: INCLUDE,
    });
    if (!order || order.customerPersonId !== principal.personId) {
      throw Errors.forbidden('You cannot access another customer’s order.');
    }
    const catalog = await this.catalogByVariantIds(order.items.map((item) => item.variantId));
    const pods = await this.podSummariesForShipments(order.shipments);
    return this.presentWithSeller(order, catalog, pods);
  }

  async getMineLiveTracking(principal: Principal, idOrNumber: string) {
    const order = await this.prisma.order.findFirst({
      where: orderIdOrNumberWhere(idOrNumber),
      include: INCLUDE,
    });
    if (!order || order.customerPersonId !== principal.personId) {
      throw Errors.forbidden('You cannot access another customer’s order.');
    }
    return this.buildLiveTracking(order);
  }

  /** Public guest tracking — order number + postal code must match address snapshot. */
  async trackPublic(orderNumber: string, postalCode: string) {
    const normalizedOrder = orderNumber.trim().toUpperCase();
    const normalizedPostal = postalCode.trim();
    if (!normalizedOrder || !normalizedPostal) {
      throw Errors.validation('order_number and postal_code are required');
    }
    const order = await this.prisma.order.findFirst({
      where: { orderNumber: normalizedOrder },
      include: {
        address: true,
        shipments: { orderBy: { createdAt: 'asc' } },
        items: { take: 20 },
        history: { orderBy: { createdAt: 'asc' }, take: 10 },
      },
    });
    if (!order) {
      throw Errors.notFound('Order not found. Check the order number and try again.');
    }
    const snapshotPostal = (order.address?.postalCode ?? '').trim();
    if (!snapshotPostal || snapshotPostal.toLowerCase() !== normalizedPostal.toLowerCase()) {
      throw Errors.forbidden('Postal code does not match this order.');
    }
    return {
      order_number: order.orderNumber,
      status: order.status,
      created_at: order.createdAt.toISOString(),
      currency: order.currency,
      total_minor: order.totalMinor.toString(),
      items: order.items.map((line) => ({
        title: line.title,
        qty: line.qty,
        line_minor: line.lineMinor.toString(),
      })),
      shipments: order.shipments.map((row) => ({
        id: row.id,
        status: row.status,
        tracking_number: row.trackingNumber ?? null,
      })),
      history: order.history.map((row) => ({
        to_status: row.toStatus,
        created_at: row.createdAt.toISOString(),
      })),
      eta_hint:
        order.status === 'DELIVERED'
          ? 'Delivered'
          : order.status === 'SHIPPED' || order.status === 'OUT_FOR_DELIVERY'
            ? 'Out for delivery'
            : 'Processing your order',
      message: 'Guest tracking — sign in for full order details and support.',
    };
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
    const order = await this.load(id);
    if (
      order.status === OrderStatus.ALLOCATED &&
      !order.history.some((row) => row.reason === 'vendor_accept')
    ) {
      throw Errors.problem(
        409,
        'VENDOR_ACCEPT_REQUIRED',
        'Accept order first',
        'Accept the order before starting pick.',
      );
    }
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

  /** Vendor acknowledges an allocated order before pick/pack (audit trail; status stays ALLOCATED). */
  async acceptForVendor(principal: Principal, id: string) {
    await this.assertVendorCanFulfill(principal, id);
    const order = await this.load(id);
    if (order.status === OrderStatus.ON_HOLD) {
      await this.transition(id, OrderStatus.ALLOCATED, principal.personId, 'vendor_accept');
      return this.presentVendor(await this.load(id));
    }
    if (order.status !== OrderStatus.ALLOCATED && order.status !== OrderStatus.CONFIRMED) {
      throw Errors.problem(
        409,
        'ORDER_NOT_ACCEPTABLE',
        'Order cannot be accepted',
        `Accept is only allowed from ALLOCATED or ON_HOLD (current: ${order.status}).`,
      );
    }
    if (order.history.some((row) => row.reason === 'vendor_accept')) {
      return this.presentVendor(order);
    }
    await this.prisma.orderStatusHistory.create({
      data: {
        id: uuidv7(),
        orderId: id,
        fromStatus: order.status,
        toStatus: order.status,
        actorId: principal.personId,
        reason: 'vendor_accept',
      },
    });
    return this.presentVendor(await this.load(id));
  }

  /** Vendor rejects an order before fulfillment begins; restocks inventory consumed at order create. */
  rejectForVendor(principal: Principal, id: string, reason: string, idempotencyKey: string) {
    return this.withIdempotency(principal.personId, idempotencyKey, 'POST', `/vendor/orders/${id}/reject`, async () => {
      await this.assertVendorCanFulfill(principal, id);
      const order = await this.load(id);
      if (order.status === OrderStatus.CANCELLED) {
        return this.presentVendor(order);
      }
      const rejectable: OrderStatus[] = [OrderStatus.ALLOCATED, OrderStatus.ON_HOLD, OrderStatus.CONFIRMED];
      if (!rejectable.includes(order.status)) {
        throw Errors.problem(
          409,
          'ORDER_NOT_REJECTABLE',
          'Order cannot be rejected',
          `Reject is only allowed before fulfillment starts (current: ${order.status}).`,
        );
      }
      await this.transition(order.id, OrderStatus.CANCELLED, principal.personId, `vendor_reject:${reason}`);
      return this.presentVendor(await this.load(id));
    });
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

  async getReturnEligibility(principal: Principal, id: string) {
    const order = await this.load(id);
    if (order.customerPersonId !== principal.personId) {
      throw Errors.forbidden('You cannot inspect another customer’s order.');
    }
    return this.buildReturnEligibility(order);
  }

  private async buildReturnEligibility(
    order: Prisma.OrderGetPayload<{ include: typeof INCLUDE }>,
    reason?: ReturnReason,
    note?: string | null,
  ) {
    const packageTemps = await this.prisma.shipmentPackage.findMany({
      where: { shipmentId: { in: order.shipments.map((s) => s.id) } },
      select: { temperature: true },
    });
    const hasColdChain = packageTemps.some((p) => p.temperature !== 'AMBIENT');
    const openReturnExists = order.returnRequests.some(
      (r) => r.status === 'REQUESTED' || r.status === 'PICKUP_SCHEDULED',
    );
    return assessReturnEligibility({
      orderStatus: order.status,
      history: order.history,
      hasColdChain,
      rxInventoryConsumedAtDispense: order.rxInventoryConsumedAtDispense,
      openReturnExists,
      reason,
      note,
    });
  }

  async requestReturn(
    principal: Principal,
    id: string,
    reason: ReturnReason,
    note?: string,
    pickup?: { slot_start?: string; slot_end?: string },
  ) {
    const order = await this.load(id);
    if (order.customerPersonId !== principal.personId) {
      throw Errors.forbidden('You cannot return another customer’s order.');
    }
    const eligibility = await this.buildReturnEligibility(order, reason, note);
    if (!eligibility.eligible) {
      throw Errors.problem(
        409,
        'RETURN_NOT_ELIGIBLE',
        'Return not eligible',
        eligibility.reasons[0] ?? 'This order cannot be returned.',
      );
    }
    const deliveredShipment =
      order.shipments.find((s) => s.status === 'DELIVERED') ?? order.shipments[0] ?? null;
    let pickupStart: Date | null = null;
    let pickupEnd: Date | null = null;
    if (pickup?.slot_start) {
      pickupStart = new Date(pickup.slot_start);
      if (Number.isNaN(pickupStart.getTime())) {
        throw Errors.validation('pickup_slot_start must be an ISO datetime');
      }
    } else {
      // Default sandbox pickup window: tomorrow 10:00–12:00 local-ish UTC.
      pickupStart = new Date(Date.now() + 24 * 60 * 60 * 1000);
      pickupStart.setUTCHours(10, 0, 0, 0);
    }
    if (pickup?.slot_end) {
      pickupEnd = new Date(pickup.slot_end);
      if (Number.isNaN(pickupEnd.getTime())) {
        throw Errors.validation('pickup_slot_end must be an ISO datetime');
      }
    } else {
      pickupEnd = new Date(pickupStart.getTime() + 2 * 60 * 60 * 1000);
    }
    await this.prisma.returnRequest.create({
      data: {
        id: uuidv7(),
        orderId: order.id,
        reason,
        note: note ?? null,
        status: 'REQUESTED',
        pickupSlotStart: pickupStart,
        pickupSlotEnd: pickupEnd,
        shipmentId: deliveredShipment?.id ?? null,
      },
    });
    return this.transition(order.id, OrderStatus.RETURN_REQUESTED, principal.personId, reason);
  }

  async listReturnsForVendor(principal: Principal, sellerOrgId: string, status?: string) {
    await assertVendorSellerAccess(this.prisma, principal, sellerOrgId);
    const rows = await this.prisma.returnRequest.findMany({
      where: {
        order: { sellerOrgId },
        ...(status ? { status } : {}),
      },
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
            currency: true,
            totalMinor: true,
            createdAt: true,
            paymentIntentId: true,
            payment: { select: { status: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return {
      data: rows.map((row) => ({
        id: row.id,
        order_id: row.orderId,
        order_number: row.order.orderNumber,
        order_status: row.order.status,
        reason: row.reason,
        status: row.status,
        note: row.note,
        created_at: row.createdAt.toISOString(),
        currency: row.order.currency,
        total_minor: row.order.totalMinor.toString(),
        payment_status: row.order.payment?.status ?? null,
        refund_status:
          row.order.status === OrderStatus.REFUND_PENDING ||
          row.order.status === OrderStatus.REFUNDED ||
          row.order.status === OrderStatus.PARTIALLY_REFUNDED
            ? row.order.status
            : null,
        vendor_action_required:
          row.order.status === OrderStatus.RETURN_REQUESTED &&
          (row.status === 'REQUESTED' || row.status === 'PICKUP_SCHEDULED'),
        pickup_slot_start: row.pickupSlotStart?.toISOString() ?? null,
        pickup_slot_end: row.pickupSlotEnd?.toISOString() ?? null,
        shipment_id: row.shipmentId,
        tracking_number: row.shipmentId ? `RRET-${row.order.orderNumber}` : null,
      })),
    };
  }

  async approveReturnForVendor(principal: Principal, orderId: string, returnRequestId: string) {
    await this.assertVendorCanFulfill(principal, orderId);
    const order = await this.load(orderId);
    if (order.status !== OrderStatus.RETURN_REQUESTED) {
      throw Errors.problem(
        409,
        'RETURN_NOT_ACTIONABLE',
        'Return not actionable',
        `Approve is only allowed when order is RETURN_REQUESTED (current: ${order.status}).`,
      );
    }
    const returnRequest = order.returnRequests.find((row) => row.id === returnRequestId);
    if (!returnRequest) {
      throw Errors.notFound('Return request not found.');
    }
    if (returnRequest.status === 'PICKUP_SCHEDULED' || returnRequest.status === 'APPROVED') {
      return this.presentVendor(await this.load(orderId));
    }
    if (returnRequest.status !== 'REQUESTED') {
      throw Errors.problem(
        409,
        'RETURN_NOT_ACTIONABLE',
        'Return not actionable',
        `Return status ${returnRequest.status} cannot be approved.`,
      );
    }

    const shipment =
      (returnRequest.shipmentId
        ? order.shipments.find((s) => s.id === returnRequest.shipmentId)
        : null) ??
      order.shipments.find((s) => s.status === 'DELIVERED') ??
      order.shipments[0];
    if (!shipment) {
      throw Errors.problem(
        409,
        'RETURN_SHIPMENT_MISSING',
        'Shipment required',
        'Cannot schedule return pickup without an outbound shipment.',
      );
    }

    await this.prisma.returnShipment.upsert({
      where: { shipmentId: shipment.id },
      create: {
        id: uuidv7(),
        shipmentId: shipment.id,
        carrierCode: 'SANDBOX_RETURN',
        trackingNumber: `RRET-${order.orderNumber}`,
        reason: returnRequest.reason,
        currency: order.currency,
        disposition:
          returnRequest.reason === ReturnReason.DAMAGED ? 'DESTROY' : 'QUARANTINE',
      },
      update: {
        reason: returnRequest.reason,
        trackingNumber: `RRET-${order.orderNumber}`,
      },
    });

    const existingJobs = await this.prisma.logisticsJob.findMany({
      where: {
        shipmentId: shipment.id,
        jobType: 'MEDICINE_DELIVERY',
      },
      take: 20,
    });
    const existingJob = existingJobs.find((j) => {
      const payload = (j.payload ?? {}) as Record<string, unknown>;
      return payload.direction === 'RETURN_PICKUP' && payload.return_request_id === returnRequestId;
    });
    let jobId = existingJob?.id;
    if (!existingJob) {
      const created = await this.prisma.logisticsJob.create({
        data: {
          id: uuidv7(),
          shipmentId: shipment.id,
          jobType: 'MEDICINE_DELIVERY',
          status: 'CREATED',
          payload: {
            sandbox: true,
            direction: 'RETURN_PICKUP',
            return_request_id: returnRequestId,
            order_id: orderId,
            pickup_slot_start: returnRequest.pickupSlotStart?.toISOString() ?? null,
            pickup_slot_end: returnRequest.pickupSlotEnd?.toISOString() ?? null,
          },
        },
      });
      jobId = created.id;
    }

    // Auto-offer to nearest online rider (same picker as outbound medicine delivery).
    if (jobId) {
      const online = await this.prisma.riderPresence.findMany({
        where: { online: true },
        take: 50,
        orderBy: { updatedAt: 'desc' },
      });
      if (online.length) {
        const partners = await this.prisma.partner.findMany({
          where: {
            personId: { in: online.map((r) => r.personId) },
            partnerTypeCode: 'DELIVERY_PARTNER',
            status: 'ACTIVE',
          },
          select: { personId: true },
        });
        const eligible = new Set(partners.map((p) => p.personId));
        const location = await this.prisma.location.findUnique({
          where: { id: shipment.locationId },
          select: { latitude: true, longitude: true, postalCode: true, city: true },
        });
        const preferred = pickNearestOnlineRider(
          online
            .filter((r) => eligible.has(r.personId))
            .map((r) => ({
              personId: r.personId,
              organizationId: r.organizationId,
              updatedAt: r.updatedAt,
              latitude: r.latitude != null ? Number(r.latitude) : null,
              longitude: r.longitude != null ? Number(r.longitude) : null,
            })),
          location
            ? {
                latitude: location.latitude != null ? Number(location.latitude) : null,
                longitude: location.longitude != null ? Number(location.longitude) : null,
                postalCode: location.postalCode,
                city: location.city,
              }
            : null,
          { preferredOrganizationId: order.sellerOrgId },
        );
        if (preferred) {
          await this.prisma.logisticsJob.update({
            where: { id: jobId },
            data: { assigneeId: preferred.personId, status: 'ASSIGNED' },
          });
          await this.prisma.logisticsJobEvent.create({
            data: {
              id: uuidv7(),
              jobId,
              type: 'RETURN_PICKUP_ASSIGNED',
              payload: {
                assignee_id: preferred.personId,
                return_request_id: returnRequestId,
                mode: 'nearest_online_rider',
                rider_has_geo: preferred.latitude != null && preferred.longitude != null,
              },
            },
          });
        }
      }
    }

    await this.prisma.returnRequest.update({
      where: { id: returnRequestId },
      data: { status: 'PICKUP_SCHEDULED', shipmentId: shipment.id },
    });

    // Restock deferred until warehouse receives the return (receiveReturnForVendor).
    return this.presentVendor(await this.load(orderId));
  }

  /** Vendor confirms return package received at warehouse → order RETURNED + restock. */
  async receiveReturnForVendor(principal: Principal, orderId: string, returnRequestId: string) {
    await this.assertVendorCanFulfill(principal, orderId);
    const order = await this.load(orderId);
    if (order.status !== OrderStatus.RETURN_REQUESTED) {
      throw Errors.problem(
        409,
        'RETURN_NOT_ACTIONABLE',
        'Return not actionable',
        `Receive is only allowed when order is RETURN_REQUESTED (current: ${order.status}).`,
      );
    }
    const returnRequest = order.returnRequests.find((row) => row.id === returnRequestId);
    if (!returnRequest) {
      throw Errors.notFound('Return request not found.');
    }
    if (returnRequest.status === 'APPROVED') {
      return this.presentVendor(await this.load(orderId));
    }
    if (returnRequest.status !== 'PICKUP_SCHEDULED' && returnRequest.status !== 'REQUESTED') {
      throw Errors.problem(
        409,
        'RETURN_NOT_ACTIONABLE',
        'Return not actionable',
        `Return status ${returnRequest.status} cannot be received.`,
      );
    }

    await this.prisma.returnRequest.update({
      where: { id: returnRequestId },
      data: { status: 'APPROVED' },
    });
    await this.transition(
      orderId,
      OrderStatus.RETURNED,
      principal.personId,
      `vendor_return_received:${returnRequest.reason}`,
    );
    const refreshed = await this.load(orderId);
    if (returnRequest.reason !== ReturnReason.DAMAGED && !refreshed.rxInventoryConsumedAtDispense) {
      await this.restockReturnedOrder(refreshed, principal.personId);
    }
    if (returnRequest.shipmentId) {
      await this.prisma.returnShipment.updateMany({
        where: { shipmentId: returnRequest.shipmentId },
        data: {
          disposition:
            returnRequest.reason === ReturnReason.DAMAGED ? 'DESTROY' : 'RESTOCK',
        },
      });
    }
    return this.presentVendor(await this.load(orderId));
  }

  async rejectReturnForVendor(principal: Principal, orderId: string, returnRequestId: string, reason: string) {
    await this.assertVendorCanFulfill(principal, orderId);
    const order = await this.load(orderId);
    if (order.status !== OrderStatus.RETURN_REQUESTED) {
      throw Errors.problem(
        409,
        'RETURN_NOT_ACTIONABLE',
        'Return not actionable',
        `Reject is only allowed when order is RETURN_REQUESTED (current: ${order.status}).`,
      );
    }
    const returnRequest = order.returnRequests.find((row) => row.id === returnRequestId);
    if (!returnRequest) {
      throw Errors.notFound('Return request not found.');
    }
    if (returnRequest.status === 'REJECTED') {
      return this.presentVendor(await this.load(orderId));
    }
    await this.prisma.returnRequest.update({
      where: { id: returnRequestId },
      data: { status: 'REJECTED', note: reason.slice(0, 500) },
    });
    await this.transition(orderId, OrderStatus.DELIVERED, principal.personId, `vendor_return_reject:${reason.slice(0, 64)}`);
    return this.presentVendor(await this.load(orderId));
  }

  private async restockReturnedOrder(
    order: Prisma.OrderGetPayload<{ include: typeof INCLUDE }>,
    actorPersonId: string,
  ) {
    const store = tenantAls.getStore();
    const previous = store?.ctx;
    const sellerCtx = workerTenantContext({
      organizationId: order.sellerOrgId,
      countryId: order.countryId,
      personId: actorPersonId,
    });
    await this.prisma.$transaction(async (tx) => {
      if (store) {
        await applyTenantGucs(tx, sellerCtx);
        store.ctx = sellerCtx;
      }
      try {
        await this.inventory.restoreOrderAllocation(
          tx as unknown as Prisma.TransactionClient,
          order.id,
          order.items.map((item) => ({
            orderItemId: item.id,
            lotId: item.lotId,
            qty: item.qty,
          })),
          actorPersonId,
          'order_return_restock',
        );
      } finally {
        if (store && previous) {
          store.ctx = previous;
          try {
            await applyTenantGucs(tx, previous);
          } catch {
            // Parent request transaction is already aborted; interceptor will roll it back.
          }
        }
      }
    });
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
      return this.presentWithSeller(existing);
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
        return this.presentWithSeller(existingByDispense);
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
          return this.presentWithSeller(dup);
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
            payable: affiliate?.payable === true,
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
        const vendorMemberIds = await this.sellerOrgMemberPersonIds(session.sellerOrgId);
        for (const type of ['ORDER_CREATED', 'ORDER_CONFIRMED', 'ORDER_ALLOCATED'] as const) {
          const payload: Record<string, unknown> = {
            payment_intent_id: intent.id,
            sandbox: true,
            status: OrderStatus.ALLOCATED,
          };
          if (type === 'ORDER_CREATED' || type === 'ORDER_CONFIRMED') {
            payload.customer_person_id = intent.customerPersonId;
          }
          if (type === 'ORDER_ALLOCATED') {
            payload.person_ids = vendorMemberIds;
            payload.seller_org_id = session.sellerOrgId;
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
        return this.presentWithSeller(row);
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
    const quotePayload = quote.payload as { loyalty?: { points_applied: number; discount_minor: string } } | null;
    if (quotePayload?.loyalty?.points_applied) {
      await this.loyalty
        .redeemForCheckout({
          personId: principal.personId,
          countryId: intent.countryId,
          orderId,
          points: quotePayload.loyalty.points_applied,
          discountMinor: BigInt(quotePayload.loyalty.discount_minor),
        })
        .catch(() => undefined);
    }
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
    return this.presentWithSeller(await this.load(orderId));
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

  private async transition(orderId: string, to: OrderStatus, actorId: string | null, reason: string) {
    const order = await this.load(orderId);
    if (order.status === to) {
      return this.present(order);
    }
    try {
      assertOrderTransition(order.status, to);
    } catch {
      throw Errors.problem(409, 'ILLEGAL_ORDER_TRANSITION', 'Illegal transition', `Cannot move ${order.status} → ${to}.`);
    }
    const restockFrom: OrderStatus[] = [
      OrderStatus.CONFIRMED,
      OrderStatus.ON_HOLD,
      OrderStatus.ALLOCATED,
      OrderStatus.FAILED,
    ];
    const shouldRestock =
      to === OrderStatus.CANCELLED &&
      restockFrom.includes(order.status) &&
      !order.rxInventoryConsumedAtDispense;
    await this.prisma.$transaction(async (tx) => {
      if (shouldRestock) {
        const store = tenantAls.getStore();
        const previous = store?.ctx;
        const sellerCtx = workerTenantContext({
          organizationId: order.sellerOrgId,
          countryId: order.countryId,
          personId: actorId ?? order.customerPersonId,
        });
        if (store) {
          await applyTenantGucs(tx, sellerCtx);
          store.ctx = sellerCtx;
        }
        try {
          await this.inventory.restoreOrderAllocation(
            tx as unknown as Prisma.TransactionClient,
            orderId,
            order.items.map((item) => ({
              orderItemId: item.id,
              lotId: item.lotId,
              qty: item.qty,
            })),
            actorId ?? order.customerPersonId,
          );
        } finally {
          if (store && previous) {
            store.ctx = previous;
            try {
              await applyTenantGucs(tx, previous);
            } catch {
              // Parent request transaction is already aborted; interceptor will roll it back.
            }
          }
        }
      }
      await tx.order.update({ where: { id: orderId }, data: { status: to } });
      const historyId = uuidv7();
      await tx.orderStatusHistory.create({
        data: { id: historyId, orderId, fromStatus: order.status, toStatus: to, actorId, reason },
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
          // Include history id so sandbox re-fulfillment after status reset does not collide on occurrence_key
          occurrenceKey: `${type}:${orderId}:${reason}:${historyId}`,
        };
        if (BUYER_ORDER_NOTIFICATION_EVENTS.has(type)) {
          payload.customer_person_id = order.customerPersonId;
          payload.fulfillment_actor_id = actorId;
        } else {
          Object.assign(enqueueInput, { actorId });
        }
        if (VENDOR_ORDER_NOTIFICATION_EVENTS.has(type)) {
          const store = tenantAls.getStore();
          const previous = store?.ctx;
          const sellerCtx = workerTenantContext({
            organizationId: order.sellerOrgId,
            countryId: order.countryId,
            personId: actorId,
          });
          if (store) {
            await applyTenantGucs(tx, sellerCtx);
            store.ctx = sellerCtx;
          }
          try {
            payload.person_ids = await this.sellerOrgMemberPersonIds(order.sellerOrgId);
            payload.seller_org_id = order.sellerOrgId;
          } finally {
            if (store && previous) {
              store.ctx = previous;
              try {
                await applyTenantGucs(tx, previous);
              } catch {
                // Parent request transaction is already aborted; interceptor will roll it back.
              }
            }
          }
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
    const org = await this.prisma.organization.findUnique({
      where: { id: order.sellerOrgId },
      select: { status: true },
    });
    if (org?.status !== OrganizationStatus.ACTIVE) {
      throw Errors.problem(
        403,
        'VENDOR_NOT_ACTIVE',
        'Vendor not active',
        'Suspended or inactive vendors cannot perform fulfillment actions.',
      );
    }
    const partner = await this.prisma.partner.findFirst({
      where: { organizationId: order.sellerOrgId },
      select: { id: true, status: true },
    });
    if (partner) {
      const kyc = await this.prisma.kycCase.findFirst({
        where: { partnerId: partner.id },
        orderBy: { createdAt: 'desc' },
        select: { status: true, expiresAt: true },
      });
      const gate = evaluatePartnerFulfillmentEligibility({
        partnerStatus: partner.status as PartnerStatus,
        kycStatus: (kyc?.status as KycCaseStatus | undefined) ?? null,
        kycExpiresAt: kyc?.expiresAt ?? null,
      });
      if (!gate.allowed) {
        throw Errors.problem(
          403,
          gate.blocker ?? 'PARTNER_NOT_ACTIVE',
          'Vendor fulfillment blocked',
          gate.detail,
        );
      }
    }
  }

  private async sellerOrgMemberPersonIds(sellerOrgId: string): Promise<string[]> {
    const rows = await this.prisma.membership.findMany({
      where: { organizationId: sellerOrgId, status: 'ACTIVE', deletedAt: null },
      select: { personId: true },
    });
    return [...new Set(rows.map((row) => row.personId))];
  }

  /**
   * Vendor-facing order DTO — commercial/fulfillment minimum necessary.
   * Does not replace shared `present()` used by customer/admin/store.
   */
  private presentVendor(order: Prisma.OrderGetPayload<{ include: typeof INCLUDE }>) {
    const rxOrigin = Boolean(order.prescriptionId || order.dispensingCaseId || order.dispenseEventId);
    const rxFulfillmentStatus = rxOrigin
      ? order.dispenseEventId
        ? 'Ready for fulfillment'
        : order.dispensingCaseId
          ? 'Review required'
          : 'Prescription required'
      : order.items.some((item) => item.rxRequired)
        ? 'Prescription required'
        : null;
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
    const vendorAccepted = order.history.some((row) => row.reason === 'vendor_accept');
    return {
      id: order.id,
      order_number: order.orderNumber,
      status: order.status,
      sandbox: true,
      vendor_accepted: vendorAccepted,
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
      rx_fulfillment_status: rxFulfillmentStatus,
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
        status: row.status,
        note: row.note,
        created_at: row.createdAt,
        pickup_slot_start: row.pickupSlotStart?.toISOString() ?? null,
        pickup_slot_end: row.pickupSlotEnd?.toISOString() ?? null,
        shipment_id: row.shipmentId,
        tracking_number: row.shipmentId ? `RRET-${order.orderNumber}` : null,
      })),
      payment_status: order.payment?.status ?? null,
      after_sales_status:
        order.status === OrderStatus.REFUND_PENDING ||
        order.status === OrderStatus.REFUNDED ||
        order.status === OrderStatus.PARTIALLY_REFUNDED
          ? order.status
          : null,
      exceptions,
      message: 'Seller fulfillment view. Clinical prescription content is not included. Sandbox carrier only.',
    };
  }

  private load(id: string) {
    return this.prisma.order.findUniqueOrThrow({ where: { id }, include: INCLUDE });
  }

  private async byIdOrNumber(idOrNumber: string) {
    const row = await this.prisma.order.findFirst({
      where: orderIdOrNumberWhere(idOrNumber),
      include: INCLUDE,
    });
    if (!row) {
      throw Errors.notFound('Order not found.');
    }
    return row;
  }

  private async catalogByVariantIds(variantIds: string[]) {
    const unique = [...new Set(variantIds.filter(Boolean))];
    if (!unique.length) {
      return new Map<string, { itemId: string; slug: string }>();
    }
    const rows = await this.prisma.catalogVariant.findMany({
      where: { id: { in: unique } },
      select: { id: true, itemId: true, item: { select: { slug: true } } },
    });
    return new Map(rows.map((row) => [row.id, { itemId: row.itemId, slug: row.item.slug }]));
  }

  private async presentWithSeller(
    order: Prisma.OrderGetPayload<{ include: typeof INCLUDE }>,
    catalogByVariant = new Map<string, { itemId: string; slug: string }>(),
    podByShipment = new Map<
      string,
      {
        delivered: boolean;
        otp_recorded: boolean;
        photo_attached: boolean;
        signature_attached: boolean;
        sandbox: true;
        note: string;
      }
    >(),
  ) {
    const sellers = await this.sellerNamesByOrgIds([order.sellerOrgId]);
    const live = await this.buildLiveTracking(order);
    const base = this.present(order, catalogByVariant, podByShipment, sellers);
    return {
      ...base,
      tracking: {
        ...base.tracking,
        live,
      },
    };
  }

  /** Last-known rider GPS + job status for customer/map stubs (sandbox). */
  private async buildLiveTracking(
    order: Prisma.OrderGetPayload<{ include: typeof INCLUDE }>,
  ): Promise<{
    sandbox: true;
    shipments: Array<{
      shipment_id: string;
      job_id: string | null;
      job_status: string | null;
      assignee_id: string | null;
      last_lat: number | null;
      last_lng: number | null;
      last_event_type: string | null;
      last_event_at: string | null;
      pickup: { postal_code: string | null; city: string | null; lat: number | null; lng: number | null } | null;
      drop: { postal_code: string | null; city: string | null } | null;
    }>;
    message: string;
  }> {
    const shipmentIds = order.shipments.map((s) => s.id);
    if (!shipmentIds.length) {
      return {
        sandbox: true,
        shipments: [],
        message: 'No shipment yet — tracking starts after pack and carrier book.',
      };
    }
    const jobs = await this.prisma.logisticsJob.findMany({
      where: { shipmentId: { in: shipmentIds }, jobType: 'MEDICINE_DELIVERY' },
      include: {
        events: { orderBy: { createdAt: 'desc' }, take: 20 },
        shipment: true,
      },
    });
    const locationIds = [
      ...new Set(
        jobs
          .map((j) => j.shipment?.locationId)
          .filter((id): id is string => typeof id === 'string' && id.length > 0),
      ),
    ];
    const locations =
      locationIds.length > 0
        ? await this.prisma.location.findMany({ where: { id: { in: locationIds } } })
        : [];
    const locationById = new Map(locations.map((loc) => [loc.id, loc]));
    const byShipment = new Map(jobs.map((j) => [j.shipmentId!, j]));
    const assigneeIds = [...new Set(jobs.map((j) => j.assigneeId).filter(Boolean))] as string[];
    const presenceRows =
      assigneeIds.length > 0
        ? await this.prisma.riderPresence.findMany({
            where: { personId: { in: assigneeIds } },
          })
        : [];
    const presenceByPerson = new Map(
      presenceRows.map((r) => [
        r.personId,
        {
          lat: r.latitude != null ? Number(r.latitude) : null,
          lng: r.longitude != null ? Number(r.longitude) : null,
          at: r.updatedAt.toISOString(),
        },
      ]),
    );
    return {
      sandbox: true,
      shipments: order.shipments.map((row) => {
        const job = byShipment.get(row.id);
        let lastLat: number | null = null;
        let lastLng: number | null = null;
        let lastType: string | null = null;
        let lastAt: string | null = null;
        for (const ev of job?.events ?? []) {
          const payload = (ev.payload ?? {}) as Record<string, unknown>;
          const lat = Number(payload.lat ?? payload.latitude);
          const lng = Number(payload.lng ?? payload.longitude);
          if (Number.isFinite(lat) && Number.isFinite(lng)) {
            lastLat = lat;
            lastLng = lng;
            lastType = ev.type;
            lastAt = ev.createdAt.toISOString();
            break;
          }
        }
        if ((lastLat == null || lastLng == null) && job?.assigneeId) {
          const presence = presenceByPerson.get(job.assigneeId);
          if (
            presence &&
            presence.lat != null &&
            presence.lng != null &&
            Number.isFinite(presence.lat) &&
            Number.isFinite(presence.lng)
          ) {
            lastLat = presence.lat;
            lastLng = presence.lng;
            lastType = lastType ?? 'RIDER_PRESENCE';
            lastAt = presence.at;
          }
        }
        const locId = job?.shipment?.locationId;
        const loc = locId ? locationById.get(locId) : undefined;
        return {
          shipment_id: row.id,
          job_id: job?.id ?? null,
          job_status: job?.status ?? null,
          assignee_id: job?.assigneeId ?? null,
          last_lat: lastLat,
          last_lng: lastLng,
          last_event_type: lastType,
          last_event_at: lastAt,
          pickup: loc
            ? {
                postal_code: loc.postalCode ?? null,
                city: loc.city ?? null,
                lat: loc.latitude != null ? Number(loc.latitude) : null,
                lng: loc.longitude != null ? Number(loc.longitude) : null,
              }
            : null,
          drop: order.address
            ? { postal_code: order.address.postalCode ?? null, city: order.address.city }
            : null,
        };
      }),
      message:
        'Sandbox live track: last rider GPS from job events or on-duty presence. Map tiles / live carriers remain external-gated.',
    };
  }

  private present(
    order: Prisma.OrderGetPayload<{ include: typeof INCLUDE }>,
    catalogByVariant = new Map<string, { itemId: string; slug: string }>(),
    podByShipment = new Map<
      string,
      {
        delivered: boolean;
        otp_recorded: boolean;
        photo_attached: boolean;
        signature_attached: boolean;
        sandbox: true;
        note: string;
      }
    >(),
    sellerNames = new Map<string, string>(),
  ) {
    const historyAsc = [...order.history].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    );
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
      seller_name: sellerNames.get(order.sellerOrgId) ?? null,
      payment_intent_id: order.paymentIntentId,
      fulfilling_location_id: order.fulfillingLocationId,
      dispensing_case_id: order.dispensingCaseId,
      dispense_event_id: order.dispenseEventId,
      prescription_id: order.prescriptionId,
      rx_inventory_consumed_at_dispense: order.rxInventoryConsumedAtDispense,
      items: order.items.map((item) => ({
        id: item.id,
        sku: item.sku,
        title: item.title,
        qty: item.qty,
        unit_minor: item.unitMinor.toString(),
        line_minor: item.lineMinor.toString(),
        offer_id: item.offerId,
        variant_id: item.variantId,
        catalog_item_id: catalogByVariant.get(item.variantId)?.itemId ?? null,
        product_slug: catalogByVariant.get(item.variantId)?.slug ?? null,
        rx_required: item.rxRequired,
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
      timeline: historyAsc.map((row) => ({
        status: row.toStatus,
        from_status: row.fromStatus,
        reason: row.reason,
        at: row.createdAt.toISOString(),
      })),
      fulfillment: order.fulfillmentGroups,
      shipments: order.shipments.map((row) => ({
        id: row.id,
        status: row.status,
        tracking_number: row.trackingNumber ?? null,
        carrier: 'sandbox',
        sandbox: true,
        pod: podByShipment.get(row.id) ?? null,
      })),
      tracking: order.shipments.length
        ? {
            placeholder: false,
            shipments: order.shipments.map((row) => ({
              id: row.id,
              status: row.status,
              tracking_number: row.trackingNumber ?? null,
            })),
            message: 'Sandbox shipment tracking from logistics records. Live carrier tracking is external-gated.',
          }
        : { placeholder: true, carrier: null, message: 'No shipment yet.' },
      returns: order.returnRequests.map((row) => ({
        id: row.id,
        status: row.status,
        reason: row.reason,
        note: row.note,
        created_at: row.createdAt.toISOString(),
        pickup_slot_start: row.pickupSlotStart?.toISOString() ?? null,
        pickup_slot_end: row.pickupSlotEnd?.toISOString() ?? null,
        shipment_id: row.shipmentId,
        tracking_number: row.shipmentId ? `RRET-${order.orderNumber}` : null,
      })),
      reorder_eligible: isReorderEligible(order.status) && order.items.length > 0,
      payment_status: order.payment?.status ?? (order.paymentIntentId ? 'CONFIRMED' : 'PENDING'),
      delivery_status:
        order.shipments.length > 0
          ? order.shipments.every((s) => s.status === 'DELIVERED')
            ? 'DELIVERED'
            : order.shipments.some((s) => s.status === 'DELIVERY_FAILED' || s.status === 'RETURN_TO_ORIGIN')
              ? 'FAILED'
              : order.shipments.some((s) => s.status === 'OUT_FOR_DELIVERY')
                ? 'OUT_FOR_DELIVERY'
                : order.shipments.some((s) => s.status === 'DELIVERED')
                  ? 'PARTIAL'
                  : order.shipments[0]!.status
          : null,
      return_status: order.returnRequests.length
        ? order.returnRequests[order.returnRequests.length - 1]!.status
        : null,
      pod:
        order.shipments.length > 0
          ? {
              shipments: order.shipments.map((row) => ({
                shipment_id: row.id,
                ...(podByShipment.get(row.id) ?? {
                  delivered: row.status === 'DELIVERED',
                  otp_recorded: false,
                  photo_attached: false,
                  signature_attached: false,
                  sandbox: true as const,
                  note: 'POD metadata only. Private evidence requires authorized worker ticket — no public URLs.',
                }),
              })),
              sandbox: true as const,
            }
          : null,
      message: 'Order recorded. Sandbox carrier and settlement only.',
    };
  }

  private async sellerNamesByOrgIds(orgIds: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(orgIds.filter(Boolean))];
    const map = new Map<string, string>();
    if (!unique.length) {
      return map;
    }
    const rows = await this.prisma.runWithTenant(workerTenantContext(), () =>
      this.prisma.organization.findMany({
        where: { id: { in: unique } },
        select: { id: true, displayName: true, legalName: true },
      }),
    );
    for (const row of rows) {
      map.set(row.id, row.displayName || row.legalName);
    }
    return map;
  }

  private async podSummariesForShipments(
    shipments: Array<{ id: string; status: ShipmentStatus }>,
  ) {
    const map = new Map<
      string,
      {
        delivered: boolean;
        otp_recorded: boolean;
        photo_attached: boolean;
        signature_attached: boolean;
        sandbox: true;
        note: string;
      }
    >();
    if (!shipments.length) {
      return map;
    }
    const rows = await this.prisma.proofOfDelivery.findMany({
      where: { shipmentId: { in: shipments.map((s) => s.id) } },
      select: { shipmentId: true, kind: true },
    });
    for (const shipment of shipments) {
      const kinds = rows.filter((row) => row.shipmentId === shipment.id);
      map.set(shipment.id, {
        delivered: shipment.status === ShipmentStatus.DELIVERED,
        otp_recorded: kinds.some((row) => row.kind === ProofOfDeliveryKind.OTP),
        photo_attached: kinds.some((row) => row.kind === ProofOfDeliveryKind.PHOTO),
        signature_attached: kinds.some((row) => row.kind === ProofOfDeliveryKind.SIGNATURE),
        sandbox: true,
        note: 'POD metadata only. Private evidence requires authorized worker ticket — no public URLs.',
      });
    }
    return map;
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
