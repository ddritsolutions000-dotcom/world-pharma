import { Injectable, Logger } from '@nestjs/common';
import { IdentifierType, LabCollectionMode, LocationKind } from '@prisma/client';
import { normalizeEmail, uuidv7 } from '@world-pharma/shared';
import { PrismaService } from '../app/prisma.service';
import type { Principal } from '../identity/current-principal';
import { CartService } from '../cart/cart.service';
import { PaymentService } from '../payment/payment.service';
import { OrderService } from '../orders/order.service';
import { LabBookingService } from '../lab/lab-booking.service';
import { AppointmentService } from '../clinical/appointment.service';
import { ScheduleService } from '../clinical/schedule.service';
import { LogisticsService } from '../logistics/logistics.service';
import { DeliveryService } from '../delivery/delivery.service';
import { ImagingBookingService } from '../radiology/imaging-booking.service';
import { shouldSkipDemoFixtureSeed } from '../ops/demo-fixture-guard';

const CUSTOMER_EMAIL = 'sandbox-customer@dev.local';
const VENDOR_EMAIL = 'sandbox-vendor@dev.local';
const DOCTOR_EMAIL = 'sandbox-doctor@dev.local';
const DELIVERY_EMAIL = 'sandbox-delivery@dev.local';
const ADMIN_EMAIL = 'sandbox-admin@dev.local';
const DEMO_ORDER_NUMBER = 'DEMO-SBX-001';
const DEMO_LAB_BOOKING_KEY = 'dev-sandbox-lab-booking';
const DEMO_IMAGING_BOOKING_KEY = 'dev-sandbox-imaging-booking';
const DEMO_APPOINTMENT_KEY = 'dev-sandbox-appointment';

function customerPrincipal(personId: string): Principal {
  return { personId, sessionId: 'dev-tx-seed', audience: 'customer', roles: [], tokenVersion: 0 };
}

@Injectable()
export class DevTransactionalSeedService {
  private readonly logger = new Logger(DevTransactionalSeedService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly carts: CartService,
    private readonly payments: PaymentService,
    private readonly orders: OrderService,
    private readonly labBookings: LabBookingService,
    private readonly appointments: AppointmentService,
    private readonly schedule: ScheduleService,
    private readonly logistics: LogisticsService,
    private readonly delivery: DeliveryService,
    private readonly imagingBookings: ImagingBookingService,
  ) {}

  async seedIfNeeded(): Promise<void> {
    const gate = shouldSkipDemoFixtureSeed();
    if (gate.skip) {
      if (gate.reason && process.env.NODE_ENV === 'development') {
        this.logger.warn(`Transactional sandbox seed skipped: ${gate.reason}`);
      }
      return;
    }

    const customerPersonId = await this.personIdForEmail(CUSTOMER_EMAIL);
    if (!customerPersonId) {
      this.logger.warn('Transactional seed skipped — sandbox customer not found yet');
      return;
    }

    const customer = customerPrincipal(customerPersonId);
    // Idempotent hygiene — runs even when DEMO-SBX-001 already exists.
    await this.dedupeSandboxAddresses(customerPersonId).catch((err) =>
      this.logger.warn(`Address dedupe skipped: ${(err as Error).message}`),
    );
    await this.ensureReorderEligibleFixture(customer).catch((err) =>
      this.logger.warn(`Reorder fixture skipped: ${(err as Error).message}`),
    );

    const existingOrder = await this.prisma.order.findFirst({
      where: { orderNumber: DEMO_ORDER_NUMBER },
    });
    if (existingOrder) {
      return;
    }

    const country = await this.prisma.country.findUnique({ where: { isoAlpha2: 'XX' } });
    if (!country) {
      return;
    }

    this.logger.log('Seeding transactional demo journeys (order, lab, imaging, appointment, delivery)...');

    const vendorPersonId = await this.personIdForEmail(VENDOR_EMAIL);
    const deliveryPersonId = await this.personIdForEmail(DELIVERY_EMAIL);
    const doctorPersonId = await this.personIdForEmail(DOCTOR_EMAIL);
    const adminPersonId = await this.personIdForEmail(ADMIN_EMAIL);

    try {
      await this.seedDemoOrder(customer, country.id, vendorPersonId, deliveryPersonId, adminPersonId);
      await this.seedDemoLabBooking(customer, country.id);
      await this.seedDemoImagingBooking(customer, country.id);
      await this.seedDemoAppointment(customerPersonId, country.id, doctorPersonId);
      this.logger.log('Transactional demo journeys complete');
    } catch (err) {
      this.logger.error(`Transactional seed failed: ${(err as Error).message}`);
    }
  }

