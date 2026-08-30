import { Injectable } from '@nestjs/common';
import {
  CatalogItemKind,
  CatalogLifecycle,
  ConversionEventKind,
  LabBookingStatus,
  LabCollectionMode,
  LocationKind,
  OfferOwnership,
  OfferStatus,
  OrganizationKind,
  Prisma,
} from '@prisma/client';
import { uuidv7 } from '@world-pharma/shared';
import { PrismaService } from '../app/prisma.service';
import { Errors } from '../common/problem';
import { OutboxService } from '../events/outbox.service';
import type { Principal } from '../identity/current-principal';
import { SecurityEventsService } from '../identity/security-events.service';
import { assertLabOrgAccess } from '../catalog/access';
import { PolicyResolver } from '../policy/resolver';
import { ConversionEventService } from '../crm/conversion-event.service';
import { workerTenantContext } from '../tenancy/build-tenant-context';
import { LabCapabilityService } from './lab-capability.service';
import { SampleCollectionService } from './sample-collection.service';

function minorJson(value: bigint): string {
  return value.toString();
}

type CreateBookingInput = {
  offerId: string;
  qty?: number;
  collectionMode: LabCollectionMode;
  labOrgId: string;
  /** CENTER only — must belong to labOrgId (server-validated; never trust client as auth). */
  labLocationId?: string;
  /** HOME only — must belong to customer + country. */
  customerAddressId?: string;
  slotStartsAt?: string;
  slotEndsAt?: string;
  timezone?: string;
  countryCode: string;
  idempotencyKey: string;
};

