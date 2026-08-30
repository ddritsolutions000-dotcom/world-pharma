import { Body, Controller, Get, Headers, Param, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { Errors } from '../common/problem';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { PaymentService } from '../payment/payment.service';
import { ImagingBookingService } from './imaging-booking.service';
import { ImagingPhysicalReportService } from './imaging-physical-report.service';

const createSchema = z
  .object({
    offer_id: z.string().uuid(),
    qty: z.number().int().min(1).max(10).optional(),
    imaging_org_id: z.string().uuid(),
    imaging_location_id: z.string().uuid(),
    slot_starts_at: z.string().datetime().optional(),
    slot_ends_at: z.string().datetime().optional(),
    timezone: z.string().min(1).optional(),
    country: z.string().length(2),
    prep_acknowledged: z.literal(true),
    referral_reference: z.string().min(1).optional(),
  })
  .strict();

const eligibilitySchema = z
  .object({
    imaging_org_id: z.string().uuid(),
    offer_id: z.string().uuid().optional(),
    country: z.string().length(2),
    referral_reference: z.string().min(1).optional(),
  })
  .strict();

const paySchema = z
  .object({
    method: z.string().optional(),
    scenario: z.enum(['success', 'failed', 'requires_action', 'unknown', 'pre_submit_fail']).optional(),
  })
  .strict();

@Controller('me/imaging')
@UseGuards(JwtAuthGuard, AudienceGuard)
@RequireAudiences('customer')
export class CustomerImagingBookingController {
  constructor(
    private readonly bookings: ImagingBookingService,
    private readonly payments: PaymentService,
    private readonly physicalReports: ImagingPhysicalReportService,
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
  slots(@Query('imaging_org_id') imagingOrgId: string, @Query('country') country: string) {
    if (!imagingOrgId || !country) {
      throw Errors.validation('imaging_org_id and country are required');
    }
    return this.bookings.listSlots(imagingOrgId, country);
  }

  @Get('locations')
  locations(@Query('imaging_org_id') imagingOrgId: string, @Query('country') country: string) {
    if (!imagingOrgId || !country) {
      throw Errors.validation('imaging_org_id and country are required');
    }
    return this.bookings.listImagingLocations(imagingOrgId, country);
  }

  @Post('eligibility')
  eligibility(@Body() body: unknown) {
    const parsed = eligibilitySchema.safeParse(body);
    if (!parsed.success) {
      throw Errors.validation('Invalid imaging eligibility payload.');
    }
    return this.bookings.checkEligibility({
      imagingOrgId: parsed.data.imaging_org_id,
      offerId: parsed.data.offer_id,
      countryCode: parsed.data.country,
      referralReference: parsed.data.referral_reference,
    });
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
      throw Errors.validation('Invalid imaging booking payload.');
    }
    return this.bookings.createBooking(principal, {
      offerId: parsed.data.offer_id,
      qty: parsed.data.qty,
      imagingOrgId: parsed.data.imaging_org_id,
      imagingLocationId: parsed.data.imaging_location_id,
      slotStartsAt: parsed.data.slot_starts_at,
      slotEndsAt: parsed.data.slot_ends_at,
      timezone: parsed.data.timezone,
      countryCode: parsed.data.country,
      idempotencyKey,
      prepAcknowledged: parsed.data.prep_acknowledged,
      referralReference: parsed.data.referral_reference,
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
    return this.payments.payImagingBooking(principal, id, parsed.data, idempotencyKey);
  }

  @Get('bookings/:id/preparation')
  preparation(@CurrentPrincipal() principal: Principal, @Param('id') id: string) {
    return this.bookings.getPreparation(principal, id);
  }

  @Get('bookings/:id/progress')
  progress(@CurrentPrincipal() principal: Principal, @Param('id') id: string) {
    return this.bookings.getProgress(principal, id);
  }

  @Get('bookings/:id/report/status')
  reportStatus(@CurrentPrincipal() principal: Principal, @Param('id') id: string) {
    return this.bookings.getReportStatus(principal, id);
  }

  @Get('bookings/:id/report')
  report(@CurrentPrincipal() principal: Principal, @Param('id') id: string) {
    return this.bookings.getPublishedReport(principal, id);
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
    @Body() body: { customer_address_id?: string },
  ) {
    return this.physicalReports.requestPhysicalReport(
      principal,
      id,
      idempotencyKey,
      String(body?.customer_address_id ?? ''),
    );
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