  private async personIdForEmail(email: string): Promise<string | null> {
    const row = await this.prisma.accountIdentifier.findFirst({
      where: { valueNormalized: normalizeEmail(email), type: IdentifierType.EMAIL },
    });
    return row?.personId ?? null;
  }

  private async seedDemoOrder(
    customer: Principal,
    countryId: string,
    vendorPersonId: string | null,
    deliveryPersonId: string | null,
    adminPersonId: string | null,
  ): Promise<void> {
    const offer = await this.prisma.catalogOffer.findFirst({
      where: {
        countryId,
        status: 'PUBLISHED',
        variant: { item: { slug: 'demo-paracetamol-500' } },
      },
    });
    if (!offer) {
      this.logger.warn('Demo order skipped — paracetamol offer missing');
      return;
    }

    await this.carts.addItem(customer, 'XX', { offerId: offer.id, qty: 1 }, 'dev-sbx-cart');
    const addressId = await this.findOrCreateDemoAddress(customer, {
      countryCode: 'XX',
      recipientName: 'Demo Customer',
      phone: '+10000000001',
      city: 'Demo City',
      postalCode: '10001',
      line1: '1 Sandbox Street',
      isDefault: true,
    });

    const session = await this.carts.startCheckout(customer, 'XX', 'dev-sbx-checkout', 'WPDEMO');
    const sessionId = (session as { id: string }).id;
    await this.carts.attachAddress(customer, sessionId, addressId);
    await this.carts.quoteSession(customer, sessionId, 'dev-sbx-quote', false);

    const payment = await this.payments.payCheckout(
      customer,
      sessionId,
      { method: 'CARD', scenario: 'success' },
      'dev-sbx-pay',
    );
    const paymentIntentId = (payment as { id: string }).id;

    const order = await this.orders.createFromPayment(customer, paymentIntentId, 'dev-sbx-order');
    const orderId = (order as { id: string }).id;

    await this.prisma.order.update({
      where: { id: orderId },
      data: { orderNumber: DEMO_ORDER_NUMBER },
    });

    if (vendorPersonId) {
      const vendor = customerPrincipal(vendorPersonId);
      await this.orders.startPickForVendor(vendor, orderId);
      await this.orders.completePickForVendor(vendor, orderId);
      await this.orders.startPackForVendor(vendor, orderId);
      await this.orders.completePackForVendor(vendor, orderId);
      await this.orders.markReadyToShipForVendor(vendor, orderId);
    }

    const shipment = await this.prisma.shipment.findFirst({ where: { orderId } });
    if (shipment) {
      await this.logistics.requestBooking(shipment.id, 'BOOK_SUCCESS');
      if (deliveryPersonId && adminPersonId) {
        await this.delivery.assignJob(shipment.id, deliveryPersonId, adminPersonId);
      }
    }

    this.logger.log(`Seeded demo order ${DEMO_ORDER_NUMBER}`);
  }

  private async seedDemoLabBooking(customer: Principal, countryId: string): Promise<void> {
    const existing = await this.prisma.labBooking.findUnique({
      where: { idempotencyKey: DEMO_LAB_BOOKING_KEY },
    });
    if (existing) {
      return;
    }

    const labOrg = await this.prisma.organization.findFirst({
      where: { countryId, legalName: 'Demo Diagnostics Lab' },
    });
    const offer = await this.prisma.catalogOffer.findFirst({
      where: {
        countryId,
        status: 'PUBLISHED',
        variant: { item: { slug: 'demo-lipid-panel' } },
      },
    });
    if (!labOrg || !offer) {
      this.logger.warn('Demo lab booking skipped — lab org or offer missing');
      return;
    }

    const addressId = await this.findOrCreateDemoAddress(customer, {
      countryCode: 'XX',
      recipientName: 'Demo Customer',
      phone: '+10000000001',
      city: 'Demo City',
      postalCode: '10001',
      line1: '1 Sandbox Street',
      line2: 'Home collection',
    });

    const booking = await this.labBookings.createBooking(customer, {
      offerId: offer.id,
      qty: 1,
      collectionMode: LabCollectionMode.HOME,
      labOrgId: labOrg.id,
      customerAddressId: addressId,
      countryCode: 'XX',
      idempotencyKey: DEMO_LAB_BOOKING_KEY,
    });
    const bookingId = (booking as { id: string }).id;

    await this.payments.payLabBooking(
      customer,
      bookingId,
      { method: 'CARD', scenario: 'success' },
      'dev-sbx-lab-pay',
    );

    this.logger.log('Seeded demo lab booking with home collection');
  }

