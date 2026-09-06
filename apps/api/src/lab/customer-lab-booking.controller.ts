import { Body, Controller, Get, Headers, Param, Post, Query, UseGuards } from '@nestjs/common';
import { LabCollectionMode } from '@prisma/client';
import { z } from 'zod';
import { Errors } from '../common/problem';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { PaymentService } from '../payment/payment.service';
import { LabBookingService } from './lab-booking.service';
import { LabDiagnosticsOpsService } from './lab-diagnostics-ops.service';
import { PathologyService } from './pathology.service';
import { PhysicalReportService } from './physical-report.service';
import { SampleCollectionService } from './sample-collection.service';

const createSchema = z
  .object({
    offer_id: z.string().uuid(),
    qty: z.number().int().min(1).max(10).optional(),
    collection_mode: z.enum(['HOME', 'CENTER']),
    lab_org_id: z.string().uuid(),
    lab_location_id: z.string().uuid().optional(),
    customer_address_id: z.string().uuid().optional(),
    slot_starts_at: z.string().datetime().optional(),
    slot_ends_at: z.string().datetime().optional(),
    timezone: z.string().min(1).optional(),
    country: z.string().length(2),
    family_member_id: z.string().uuid().nullable().optional(),
  })
  .strict();

const paySchema = z
  .object({
    method: z.string().optional(),
    scenario: z.enum(['success', 'failed', 'requires_action', 'unknown', 'pre_submit_fail']).optional(),
  })
  .strict();

@Controller('me/lab')
@UseGuards(JwtAuthGuard, AudienceGuard)
@RequireAudiences('customer')
export class CustomerLabBookingController {
  constructor(
    private readonly bookings: LabBookingService,
    private readonly payments: PaymentService,
    private readonly collections: SampleCollectionService,
    private readonly diagnosticsOps: LabDiagnosticsOpsService,
    private readonly pathology: PathologyService,
    private readonly physicalReports: PhysicalReportService,
  ) {}

  @Get('catalog')
  catalog(
    @Query('country') country: string,
    @Query('q') q?: string,
    @Query('cursor') cursor?: string,
  ) {
    if (!country) {
      throw Errors.validation('country is required');
    }
    return this.bookings.browseCatalog(country, { q, cursor });
  }

  @Get('catalog/:slug')
  detail(@Param('slug') slug: string, @Query('country') country: string) {
    if (!country) {
      throw Errors.validation('country is required');
    }
    return this.bookings.catalogDetail(country, slug);
  }

  @Get('slots')
  slots(
    @Query('lab_org_id') labOrgId: string,
    @Query('collection_mode') collectionMode: string,
    @Query('country') country: string,
  ) {
    if (!labOrgId || !collectionMode || !country) {
      throw Errors.validation('lab_org_id, collection_mode, and country are required');
    }
    if (collectionMode !== 'HOME' && collectionMode !== 'CENTER') {
      throw Errors.validation('collection_mode must be HOME or CENTER');
    }
    return this.bookings.listSlots(labOrgId, collectionMode as LabCollectionMode, country);
  }

  @Get('locations')
  locations(@Query('lab_org_id') labOrgId: string, @Query('country') country: string) {
    if (!labOrgId || !country) {
      throw Errors.validation('lab_org_id and country are required');
    }
    return this.bookings.listLabLocations(labOrgId, country);
  }

  @Get('bookings')
  list(@CurrentPrincipal() principal: Principal) {
    return this.bookings.listCustomerBookings(principal);
  }

  @Get('bookings/:id')
  get(@CurrentPrincipal() principal: Principal, @Param('id') id: string) {
    return this.bookings.getCustomerBooking(principal, id);
  }

  @Post('bookings')
  create(
    @CurrentPrincipal() principal: Principal,
    @Headers('idempotency-key') idempotencyKey: string,
    @Body() body: unknown,
  ) {
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      throw Errors.validation('Invalid lab booking payload.');
    }
    return this.bookings.createBooking(principal, {
      offerId: parsed.data.offer_id,
      qty: parsed.data.qty,
      collectionMode: parsed.data.collection_mode as LabCollectionMode,
      labOrgId: parsed.data.lab_org_id,
      labLocationId: parsed.data.lab_location_id,
      customerAddressId: parsed.data.customer_address_id,
      slotStartsAt: parsed.data.slot_starts_at,
      slotEndsAt: parsed.data.slot_ends_at,
      timezone: parsed.data.timezone,
      countryCode: parsed.data.country,
      idempotencyKey,
      familyMemberId: parsed.data.family_member_id,
    });
  }

  @Post('bookings/:id/pay')
  pay(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Headers('idempotency-key') idempotencyKey: string,
    @Body() body: unknown,
  ) {
    const parsed = paySchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw Errors.validation('Invalid payment payload.');
    }
    return this.payments.payLabBooking(principal, id, parsed.data, idempotencyKey);
  }

  @Get('bookings/:id/collection')
  collection(@CurrentPrincipal() principal: Principal, @Param('id') id: string) {
    return this.diagnosticsOps.getCustomerProgress(id, principal.personId);
  }

  @Get('bookings/:id/report/status')
  reportStatus(@CurrentPrincipal() principal: Principal, @Param('id') id: string) {
    return this.pathology.getCustomerReportStatus(id, principal.personId);
  }

  @Get('bookings/:id/report')
  report(@CurrentPrincipal() principal: Principal, @Param('id') id: string) {
    return this.pathology.getCustomerPublishedReport(id, principal.personId);
  }

  @Get('bookings/:id/physical-report/eligibility')
  physicalReportEligibility(@CurrentPrincipal() principal: Principal, @Param('id') id: string) {
    return this.physicalReports.getCustomerEligibility(id, principal.personId);
  }

  @Post('bookings/:id/physical-report')
  requestPhysicalReport(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Headers('idempotency-key') idempotencyKey: string,
  ) {
    return this.physicalReports.requestPhysicalReport(principal, id, idempotencyKey);
  }

  @Get('bookings/:id/physical-report')
  physicalReportStatus(@CurrentPrincipal() principal: Principal, @Param('id') id: string) {
    return this.physicalReports.getCustomerPhysicalReport(id, principal.personId);
  }

  @Post('bookings/:id/physical-report/cancel')
  cancelPhysicalReport(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: { reason?: string },
  ) {
    return this.physicalReports.cancelCustomerRequest(principal, id, body?.reason);
  }

  @Post('bookings/:id/cancel')
  cancel(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: { reason_code?: string },
  ) {
    return this.bookings.cancelCustomerBooking(principal, id, body?.reason_code);
  }
}
