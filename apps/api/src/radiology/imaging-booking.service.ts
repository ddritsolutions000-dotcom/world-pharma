import { Injectable } from '@nestjs/common';
import {
  CatalogItemKind,
  CatalogLifecycle,
  ConversionEventKind,
  ImagingBookingStatus,
  KycCaseStatus,
  LocationKind,
  OfferOwnership,
  OfferStatus,
  OrganizationKind,
  PartnerStatus,
  Prisma,
} from '@prisma/client';
import { uuidv7 } from '@world-pharma/shared';
import { PrismaService } from '../app/prisma.service';
import { Errors } from '../common/problem';
import { OutboxService } from '../events/outbox.service';
import type { Principal } from '../identity/current-principal';
import { SecurityEventsService } from '../identity/security-events.service';
import { assertImagingOrgAccess } from '../catalog/access';
import { PolicyResolver } from '../policy/resolver';
import { ConversionEventService } from '../crm/conversion-event.service';
import { workerTenantContext } from '../tenancy/build-tenant-context';
import { HealthSubjectService } from '../health/health-subject.service';
import { HealthcarePartnerReadinessService } from '../healthcare/healthcare-partner-readiness.service';
import { RadiologyCapabilityService } from './radiology-capability.service';
import { ImagingStudyService } from './imaging-study.service';
import { InterpretationService } from './interpretation.service';
import { evaluateImagingPartnerClinicalEligibility } from './imaging-pacs-dicom-production-workflow-closure';

function minorJson(value: bigint): string {
  return value.toString();
}

type CreateBookingInput = {
  offerId: string;
  qty?: number;
  imagingOrgId: string;
  imagingLocationId: string;
  slotStartsAt?: string;
  slotEndsAt?: string;
  timezone?: string;
  countryCode: string;
  idempotencyKey: string;
  prepAcknowledged?: boolean;
  referralReference?: string;
  familyMemberId?: string | null;
};

type EligibilityInput = {
  imagingOrgId: string;
  offerId?: string;
  countryCode: string;
  referralReference?: string;
};