  private async seedDemoImagingBooking(customer: Principal, countryId: string): Promise<void> {
    const existing = await this.prisma.imagingBooking.findUnique({
      where: { idempotencyKey: DEMO_IMAGING_BOOKING_KEY },
    });
    if (existing) {
      return;
    }

    const imagingOrg = await this.prisma.organization.findFirst({
      where: { countryId, legalName: 'Demo Imaging Center' },
    });
    const location = await this.prisma.location.findFirst({
      where: { organizationId: imagingOrg?.id, kind: LocationKind.IMAGING },
    });
    const offer = await this.prisma.catalogOffer.findFirst({
      where: {
        countryId,
        status: 'PUBLISHED',
        variant: { item: { slug: 'demo-chest-xray' } },
      },
    });
    if (!imagingOrg || !location || !offer) {
      this.logger.warn('Demo imaging booking skipped — imaging org, location, or offer missing');
      return;
    }

    const slotStart = new Date(Date.now() + 86_400_000);
    slotStart.setMinutes(0, 0, 0);
    const slotEnd = new Date(slotStart.getTime() + 30 * 60_000);

    const booking = await this.imagingBookings.createBooking(customer, {
      offerId: offer.id,
      qty: 1,
      imagingOrgId: imagingOrg.id,
      imagingLocationId: location.id,
      slotStartsAt: slotStart.toISOString(),
      slotEndsAt: slotEnd.toISOString(),
      timezone: 'UTC',
      countryCode: 'XX',
      idempotencyKey: DEMO_IMAGING_BOOKING_KEY,
      prepAcknowledged: true,
    });
    const bookingId = (booking as { id: string }).id;

    await this.payments.payImagingBooking(
      customer,
      bookingId,
      { method: 'CARD', scenario: 'success' },
      'dev-sbx-imaging-pay',
    );

    this.logger.log('Seeded demo imaging booking');
  }

  private async seedDemoAppointment(
    customerPersonId: string,
    countryId: string,
    doctorPersonId: string | null,
  ): Promise<void> {
    const existing = await this.prisma.appointment.findFirst({
      where: { customerPersonId, reasonCategory: DEMO_APPOINTMENT_KEY },
    });
    if (existing) {
      return;
    }

    const profile = await this.prisma.doctorProfile.findFirst({
      where: {
        countryId,
        partner: { personId: doctorPersonId ?? undefined, status: 'ACTIVE' },
      },
    });
    if (!profile || !doctorPersonId) {
      this.logger.warn('Demo appointment skipped — doctor profile missing');
      return;
    }

    const hasWindow = await this.prisma.doctorAvailabilityWindow.findFirst({
      where: { doctorProfileId: profile.id, isActive: true },
    });
    if (!hasWindow) {
      for (let weekday = 0; weekday <= 6; weekday += 1) {
        await this.prisma.doctorAvailabilityWindow.create({
          data: {
            id: uuidv7(),
            doctorProfileId: profile.id,
            countryId,
            timezone: 'UTC',
            weekday,
            startLocal: '09:00',
            endLocal: '17:00',
            slotMinutes: 30,
          },
        });
      }
    }

    const from = new Date();
    const to = new Date(Date.now() + 7 * 86_400_000);
    const slots = await this.schedule.slotsForProfile(profile.id, from, to);
    const slot = slots.find((row) => new Date(row.starts_at) > new Date());
    if (!slot) {
      this.logger.warn('Demo appointment skipped — no available slots');
      return;
    }

    await this.appointments.book({
      customerPersonId,
      audience: 'customer',
      doctorProfileId: profile.id,
      countryCode: 'XX',
      startsAt: slot.starts_at,
      type: 'ONLINE',
      reasonCategory: DEMO_APPOINTMENT_KEY,
    });

    const appt = await this.prisma.appointment.findFirst({
      where: { customerPersonId, reasonCategory: DEMO_APPOINTMENT_KEY },
      orderBy: { createdAt: 'desc' },
    });
    if (appt && doctorPersonId) {
      await this.appointments.confirm(appt.id, { personId: doctorPersonId, audience: 'doctor' });
      const partner = await this.prisma.partner.findFirst({
        where: { personId: doctorPersonId, partnerTypeCode: 'DOCTOR', countryId },
      });
      if (partner) {
        const existingGrant = await this.prisma.consentGrant.findFirst({
          where: {
            subjectPersonId: customerPersonId,
            recipientPartnerId: partner.id,
            purpose: 'consultation',
            status: 'ACTIVE',
          },
        });
        if (!existingGrant) {
          await this.prisma.consentGrant.create({
            data: {
              id: uuidv7(),
              countryId,
              subjectPersonId: customerPersonId,
              recipientPartnerId: partner.id,
              purpose: 'consultation',
              grantedByPersonId: customerPersonId,
              scope: [],
            },
          });
        }
      }
    }

    this.logger.log('Seeded demo doctor appointment (confirmed + consent for sandbox consult)');
  }