@Injectable()
export class LabBookingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly capabilities: LabCapabilityService,
    private readonly policy: PolicyResolver,
    private readonly outbox: OutboxService,
    private readonly security: SecurityEventsService,
    private readonly collections: SampleCollectionService,
    private readonly conversionEvents: ConversionEventService,
  ) {}

  async browseCatalog(countryCode: string, query?: { q?: string; cursor?: string; limit?: number }) {
    const country = await this.resolveCountry(countryCode);
    const eligibilityGate = await this.countryLabGate(country.isoAlpha2);
    if (!eligibilityGate.ok) {
      return {
        country_enabled: false,
        pack: eligibilityGate.pack,
        data: [],
        next_cursor: null,
        note: eligibilityGate.reason,
      };
    }
    const limit = Math.min(query?.limit ?? 24, 50);
    const rows = await this.prisma.runWithTenant(workerTenantContext({ countryId: country.id }), () =>
      this.prisma.catalogItem.findMany({
        where: this.catalogBrowseWhere(country.id, query),
        include: this.catalogItemInclude(country.id),
        take: limit + 1,
        orderBy: { id: 'asc' },
      }),
    );
    const page = rows.slice(0, limit);
    const data = await this.formatCatalogItems(page);
    return {
      country_enabled: true,
      pack: eligibilityGate.pack,
      data,
      next_cursor: rows.length > limit ? page[page.length - 1]?.id ?? null : null,
      sandbox_note: 'Sandbox lab discovery. Live money and specimen collection remain OFF.',
    };
  }

  async catalogDetail(countryCode: string, slug: string) {
    const country = await this.resolveCountry(countryCode);
    const eligibilityGate = await this.countryLabGate(country.isoAlpha2);
    if (!eligibilityGate.ok) {
      throw Errors.notFound('Lab test not found or not bookable in this country.');
    }
    const rows = await this.prisma.runWithTenant(workerTenantContext({ countryId: country.id }), () =>
      this.prisma.catalogItem.findMany({
        where: {
          ...this.catalogBrowseWhere(country.id),
          slug,
        },
        include: this.catalogItemInclude(country.id),
        take: 1,
      }),
    );
    const data = await this.formatCatalogItems(rows);
    const hit = data[0];
    if (!hit) {
      throw Errors.notFound('Lab test not found or not bookable in this country.');
    }
    return hit;
  }

  async listSlots(labOrgId: string, collectionMode: LabCollectionMode, countryCode: string) {
    const country = await this.resolveCountry(countryCode);
    const elig = await this.capabilities.evaluate(labOrgId);
    if (elig.state !== 'ELIGIBLE' || !elig.booking_enabled) {
      throw Errors.serviceDisabled(elig.blocked_reason ?? 'Lab booking is not available.');
    }
    if (collectionMode === LabCollectionMode.HOME && !elig.pack.lab_home_enabled) {
      throw Errors.serviceDisabled('Home collection is disabled by country pack.');
    }
    if (collectionMode === LabCollectionMode.CENTER && !elig.pack.lab_center_enabled) {
      throw Errors.serviceDisabled('Center collection is disabled by country pack.');
    }
    const tz = country.defaultTimezone || 'UTC';
    const slots = [];
    const now = new Date();
    for (let day = 1; day <= 7; day += 1) {
      for (const hour of [9, 14]) {
        const starts = new Date(now);
        starts.setUTCDate(starts.getUTCDate() + day);
        starts.setUTCHours(hour, 0, 0, 0);
        const ends = new Date(starts);
        ends.setUTCMinutes(ends.getUTCMinutes() + 60);
        slots.push({
          starts_at: starts.toISOString(),
          ends_at: ends.toISOString(),
          timezone: tz,
          collection_mode: collectionMode,
        });
      }
    }
    return {
      lab_org_id: labOrgId,
      collection_mode: collectionMode,
      data: slots,
      note: 'Commercial scheduling windows only. Not clinical triage.',
    };
  }

  async listLabLocations(labOrgId: string, countryCode: string) {
    const country = await this.resolveCountry(countryCode);
    const elig = await this.capabilities.evaluate(labOrgId);
    if (elig.state !== 'ELIGIBLE' || !elig.booking_enabled || !elig.pack.lab_center_enabled) {
      return { data: [], note: elig.blocked_reason ?? 'Center locations unavailable.' };
    }
    const rows = await this.prisma.location.findMany({
      where: {
        organizationId: labOrgId,
        countryId: country.id,
        kind: LocationKind.LAB,
        isActive: true,
      },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        city: true,
        region: true,
        addressLine: true,
        postalCode: true,
        timezone: true,
      },
    });
    return {
      data: rows.map((row) => ({
        id: row.id,
        name: row.name,
        city: row.city,
        region: row.region,
        address_line: row.addressLine,
        postal_code: row.postalCode,
        timezone: row.timezone,
      })),
    };
  }

  async createBooking(principal: Principal, input: CreateBookingInput) {
    if (!input.idempotencyKey?.trim()) {
      throw Errors.validation('Idempotency-Key header is required.');
    }
    const existing = await this.prisma.labBooking.findUnique({
      where: { idempotencyKey: input.idempotencyKey.trim() },
      include: this.customerBookingInclude,
    });
    if (existing) {
      if (existing.customerPersonId !== principal.personId) {
        throw Errors.conflict('Idempotency key already used.');
      }
      return this.presentCustomer(existing);
    }

    const country = await this.resolveCountry(input.countryCode);
    const qty = Math.max(1, Math.min(input.qty ?? 1, 10));
    const elig = await this.capabilities.evaluate(input.labOrgId);
    if (elig.state !== 'ELIGIBLE' || !elig.booking_enabled) {
      throw Errors.serviceDisabled(elig.blocked_reason ?? 'Lab booking is not available for this laboratory.');
    }
    if (elig.country_code && elig.country_code !== country.isoAlpha2) {
      throw Errors.forbidden('Lab organization is not in the selected country.');
    }

    if (input.collectionMode === LabCollectionMode.HOME) {
      if (!elig.pack.lab_home_enabled) {
        throw Errors.serviceDisabled('Home collection is disabled by country pack (fail-closed).');
      }
      if (!input.customerAddressId) {
        throw Errors.validation('customer_address_id is required for HOME collection.');
      }
      if (input.labLocationId) {
        throw Errors.validation('lab_location_id must not be set for HOME collection.');
      }
    } else {
      if (!elig.pack.lab_center_enabled) {
        throw Errors.serviceDisabled('Center collection is disabled by country pack (fail-closed).');
      }
      if (!input.labLocationId) {
        throw Errors.validation('lab_location_id is required for CENTER collection.');
      }
    }

    const offer = await this.prisma.runWithTenant(workerTenantContext({ countryId: country.id }), () =>
      this.prisma.catalogOffer.findUnique({
        where: { id: input.offerId },
        include: {
          prices: { where: { isCurrent: true }, take: 1 },
          variant: { include: { item: { include: { translations: true } } } },
          sellerOrg: true,
          country: true,
        },
      }),
    );
    if (
      !offer ||
      offer.status !== OfferStatus.PUBLISHED ||
      offer.ownership !== OfferOwnership.LAB_OWNED ||
      offer.sellerOrgId !== input.labOrgId ||
      offer.countryId !== country.id ||
      offer.variant.item.kind !== CatalogItemKind.LAB_TEST ||
      offer.variant.item.status !== CatalogLifecycle.PUBLISHED
    ) {
      throw Errors.forbidden('Offer is not an eligible published LAB_TEST for this lab/country.');
    }
    const price = offer.prices[0];
    if (!price) {
      throw Errors.problem(409, 'PRICE_MISSING', 'Price missing', 'Offer has no current price.');
    }

    let addressSnapshot: Prisma.InputJsonValue | undefined;
    let customerAddressId: string | undefined;
    let labLocationId: string | undefined;

    if (input.collectionMode === LabCollectionMode.HOME) {
      const address = await this.prisma.customerAddress.findUnique({ where: { id: input.customerAddressId! } });
      if (!address || address.customerPersonId !== principal.personId) {
        throw Errors.forbidden('Address does not belong to this customer.');
      }
      if (address.countryId !== country.id) {
        throw Errors.forbidden('Address country does not match booking country.');
      }
      customerAddressId = address.id;
      addressSnapshot = {
        recipient_name: address.recipientName,
        city: address.city,
        line1: address.line1,
        line2: address.line2,
        region: address.region,
        postal_code: address.postalCode,
        country_id: address.countryId,
      };
    } else {
      const location = await this.prisma.location.findUnique({ where: { id: input.labLocationId! } });
      if (!location || !location.isActive) {
        throw Errors.forbidden('Lab location is not available.');
      }
      if (location.organizationId !== input.labOrgId) {
        throw Errors.forbidden('Lab location does not belong to the selected laboratory (wrong-location denied).');
      }
      if (location.kind !== LocationKind.LAB) {
        throw Errors.forbidden('Location is not a LAB collection site.');
      }
      if (location.countryId !== country.id) {
        throw Errors.forbidden('Lab location country does not match booking country.');
      }
      labLocationId = location.id;
    }

    let slotStartsAt: Date | undefined;
    let slotEndsAt: Date | undefined;
    if (input.slotStartsAt) {
      slotStartsAt = new Date(input.slotStartsAt);
      slotEndsAt = input.slotEndsAt ? new Date(input.slotEndsAt) : new Date(slotStartsAt.getTime() + 60 * 60 * 1000);
      if (Number.isNaN(slotStartsAt.getTime()) || Number.isNaN(slotEndsAt.getTime()) || slotEndsAt <= slotStartsAt) {
        throw Errors.validation('Invalid slot window.');
      }
    }

    const unitMinor = price.sellMinor;
    const lineMinor = unitMinor * BigInt(qty);
    const title = offer.variant.item.translations[0]?.title ?? offer.variant.item.slug;
    const bookingId = uuidv7();

    const created = await this.prisma.$transaction(async (tx) => {
      const booking = await tx.labBooking.create({
        data: {
          id: bookingId,
          countryId: country.id,
          customerPersonId: principal.personId,
          labOrgId: input.labOrgId,
          labLocationId: labLocationId ?? null,
          collectionMode: input.collectionMode,
          status: LabBookingStatus.BOOKED,
          currency: offer.currency,
          totalMinor: lineMinor,
          slotStartsAt: slotStartsAt ?? null,
          slotEndsAt: slotEndsAt ?? null,
          timezone: input.timezone ?? country.defaultTimezone,
          customerAddressId: customerAddressId ?? null,
          addressSnapshot: addressSnapshot ?? undefined,
          idempotencyKey: input.idempotencyKey.trim(),
          sandbox: true,
          lines: {
            create: [
              {
                id: uuidv7(),
                offerId: offer.id,
                variantId: offer.variantId,
                title,
                qty,
                unitMinor,
                lineMinor,
                currency: offer.currency,
                priceVersion: price.version,
              },
            ],
          },
          history: {
            create: [
              {
                id: uuidv7(),
                fromStatus: LabBookingStatus.BOOKED,
                toStatus: LabBookingStatus.BOOKED,
                actorPersonId: principal.personId,
                reasonCode: 'created',
              },
            ],
          },
        },
        include: this.customerBookingInclude,
      });
      await this.outbox.enqueue(tx, {
        type: 'LAB_BOOKING_CREATED',
        aggregateType: 'LabBooking',
        aggregateId: booking.id,
        producer: 'lab',
        countryId: country.id,
        payload: {
          customer_person_id: principal.personId,
          lab_org_id: input.labOrgId,
          status: LabBookingStatus.BOOKED,
          collection_mode: input.collectionMode,
          sandbox: true,
        },
        occurrenceKey: `lab_booking_created:${booking.id}`,
      });
      return booking;
    });

    await this.security.emit({
      type: 'LAB_BOOKING_CREATED',
      outcome: 'success',
      personId: principal.personId,
      metadata: {
        lab_booking_id: created.id,
        lab_org_id: input.labOrgId,
        collection_mode: input.collectionMode,
        sandbox: true,
      },
    });

    return this.presentCustomer(created);
  }

  async listCustomerBookings(principal: Principal) {
    const rows = await this.prisma.labBooking.findMany({
      where: { customerPersonId: principal.personId },
      include: this.customerBookingInclude,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return { data: await Promise.all(rows.map((row) => this.presentCustomer(row))) };
  }

  async getCustomerBooking(principal: Principal, id: string) {
    const booking = await this.prisma.labBooking.findUnique({
      where: { id },
      include: this.customerBookingInclude,
    });
    if (!booking || booking.customerPersonId !== principal.personId) {
      throw Errors.forbidden('You cannot access another customer’s lab booking.');
    }
    return this.presentCustomer(booking);
  }

  async cancelCustomerBooking(principal: Principal, id: string, reasonCode?: string) {
    const booking = await this.prisma.labBooking.findUnique({ where: { id } });
    if (!booking || booking.customerPersonId !== principal.personId) {
      throw Errors.forbidden('You cannot cancel another customer’s lab booking.');
    }
    if (booking.status === LabBookingStatus.CANCELLED) {
      return this.getCustomerBooking(principal, id);
    }
    if (booking.status !== LabBookingStatus.BOOKED && booking.status !== LabBookingStatus.PAYMENT_FAILED) {
      throw Errors.problem(409, 'LAB_BOOKING_NOT_CANCELLABLE', 'Not cancellable', 'Only unpaid bookings can be cancelled in R7-B.');
    }
    return this.transition(booking.id, LabBookingStatus.CANCELLED, principal.personId, reasonCode ?? 'customer_cancel');
  }

  async listLabOrgBookings(principal: Principal, labOrgId: string) {
    await assertLabOrgAccess(this.prisma, principal, labOrgId);
    const rows = await this.prisma.labBooking.findMany({
      where: { labOrgId },
      include: this.bookingInclude,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return {
      data: rows.map((row) => this.presentLabStaff(row)),
      note: 'Booking visibility. Collection queue in R7-C; accession/pathology remain R7-D+.',
    };
  }

  async getLabOrgBooking(principal: Principal, labOrgId: string, id: string) {
    await assertLabOrgAccess(this.prisma, principal, labOrgId);
    const booking = await this.prisma.labBooking.findUnique({
      where: { id },
      include: this.bookingInclude,
    });
    if (!booking || booking.labOrgId !== labOrgId) {
      throw Errors.forbidden('You cannot access bookings for another laboratory.');
    }
    return this.presentLabStaff(booking);
  }

  /** Called from PaymentService on CAPTURED — no Order created. */
  async confirmFromPayment(input: {
    labBookingId: string;
    paymentIntentId: string;
    customerPersonId: string;
    actorPersonId: string;
  }) {
    const booking = await this.prisma.labBooking.findUnique({ where: { id: input.labBookingId } });
    if (!booking) {
      throw Errors.notFound('Lab booking not found.');
    }
    if (booking.customerPersonId !== input.customerPersonId) {
      throw Errors.forbidden('Payment customer does not own this lab booking.');
    }
    if (booking.status === LabBookingStatus.CONFIRMED) {
      return;
    }
    if (booking.status !== LabBookingStatus.BOOKED && booking.status !== LabBookingStatus.PAYMENT_FAILED) {
      throw Errors.problem(409, 'LAB_BOOKING_NOT_PAYABLE', 'Not payable', 'Booking cannot be confirmed from this payment.');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.labBooking.update({
        where: { id: booking.id },
        data: {
          status: LabBookingStatus.CONFIRMED,
          paymentIntentId: input.paymentIntentId,
        },
      });
      await tx.labBookingStatusHistory.create({
        data: {
          id: uuidv7(),
          labBookingId: booking.id,
          fromStatus: booking.status,
          toStatus: LabBookingStatus.CONFIRMED,
          actorPersonId: input.actorPersonId,
          reasonCode: 'sandbox_payment_captured',
        },
      });
      await this.outbox.enqueue(tx, {
        type: 'LAB_BOOKING_CONFIRMED',
        aggregateType: 'LabBooking',
        aggregateId: booking.id,
        producer: 'lab',
        countryId: booking.countryId,
        payload: {
          customer_person_id: booking.customerPersonId,
          lab_org_id: booking.labOrgId,
          payment_intent_id: input.paymentIntentId,
          status: LabBookingStatus.CONFIRMED,
          sandbox: true,
        },
        occurrenceKey: `lab_booking_confirmed:${booking.id}:${input.paymentIntentId}`,
      });
    });
    await this.security.emit({
      type: 'LAB_BOOKING_CONFIRMED',
      outcome: 'success',
      personId: input.actorPersonId,
      metadata: {
        lab_booking_id: booking.id,
        lab_org_id: booking.labOrgId,
        payment_intent_id: input.paymentIntentId,
        sandbox: true,
      },
    });
    const country = await this.prisma.country.findUniqueOrThrow({ where: { id: booking.countryId } });
    await this.conversionEvents
      .recordHook({
        countryCode: country.isoAlpha2,
        personId: booking.customerPersonId,
        eventKind: ConversionEventKind.LAB_BOOKING_COMPLETED,
        source: 'lab_booking',
        sourceKey: booking.id,
        metadata: { lab_booking_id: booking.id, lab_org_id: booking.labOrgId },
      })
      .catch(() => undefined);
    await this.collections.enqueueForConfirmedBooking(booking.id, input.actorPersonId);
  }

  async markPaymentFailed(labBookingId: string, actorPersonId: string) {
    const booking = await this.prisma.labBooking.findUnique({ where: { id: labBookingId } });
    if (!booking || booking.status !== LabBookingStatus.BOOKED) {
      return;
    }
    await this.transition(booking.id, LabBookingStatus.PAYMENT_FAILED, actorPersonId, 'sandbox_payment_failed');
  }

  private async transition(
    id: string,
    toStatus: LabBookingStatus,
    actorPersonId: string,
    reasonCode: string,
  ) {
    const booking = await this.prisma.labBooking.findUniqueOrThrow({ where: { id } });
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.labBooking.update({
        where: { id },
        data: { status: toStatus },
        include: this.customerBookingInclude,
      });
      await tx.labBookingStatusHistory.create({
        data: {
          id: uuidv7(),
          labBookingId: id,
          fromStatus: booking.status,
          toStatus,
          actorPersonId,
          reasonCode,
        },
      });
      const eventType =
        toStatus === LabBookingStatus.CANCELLED
          ? 'LAB_BOOKING_CANCELLED'
          : toStatus === LabBookingStatus.PAYMENT_FAILED
            ? 'LAB_BOOKING_PAYMENT_FAILED'
            : 'LAB_BOOKING_UPDATED';
      await this.outbox.enqueue(tx, {
        type: eventType,
        aggregateType: 'LabBooking',
        aggregateId: id,
        producer: 'lab',
        countryId: booking.countryId,
        payload: {
          customer_person_id: booking.customerPersonId,
          lab_org_id: booking.labOrgId,
          status: toStatus,
          sandbox: true,
        },
        occurrenceKey: `lab_booking:${id}:${toStatus}:${reasonCode}`,
      });
      return row;
    });
    await this.security.emit({
      type:
        toStatus === LabBookingStatus.CANCELLED
          ? 'LAB_BOOKING_CANCELLED'
          : toStatus === LabBookingStatus.PAYMENT_FAILED
            ? 'LAB_BOOKING_PAYMENT_FAILED'
            : 'LAB_BOOKING_CREATED',
      outcome: 'success',
      personId: actorPersonId,
      metadata: { lab_booking_id: id, lab_org_id: booking.labOrgId, status: toStatus, sandbox: true },
    });
    return this.presentCustomer(updated);
  }

  private catalogBrowseWhere(
    countryId: string,
    query?: { q?: string; cursor?: string },
  ): Prisma.CatalogItemWhereInput {
    return {
      kind: CatalogItemKind.LAB_TEST,
      status: CatalogLifecycle.PUBLISHED,
      countries: { some: { countryId, available: true } },
      variants: {
        some: {
          offers: {
            some: {
              countryId,
              status: OfferStatus.PUBLISHED,
              ownership: OfferOwnership.LAB_OWNED,
            },
          },
        },
      },
      ...(query?.q
        ? {
            OR: [
              { slug: { contains: query.q, mode: 'insensitive' as const } },
              { translations: { some: { title: { contains: query.q, mode: 'insensitive' as const } } } },
            ],
          }
        : {}),
      ...(query?.cursor ? { id: { gt: query.cursor } } : {}),
    };
  }

  private catalogItemInclude(countryId: string) {
    return {
      translations: true,
      brand: true,
      category: true,
      assets: true,
      countries: true,
      variants: {
        include: {
          offers: {
            where: {
              countryId,
              status: OfferStatus.PUBLISHED,
              ownership: OfferOwnership.LAB_OWNED,
            },
            include: {
              sellerOrg: { select: { id: true, displayName: true, kind: true, status: true } },
              prices: { where: { isCurrent: true }, take: 1 },
              location: {
                select: { id: true, name: true, kind: true, city: true, isActive: true },
              },
            },
          },
        },
      },
    } satisfies Prisma.CatalogItemInclude;
  }

  private async formatCatalogItems(
    items: Prisma.CatalogItemGetPayload<{ include: ReturnType<LabBookingService['catalogItemInclude']> }>[],
  ) {
    const data = [];
    for (const item of items) {
      const translation = item.translations[0];
      const offers = [];
      for (const variant of item.variants) {
        for (const offer of variant.offers) {
          if (offer.sellerOrg.kind !== OrganizationKind.LAB) {
            continue;
          }
          const elig = await this.capabilities.evaluate(offer.sellerOrgId);
          if (elig.state !== 'ELIGIBLE' || !elig.booking_enabled) {
            continue;
          }
          const price = offer.prices[0];
          offers.push({
            id: offer.id,
            seller_org_id: offer.sellerOrgId,
            seller_display_name: offer.sellerOrg.displayName,
            ownership: offer.ownership,
            currency: offer.currency,
            sku: variant.skuCode,
            pack_size: variant.packSize,
            location: offer.location
              ? {
                  id: offer.location.id,
                  name: offer.location.name,
                  city: offer.location.city,
                  kind: offer.location.kind,
                  is_active: offer.location.isActive,
                }
              : null,
            price: price
              ? {
                  sell_minor: minorJson(price.sellMinor),
                  list_minor: price.listMinor === null ? null : minorJson(price.listMinor),
                  version: price.version,
                }
              : null,
            lab_eligibility: {
              state: elig.state,
              booking_enabled: elig.booking_enabled,
              lab_home_enabled: elig.pack.lab_home_enabled,
              lab_center_enabled: elig.pack.lab_center_enabled,
            },
          });
        }
      }
      if (!offers.length) {
        continue;
      }
      data.push({
        id: item.id,
        slug: item.slug,
        kind: item.kind,
        title: translation?.title ?? item.slug,
        description: translation?.description ?? '',
        brand: item.brand?.name ?? null,
        category: item.category?.name ?? null,
        assets: item.assets.map((a) => ({ url: a.publicUrl, alt: a.alt })),
        offers,
        inventory: { available: true },
        note: 'Catalog copy only. Not medical advice.',
      });
    }
    return data;
  }

  private async resolveLabDisplayName(labOrgId: string, countryId: string): Promise<string | null> {
    const org = await this.prisma.runWithTenant(workerTenantContext({ countryId }), () =>
      this.prisma.organization.findUnique({
        where: { id: labOrgId },
        select: { displayName: true },
      }),
    );
    return org?.displayName ?? null;
  }

  private readonly customerBookingInclude = {
    lines: true,
    labLocation: { select: { id: true, name: true, city: true, addressLine: true } },
    country: { select: { isoAlpha2: true } },
  } satisfies Prisma.LabBookingInclude;

  private readonly bookingInclude = {
    ...this.customerBookingInclude,
    labOrg: { select: { id: true, displayName: true, kind: true } },
  } satisfies Prisma.LabBookingInclude;

  private async presentCustomer(
    booking: Prisma.LabBookingGetPayload<{ include: typeof LabBookingService.prototype.customerBookingInclude }>,
  ) {
    const labDisplayName = await this.resolveLabDisplayName(booking.labOrgId, booking.countryId);
    return {
      id: booking.id,
      status: booking.status,
      collection_mode: booking.collectionMode,
      country_code: booking.country.isoAlpha2,
      customer_person_id: booking.customerPersonId,
      lab_org_id: booking.labOrgId,
      lab_display_name: labDisplayName,
      lab_location: booking.labLocation
        ? {
            id: booking.labLocation.id,
            name: booking.labLocation.name,
            city: booking.labLocation.city,
            address_line: booking.labLocation.addressLine,
          }
        : null,
      currency: booking.currency,
      total_minor: minorJson(booking.totalMinor),
      slot_starts_at: booking.slotStartsAt?.toISOString() ?? null,
      slot_ends_at: booking.slotEndsAt?.toISOString() ?? null,
      timezone: booking.timezone,
      customer_address_id: booking.customerAddressId,
      payment_intent_id: booking.paymentIntentId,
      sandbox: booking.sandbox,
      lines: booking.lines.map((line) => ({
        id: line.id,
        offer_id: line.offerId,
        variant_id: line.variantId,
        title: line.title,
        qty: line.qty,
        unit_minor: minorJson(line.unitMinor),
        line_minor: minorJson(line.lineMinor),
        currency: line.currency,
        price_version: line.priceVersion,
      })),
      created_at: booking.createdAt.toISOString(),
      updated_at: booking.updatedAt.toISOString(),
      boundary: {
        creates_order: false,
        creates_specimen: booking.status === LabBookingStatus.CONFIRMED,
        live_money: false,
        pathology: false,
      },
    };
  }

  private async resolveCountry(countryCode: string) {
    const country = await this.prisma.country.findUnique({ where: { isoAlpha2: countryCode.toUpperCase() } });
    if (!country) {
      throw Errors.notFound('Country is not available.');
    }
    return country;
  }

  private async countryLabGate(isoAlpha2: string) {
    const resolved = await this.policy.resolvePublished(isoAlpha2);
    const document = resolved?.document ?? null;
    const pack = {
      published: Boolean(resolved),
      lab_home_enabled: document ? this.policy.canUseService(document, 'lab_home') : false,
      lab_center_enabled: document ? this.policy.canUseService(document, 'lab_center') : false,
    };
    if (!pack.published) {
      return { ok: false as const, pack, reason: 'No published country pack. Lab discovery is fail-closed.' };
    }
    if (!pack.lab_home_enabled && !pack.lab_center_enabled) {
      return { ok: false as const, pack, reason: 'lab_home and lab_center are disabled for this country pack.' };
    }
    return { ok: true as const, pack, reason: null as string | null };
  }

  /** Lab staff view — no address snapshot PHI dump. */
  private presentLabStaff(
    booking: Prisma.LabBookingGetPayload<{ include: typeof LabBookingService.prototype.bookingInclude }>,
  ) {
    const labDisplayName = booking.labOrg?.displayName ?? null;
    return {
      id: booking.id,
      status: booking.status,
      collection_mode: booking.collectionMode,
      country_code: booking.country.isoAlpha2,
      lab_org_id: booking.labOrgId,
      lab_display_name: labDisplayName,
      lab_location: booking.labLocation
        ? {
            id: booking.labLocation.id,
            name: booking.labLocation.name,
            city: booking.labLocation.city,
            address_line: booking.labLocation.addressLine,
          }
        : null,
      currency: booking.currency,
      total_minor: minorJson(booking.totalMinor),
      slot_starts_at: booking.slotStartsAt?.toISOString() ?? null,
      slot_ends_at: booking.slotEndsAt?.toISOString() ?? null,
      timezone: booking.timezone,
      sandbox: booking.sandbox,
      lines: booking.lines.map((line) => ({
        id: line.id,
        title: line.title,
        qty: line.qty,
        line_minor: minorJson(line.lineMinor),
        currency: line.currency,
      })),
      created_at: booking.createdAt.toISOString(),
      note: 'Customer identifiers minimized. No clinical results. Collection not started.',
    };
  }
}