@Injectable()
export class ImagingBookingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly capabilities: RadiologyCapabilityService,
    private readonly policy: PolicyResolver,
    private readonly outbox: OutboxService,
    private readonly security: SecurityEventsService,
    private readonly studies: ImagingStudyService,
    private readonly interpretation: InterpretationService,
    private readonly conversionEvents: ConversionEventService,
    private readonly healthSubjects: HealthSubjectService,
    private readonly healthcareReadiness: HealthcarePartnerReadinessService,
  ) {}

  async browseCatalog(countryCode: string, query?: { q?: string; cursor?: string; limit?: number }) {
    const country = await this.resolveCountry(countryCode);
    const eligibilityGate = await this.countryImagingGate(country.isoAlpha2);
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
      sandbox_note: 'Sandbox imaging discovery. Acquisition, interpretation, and live money remain OFF.',
    };
  }

  async catalogDetail(countryCode: string, slug: string) {
    const country = await this.resolveCountry(countryCode);
    const eligibilityGate = await this.countryImagingGate(country.isoAlpha2);
    if (!eligibilityGate.ok) {
      throw Errors.notFound('Imaging study not found or not bookable in this country.');
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
      throw Errors.notFound('Imaging study not found or not bookable in this country.');
    }
    return hit;
  }

  async listSlots(imagingOrgId: string, countryCode: string) {
    const country = await this.resolveCountry(countryCode);
    const elig = await this.capabilities.evaluate(imagingOrgId);
    if (elig.state !== 'ELIGIBLE' || !elig.booking_enabled) {
      throw Errors.serviceDisabled(elig.blocked_reason ?? 'Imaging booking is not available.');
    }
    if (!elig.pack.imaging_center_enabled) {
      throw Errors.serviceDisabled('Imaging center booking is disabled by country pack.');
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
        });
      }
    }
    return {
      imaging_org_id: imagingOrgId,
      data: slots,
      note: 'Commercial scheduling windows only. Not clinical triage.',
    };
  }

  async listImagingLocations(imagingOrgId: string, countryCode: string) {
    const country = await this.resolveCountry(countryCode);
    const elig = await this.capabilities.evaluate(imagingOrgId);
    if (elig.state !== 'ELIGIBLE' || !elig.booking_enabled || !elig.pack.imaging_center_enabled) {
      return { data: [], note: elig.blocked_reason ?? 'Imaging center locations unavailable.' };
    }
    const rows = await this.prisma.runWithTenant(workerTenantContext({ countryId: country.id }), () =>
      this.prisma.location.findMany({
        where: {
          organizationId: imagingOrgId,
          countryId: country.id,
          kind: LocationKind.IMAGING,
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
      }),
    );
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

  async checkEligibility(input: EligibilityInput) {
    const country = await this.resolveCountry(input.countryCode);
    const gate = await this.countryImagingGate(country.isoAlpha2);
    const elig = await this.capabilities.evaluate(input.imagingOrgId);
    const referralRequired = gate.pack.imaging_referral_required;
    const eligible =
      gate.ok &&
      elig.state === 'ELIGIBLE' &&
      elig.booking_enabled &&
      elig.pack.imaging_center_enabled &&
      (elig.country_code === null || elig.country_code === country.isoAlpha2);
    let blocked_reason: string | null = null;
    if (!gate.ok) {
      blocked_reason = gate.reason;
    } else if (!eligible) {
      blocked_reason = elig.blocked_reason ?? 'Imaging booking is not available for this center.';
    } else if (referralRequired && !input.referralReference?.trim()) {
      blocked_reason = 'referral_reference is required by country pack (ED-R8B-01 when imaging_referral_required).';
    }
    return {
      eligible: eligible && !blocked_reason,
      referral_required: referralRequired,
      imaging_org_id: input.imagingOrgId,
      country_code: country.isoAlpha2,
      pack: gate.pack,
      imaging_eligibility: {
        state: elig.state,
        booking_enabled: elig.booking_enabled,
        imaging_center_enabled: elig.pack.imaging_center_enabled,
      },
      blocked_reason,
      sandbox_note: 'ED-R8B-01: referral not required unless pack enables imaging_referral_required.',
    };
  }

  async createBooking(principal: Principal, input: CreateBookingInput) {
    if (!input.idempotencyKey?.trim()) {
      throw Errors.validation('Idempotency-Key header is required.');
    }
    const existing = await this.prisma.imagingBooking.findUnique({
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
    const subject = await this.healthSubjects.resolve(principal, country.isoAlpha2, input.familyMemberId);
    const qty = Math.max(1, Math.min(input.qty ?? 1, 10));
    const elig = await this.capabilities.evaluate(input.imagingOrgId);
    if (elig.state !== 'ELIGIBLE' || !elig.booking_enabled) {
      throw Errors.serviceDisabled(elig.blocked_reason ?? 'Imaging booking is not available for this center.');
    }
    await this.healthcareReadiness.assertBookingAllowed({
      kind: 'IMAGING_CENTER',
      countryCode: country.isoAlpha2,
      organizationId: input.imagingOrgId,
    });
    const partner = await this.prisma.partner.findFirst({
      where: { organizationId: input.imagingOrgId },
      select: { id: true, status: true },
      orderBy: { createdAt: 'desc' },
    });
    const kyc = partner
      ? await this.prisma.kycCase.findFirst({
          where: { partnerId: partner.id },
          orderBy: { createdAt: 'desc' },
          select: { status: true, expiresAt: true },
        })
      : null;
    const partnerGate = evaluateImagingPartnerClinicalEligibility({
      partnerStatus: (partner?.status as PartnerStatus | undefined) ?? null,
      kycStatus: (kyc?.status as KycCaseStatus | undefined) ?? null,
      kycExpiresAt: kyc?.expiresAt ?? null,
    });
    if (!partnerGate.allowed) {
      throw Errors.problem(
        403,
        partnerGate.blocker ?? 'PARTNER_NOT_ACTIVE',
        'Imaging booking blocked',
        partnerGate.detail,
      );
    }
    if (elig.country_code && elig.country_code !== country.isoAlpha2) {
      throw Errors.forbidden('Imaging organization is not in the selected country.');
    }
    if (!elig.pack.imaging_center_enabled) {
      throw Errors.serviceDisabled('Imaging center booking is disabled by country pack (fail-closed).');
    }
    if (!input.imagingLocationId) {
      throw Errors.validation('imaging_location_id is required for center imaging booking.');
    }
    if (!input.prepAcknowledged) {
      throw Errors.validation('prep_acknowledged must be true before booking (patient preparation acknowledgement).');
    }

    const gate = await this.countryImagingGate(country.isoAlpha2);
    const referralRequired = gate.pack.imaging_referral_required;
    if (referralRequired && !input.referralReference?.trim()) {
      throw Errors.validation('referral_reference is required when imaging_referral_required is enabled in country pack.');
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
      offer.ownership !== OfferOwnership.IMAGING_OWNED ||
      offer.sellerOrgId !== input.imagingOrgId ||
      offer.countryId !== country.id ||
      offer.variant.item.kind !== CatalogItemKind.IMAGING_STUDY ||
      offer.variant.item.status !== CatalogLifecycle.PUBLISHED
    ) {
      throw Errors.forbidden('Offer is not an eligible published IMAGING_STUDY for this center/country.');
    }
    const price = offer.prices[0];
    if (!price) {
      throw Errors.problem(409, 'PRICE_MISSING', 'Price missing', 'Offer has no current price.');
    }

    const location = await this.prisma.runWithTenant(workerTenantContext({ countryId: country.id }), () =>
      this.prisma.location.findUnique({ where: { id: input.imagingLocationId } }),
    );
    if (!location || !location.isActive) {
      throw Errors.forbidden('Imaging location is not available.');
    }
    if (location.organizationId !== input.imagingOrgId) {
      throw Errors.forbidden('Imaging location does not belong to the selected center (wrong-location denied).');
    }
    if (location.kind !== LocationKind.IMAGING) {
      throw Errors.forbidden('Location is not an IMAGING center site.');
    }
    if (location.countryId !== country.id) {
      throw Errors.forbidden('Imaging location country does not match booking country.');
    }

    let slotStartsAt: Date | undefined;
    let slotEndsAt: Date | undefined;
    if (input.slotStartsAt) {
      slotStartsAt = new Date(input.slotStartsAt);
      slotEndsAt = input.slotEndsAt ? new Date(input.slotEndsAt) : new Date(slotStartsAt.getTime() + 60 * 60 * 1000);
      if (Number.isNaN(slotStartsAt.getTime()) || Number.isNaN(slotEndsAt.getTime()) || slotEndsAt <= slotStartsAt) {
        throw Errors.validation('Invalid slot window.');
      }
      await this.assertSlotAvailable(input.imagingOrgId, location.id, slotStartsAt, slotEndsAt, country.id);
    }

    const unitMinor = price.sellMinor;
    const lineMinor = unitMinor * BigInt(qty);
    const title = offer.variant.item.translations[0]?.title ?? offer.variant.item.slug;
    const bookingId = uuidv7();
    const referralRef = input.referralReference?.trim() || null;

    const created = await this.prisma.runWithTenant(
      workerTenantContext({ countryId: country.id, personId: principal.personId }),
      () =>
        this.prisma.$transaction(async (tx) => {
          const booking = await tx.imagingBooking.create({
        data: {
          id: bookingId,
          countryId: country.id,
          customerPersonId: principal.personId,
          imagingOrgId: input.imagingOrgId,
          imagingLocationId: location.id,
          status: ImagingBookingStatus.BOOKED,
          currency: offer.currency,
          totalMinor: lineMinor,
          slotStartsAt: slotStartsAt ?? null,
          slotEndsAt: slotEndsAt ?? null,
          timezone: input.timezone ?? country.defaultTimezone,
          prepAcknowledged: true,
          referralReference: referralRef,
          idempotencyKey: input.idempotencyKey.trim(),
          sandbox: true,
          subjectFamilyMemberId: subject.familyMemberId,
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
                fromStatus: ImagingBookingStatus.BOOKED,
                toStatus: ImagingBookingStatus.BOOKED,
                actorPersonId: principal.personId,
                reasonCode: 'created',
              },
            ],
          },
          ...(referralRequired && referralRef
            ? {
                referral: {
                  create: {
                    id: uuidv7(),
                    referralReference: referralRef,
                  },
                },
              }
            : {}),
        },
        include: this.customerBookingInclude,
      });
      await this.outbox.enqueue(tx, {
        type: 'IMAGING_BOOKING_CREATED',
        aggregateType: 'ImagingBooking',
        aggregateId: booking.id,
        producer: 'radiology',
        countryId: country.id,
        payload: {
          customer_person_id: principal.personId,
          imaging_org_id: input.imagingOrgId,
          status: ImagingBookingStatus.BOOKED,
          sandbox: true,
        },
        occurrenceKey: `imaging_booking_created:${booking.id}`,
      });
          return booking;
        }),
    );

    await this.security.emit({
      type: 'IMAGING_BOOKING_CREATED',
      outcome: 'success',
      personId: principal.personId,
      metadata: {
        imaging_booking_id: created.id,
        imaging_org_id: input.imagingOrgId,
        sandbox: true,
      },
    });

    return this.presentCustomer(created);
  }

  async listCustomerBookings(principal: Principal) {
    const rows = await this.prisma.imagingBooking.findMany({
      where: { customerPersonId: principal.personId },
      include: this.customerBookingInclude,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    // Sequential present: nested worker runWithTenant uses SAVEPOINTs on the request
    // transaction; concurrent Promise.all raced PostgreSQL savepoint stacks (S154).
    const data = [];
    for (const row of rows) {
      data.push(await this.presentCustomer(row));
    }
    return { data };
  }

  async getCustomerBooking(principal: Principal, id: string) {
    const booking = await this.prisma.imagingBooking.findUnique({
      where: { id },
      include: this.customerBookingInclude,
    });
    if (!booking || booking.customerPersonId !== principal.personId) {
      throw Errors.forbidden('You cannot access another customer’s imaging booking.');
    }
    return this.presentCustomer(booking);
  }

  async cancelCustomerBooking(principal: Principal, id: string, reasonCode?: string) {
    const booking = await this.prisma.imagingBooking.findUnique({ where: { id } });
    if (!booking || booking.customerPersonId !== principal.personId) {
      throw Errors.forbidden('You cannot cancel another customer’s imaging booking.');
    }
    if (booking.status === ImagingBookingStatus.CANCELLED) {
      return this.getCustomerBooking(principal, id);
    }
    if (booking.status !== ImagingBookingStatus.BOOKED && booking.status !== ImagingBookingStatus.PAYMENT_FAILED) {
      throw Errors.problem(409, 'IMAGING_BOOKING_NOT_CANCELLABLE', 'Not cancellable', 'Only unpaid bookings can be cancelled in R8-B.');
    }
    return this.transition(booking.id, ImagingBookingStatus.CANCELLED, principal.personId, reasonCode ?? 'customer_cancel');
  }

  async getPreparation(principal: Principal, id: string) {
    const booking = await this.prisma.imagingBooking.findUnique({
      where: { id },
      include: { lines: true },
    });
    if (!booking || booking.customerPersonId !== principal.personId) {
      throw Errors.forbidden('You cannot access another customer’s imaging booking.');
    }
    const imagingLocation = booking.imagingLocationId
      ? await this.prisma.runWithTenant(workerTenantContext({ countryId: booking.countryId }), () =>
          this.prisma.location.findUnique({
            where: { id: booking.imagingLocationId },
            select: { name: true, city: true },
          }),
        )
      : null;
    const lineTitle = booking.lines[0]?.title ?? 'Imaging study';
    return {
      imaging_booking_id: booking.id,
      study_title: lineTitle,
      location: imagingLocation
        ? { name: imagingLocation.name, city: imagingLocation.city }
        : null,
      prep_acknowledged: booking.prepAcknowledged,
      instructions: [
        'Arrive 15 minutes before your scheduled slot with your booking reference.',
        'Wear comfortable clothing without metal where possible.',
        'Follow any fasting or contrast instructions provided by the imaging center separately.',
      ],
      note: 'Commercial preparation summary only. Not a clinical order or radiology report.',
    };
  }

  async getProgress(principal: Principal, id: string) {
    return this.studies.getCustomerProgress(id, principal.personId);
  }

  async getReportStatus(principal: Principal, id: string) {
    return this.interpretation.getCustomerReportStatus(id, principal.personId);
  }

  async getPublishedReport(principal: Principal, id: string) {
    return this.interpretation.getCustomerPublishedReport(id, principal.personId);
  }

  async listImagingOrgBookings(principal: Principal, imagingOrgId: string) {
    await assertImagingOrgAccess(this.prisma, principal, imagingOrgId);
    const rows = await this.prisma.imagingBooking.findMany({
      where: { imagingOrgId },
      include: this.bookingInclude,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return {
      data: rows.map((row) => this.presentImagingStaff(row)),
      note: 'Booking visibility. Acquisition and reports remain R8-C+.',
    };
  }

  async getImagingOrgBooking(principal: Principal, imagingOrgId: string, id: string) {
    await assertImagingOrgAccess(this.prisma, principal, imagingOrgId);
    const booking = await this.prisma.imagingBooking.findUnique({
      where: { id },
      include: this.bookingInclude,
    });
    if (!booking || booking.imagingOrgId !== imagingOrgId) {
      throw Errors.forbidden('You cannot access bookings for another imaging center.');
    }
    return this.presentImagingStaff(booking);
  }

  /** Called from PaymentService on CAPTURED — no Order created. */
  async confirmFromPayment(input: {
    imagingBookingId: string;
    paymentIntentId: string;
    customerPersonId: string;
    actorPersonId: string;
  }) {
    const booking = await this.prisma.imagingBooking.findUnique({ where: { id: input.imagingBookingId } });
    if (!booking) {
      throw Errors.notFound('Imaging booking not found.');
    }
    if (booking.customerPersonId !== input.customerPersonId) {
      throw Errors.forbidden('Payment customer does not own this imaging booking.');
    }
    if (booking.status === ImagingBookingStatus.CONFIRMED) {
      await this.studies.enqueueForConfirmedBooking(booking.id, input.actorPersonId);
      return;
    }
    if (booking.status !== ImagingBookingStatus.BOOKED && booking.status !== ImagingBookingStatus.PAYMENT_FAILED) {
      throw Errors.problem(409, 'IMAGING_BOOKING_NOT_PAYABLE', 'Not payable', 'Booking cannot be confirmed from this payment.');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.imagingBooking.update({
        where: { id: booking.id },
        data: {
          status: ImagingBookingStatus.CONFIRMED,
          paymentIntentId: input.paymentIntentId,
        },
      });
      await tx.imagingBookingStatusHistory.create({
        data: {
          id: uuidv7(),
          imagingBookingId: booking.id,
          fromStatus: booking.status,
          toStatus: ImagingBookingStatus.CONFIRMED,
          actorPersonId: input.actorPersonId,
          reasonCode: 'sandbox_payment_captured',
        },
      });
      await this.outbox.enqueue(tx, {
        type: 'IMAGING_BOOKING_CONFIRMED',
        aggregateType: 'ImagingBooking',
        aggregateId: booking.id,
        producer: 'radiology',
        countryId: booking.countryId,
        payload: {
          customer_person_id: booking.customerPersonId,
          imaging_org_id: booking.imagingOrgId,
          payment_intent_id: input.paymentIntentId,
          status: ImagingBookingStatus.CONFIRMED,
          sandbox: true,
        },
        occurrenceKey: `imaging_booking_confirmed:${booking.id}:${input.paymentIntentId}`,
      });
    });
    await this.security.emit({
      type: 'IMAGING_BOOKING_CONFIRMED',
      outcome: 'success',
      personId: input.actorPersonId,
      metadata: {
        imaging_booking_id: booking.id,
        imaging_org_id: booking.imagingOrgId,
        payment_intent_id: input.paymentIntentId,
        sandbox: true,
      },
    });
    const country = await this.prisma.country.findUniqueOrThrow({ where: { id: booking.countryId } });
    await this.conversionEvents
      .recordHook({
        countryCode: country.isoAlpha2,
        personId: booking.customerPersonId,
        eventKind: ConversionEventKind.IMAGING_BOOKING_COMPLETED,
        source: 'imaging_booking',
        sourceKey: booking.id,
        metadata: { imaging_booking_id: booking.id, imaging_org_id: booking.imagingOrgId },
      })
      .catch(() => undefined);
    await this.studies.enqueueForConfirmedBooking(booking.id, input.actorPersonId);
  }

  async markPaymentFailed(imagingBookingId: string, actorPersonId: string) {
    const booking = await this.prisma.imagingBooking.findUnique({ where: { id: imagingBookingId } });
    if (!booking || booking.status !== ImagingBookingStatus.BOOKED) {
      return;
    }
    await this.transition(booking.id, ImagingBookingStatus.PAYMENT_FAILED, actorPersonId, 'sandbox_payment_failed');
  }

  private async transition(
    id: string,
    toStatus: ImagingBookingStatus,
    actorPersonId: string,
    reasonCode: string,
  ) {
    const booking = await this.prisma.imagingBooking.findUniqueOrThrow({ where: { id } });
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.imagingBooking.update({
        where: { id },
        data: { status: toStatus },
        include: this.customerBookingInclude,
      });
      await tx.imagingBookingStatusHistory.create({
        data: {
          id: uuidv7(),
          imagingBookingId: id,
          fromStatus: booking.status,
          toStatus,
          actorPersonId,
          reasonCode,
        },
      });
      const eventType =
        toStatus === ImagingBookingStatus.CANCELLED
          ? 'IMAGING_BOOKING_CANCELLED'
          : toStatus === ImagingBookingStatus.PAYMENT_FAILED
            ? 'IMAGING_BOOKING_PAYMENT_FAILED'
            : 'IMAGING_BOOKING_CREATED';
      await this.outbox.enqueue(tx, {
        type: eventType,
        aggregateType: 'ImagingBooking',
        aggregateId: id,
        producer: 'radiology',
        countryId: booking.countryId,
        payload: {
          customer_person_id: booking.customerPersonId,
          imaging_org_id: booking.imagingOrgId,
          status: toStatus,
          sandbox: true,
        },
        occurrenceKey: `imaging_booking:${id}:${toStatus}:${reasonCode}`,
      });
      return row;
    });
    await this.security.emit({
      type:
        toStatus === ImagingBookingStatus.CANCELLED
          ? 'IMAGING_BOOKING_CANCELLED'
          : toStatus === ImagingBookingStatus.PAYMENT_FAILED
            ? 'IMAGING_BOOKING_PAYMENT_FAILED'
            : 'IMAGING_BOOKING_CREATED',
      outcome: 'success',
      personId: actorPersonId,
      metadata: { imaging_booking_id: id, imaging_org_id: booking.imagingOrgId, status: toStatus, sandbox: true },
    });
    return this.presentCustomer(updated);
  }

  private async assertSlotAvailable(
    imagingOrgId: string,
    imagingLocationId: string,
    slotStartsAt: Date,
    slotEndsAt: Date,
    countryId: string,
  ) {
    const conflict = await this.prisma.runWithTenant(workerTenantContext({ countryId }), () =>
      this.prisma.imagingBooking.findFirst({
        where: {
          imagingOrgId,
          imagingLocationId,
          status: { in: [ImagingBookingStatus.BOOKED, ImagingBookingStatus.CONFIRMED] },
          slotStartsAt: { not: null },
          slotEndsAt: { not: null },
          AND: [{ slotStartsAt: { lt: slotEndsAt } }, { slotEndsAt: { gt: slotStartsAt } }],
        },
        select: { id: true },
      }),
    );
    if (conflict) {
      throw Errors.problem(
        409,
        'IMAGING_SLOT_UNAVAILABLE',
        'Slot unavailable',
        'Another booking already occupies this imaging slot window.',
      );
    }
  }

  private catalogBrowseWhere(
    countryId: string,
    query?: { q?: string; cursor?: string },
  ): Prisma.CatalogItemWhereInput {
    return {
      kind: CatalogItemKind.IMAGING_STUDY,
      status: CatalogLifecycle.PUBLISHED,
      countries: { some: { countryId, available: true } },
      variants: {
        some: {
          offers: {
            some: {
              countryId,
              status: OfferStatus.PUBLISHED,
              ownership: OfferOwnership.IMAGING_OWNED,
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
              ownership: OfferOwnership.IMAGING_OWNED,
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
    items: Prisma.CatalogItemGetPayload<{ include: ReturnType<ImagingBookingService['catalogItemInclude']> }>[],
  ) {
    const data = [];
    for (const item of items) {
      const translation = item.translations[0];
      const offers = [];
      for (const variant of item.variants) {
        for (const offer of variant.offers) {
          if (offer.sellerOrg.kind !== OrganizationKind.IMAGING_CENTER) {
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
            imaging_eligibility: {
              state: elig.state,
              booking_enabled: elig.booking_enabled,
              imaging_center_enabled: elig.pack.imaging_center_enabled,
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

  private async resolveImagingDisplayName(imagingOrgId: string, countryId: string): Promise<string | null> {
    const org = await this.prisma.runWithTenant(workerTenantContext({ countryId }), () =>
      this.prisma.organization.findUnique({
        where: { id: imagingOrgId },
        select: { displayName: true },
      }),
    );
    return org?.displayName ?? null;
  }

  private readonly customerBookingInclude = {
    lines: true,
    country: { select: { isoAlpha2: true } },
  } satisfies Prisma.ImagingBookingInclude;

  private readonly bookingInclude = {
    ...this.customerBookingInclude,
    imagingLocation: { select: { id: true, name: true, city: true, addressLine: true } },
    imagingOrg: { select: { id: true, displayName: true, kind: true } },
  } satisfies Prisma.ImagingBookingInclude;

  private async presentCustomer(
    booking: Prisma.ImagingBookingGetPayload<{ include: typeof ImagingBookingService.prototype.customerBookingInclude }>,
  ) {
    const imagingDisplayName = await this.resolveImagingDisplayName(booking.imagingOrgId, booking.countryId);
    const imagingLocation = booking.imagingLocationId
      ? await this.prisma.runWithTenant(workerTenantContext({ countryId: booking.countryId }), () =>
          this.prisma.location.findUnique({
            where: { id: booking.imagingLocationId },
            select: { id: true, name: true, city: true, addressLine: true },
          }),
        )
      : null;
    return {
      id: booking.id,
      status: booking.status,
      country_code: booking.country.isoAlpha2,
      customer_person_id: booking.customerPersonId,
      subject_family_member_id: booking.subjectFamilyMemberId ?? null,
      imaging_org_id: booking.imagingOrgId,
      imaging_display_name: imagingDisplayName,
      imaging_location: imagingLocation
        ? {
            id: imagingLocation.id,
            name: imagingLocation.name,
            city: imagingLocation.city,
            address_line: imagingLocation.addressLine,
          }
        : null,
      currency: booking.currency,
      total_minor: minorJson(booking.totalMinor),
      slot_starts_at: booking.slotStartsAt?.toISOString() ?? null,
      slot_ends_at: booking.slotEndsAt?.toISOString() ?? null,
      timezone: booking.timezone,
      prep_acknowledged: booking.prepAcknowledged,
      referral_reference: booking.referralReference,
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
        creates_study: false,
        live_money: false,
        acquisition: false,
        report: false,
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

  private async countryImagingGate(isoAlpha2: string) {
    const resolved = await this.policy.resolvePublished(isoAlpha2);
    const document = resolved?.document ?? null;
    const pack = {
      published: Boolean(resolved),
      imaging_center_enabled: document ? this.policy.canUseService(document, 'imaging_center') : false,
      imaging_referral_required: document ? this.policy.canUseService(document, 'imaging_referral_required') : false,
    };
    if (!pack.published) {
      return { ok: false as const, pack, reason: 'No published country pack. Imaging discovery is fail-closed.' };
    }
    if (!pack.imaging_center_enabled) {
      return { ok: false as const, pack, reason: 'imaging_center is disabled for this country pack.' };
    }
    return { ok: true as const, pack, reason: null as string | null };
  }

  /** Imaging staff view — minimized customer identifiers. */
  private presentImagingStaff(
    booking: Prisma.ImagingBookingGetPayload<{ include: typeof ImagingBookingService.prototype.bookingInclude }>,
  ) {
    const imagingDisplayName = booking.imagingOrg?.displayName ?? null;
    return {
      id: booking.id,
      status: booking.status,
      country_code: booking.country.isoAlpha2,
      imaging_org_id: booking.imagingOrgId,
      imaging_display_name: imagingDisplayName,
      imaging_location: booking.imagingLocation
        ? {
            id: booking.imagingLocation.id,
            name: booking.imagingLocation.name,
            city: booking.imagingLocation.city,
            address_line: booking.imagingLocation.addressLine,
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
      note: 'Customer identifiers minimized. No clinical results. Acquisition not started.',
    };
  }
}