  /** Reuse identical sandbox addresses so re-seeds do not flood checkout with duplicates. */
  private async findOrCreateDemoAddress(
    customer: Principal,
    input: {
      countryCode: string;
      recipientName: string;
      phone?: string;
      city: string;
      postalCode?: string;
      line1: string;
      line2?: string;
      isDefault?: boolean;
    },
  ): Promise<string> {
    const country = await this.prisma.country.findFirst({
      where: { isoAlpha2: input.countryCode.toUpperCase() },
    });
    if (country) {
      const existing = await this.prisma.customerAddress.findFirst({
        where: {
          customerPersonId: customer.personId,
          countryId: country.id,
          recipientName: input.recipientName,
          line1: input.line1,
          city: input.city,
          postalCode: input.postalCode ?? null,
        },
        orderBy: { createdAt: 'asc' },
      });
      if (existing) {
        return existing.id;
      }
    }
    const created = await this.carts.createAddress(customer, input);
    return (created as { id: string }).id;
  }

  /** Collapse duplicate sandbox address fingerprints (keep oldest). */
  private async dedupeSandboxAddresses(customerPersonId: string): Promise<void> {
    const rows = await this.prisma.customerAddress.findMany({
      where: { customerPersonId },
      orderBy: { createdAt: 'asc' },
    });
    const seen = new Set<string>();
    for (const row of rows) {
      const key = [
        row.countryId,
        row.recipientName.trim().toLowerCase(),
        row.line1.trim().toLowerCase(),
        row.city.trim().toLowerCase(),
        (row.postalCode ?? '').trim().toLowerCase(),
      ].join('|');
      if (seen.has(key)) {
        const inUse = await this.prisma.checkoutSession.count({ where: { addressId: row.id } });
        if (inUse > 0) continue;
        await this.prisma.customerAddress.delete({ where: { id: row.id } }).catch(() => undefined);
      } else {
        seen.add(key);
      }
    }
  }

  /**
   * Promote an existing sandbox customer order to DELIVERED so reorder is eligible.
   * Does not expand REORDER_ELIGIBLE_STATUSES — still DELIVERED-only.
   */
  private async ensureReorderEligibleFixture(customer: Principal): Promise<void> {
    const ORDER_NO = 'DEMO-SBX-REORDER-IN';
    const tagged = await this.prisma.order.findFirst({
      where: { orderNumber: ORDER_NO },
      include: { items: true },
    });
    if (tagged && tagged.items.length > 0) {
      if (tagged.status !== 'DELIVERED') {
        await this.prisma.order.update({ where: { id: tagged.id }, data: { status: 'DELIVERED' } });
        await this.prisma.shipment.updateMany({
          where: { orderId: tagged.id },
          data: { status: 'DELIVERED' },
        });
        this.logger.log(`Marked ${ORDER_NO} DELIVERED for reorder eligibility`);
      }
      return;
    }

    const candidate = await this.prisma.order.findFirst({
      where: {
        customerPersonId: customer.personId,
        items: { some: {} },
        status: { notIn: ['CANCELLED', 'REFUNDED'] },
      },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!candidate || candidate.items.length === 0) {
      this.logger.warn('Reorder fixture skipped — no customer order with items yet');
      return;
    }

    await this.prisma.order.update({
      where: { id: candidate.id },
      data: { status: 'DELIVERED' },
    });
    await this.prisma.shipment.updateMany({
      where: { orderId: candidate.id },
      data: { status: 'DELIVERED' },
    });
    this.logger.log(`Promoted order ${candidate.orderNumber ?? candidate.id} to DELIVERED for reorder`);
  }
}