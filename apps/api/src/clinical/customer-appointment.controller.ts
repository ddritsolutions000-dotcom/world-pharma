import { Body, Controller, Get, Headers, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Errors } from '../common/problem';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { AppointmentService } from './appointment.service';
import { VideoService } from './video.service';

@Controller()
@UseGuards(JwtAuthGuard, AudienceGuard)
@RequireAudiences('customer')
export class CustomerAppointmentController {
  constructor(
    private readonly appointments: AppointmentService,
    private readonly video: VideoService,
  ) {}

  @Get('care/doctors')
  directory(@Query('country_code') countryCode: string | undefined, @CurrentPrincipal() principal: Principal) {
    this.assertCustomer(principal);
    if (!countryCode) {
      throw Errors.validation('country_code is required');
    }
    return this.appointments.directory(countryCode);
  }

  @Get('care/doctors/:profileId')
  profile(
    @Param('profileId') profileId: string,
    @Query('country_code') countryCode: string | undefined,
    @CurrentPrincipal() principal: Principal,
  ) {
    this.assertCustomer(principal);
    if (!countryCode) {
      throw Errors.validation('country_code is required');
    }
    return this.appointments.publicProfile(profileId, countryCode);
  }

  @Get('care/doctors/:profileId/slots')
  slots(
    @Param('profileId') profileId: string,
    @Query('country_code') countryCode: string | undefined,
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @CurrentPrincipal() principal: Principal,
  ) {
    this.assertCustomer(principal);
    if (!countryCode || !from || !to) {
      throw Errors.validation('country_code, from and to are required');
    }
    return this.appointments.slots(profileId, countryCode, from, to);
  }

  @Post('appointments')
  @HttpCode(200)
  book(
    @Body()
    body: {
      doctor_profile_id?: string;
      country_code?: string;
      starts_at?: string;
      type?: string;
      organization_id?: string;
      location_id?: string;
      reason_category?: string;
    },
    @CurrentPrincipal() principal: Principal,
  ) {
    this.assertCustomer(principal);
    if (!body.doctor_profile_id || !body.country_code || !body.starts_at) {
      throw Errors.validation('doctor_profile_id, country_code and starts_at are required');
    }
    return this.appointments.book({
      customerPersonId: principal.personId,
      audience: principal.audience,
      doctorProfileId: body.doctor_profile_id,
      countryCode: body.country_code,
      startsAt: body.starts_at,
      type: body.type,
      organizationId: body.organization_id,
      locationId: body.location_id,
      reasonCategory: body.reason_category,
    });
  }

  @Get('appointments')
  list(@CurrentPrincipal() principal: Principal) {
    this.assertCustomer(principal);
    return this.appointments.listForCustomer(principal.personId);
  }

  @Get('appointments/:id')
  get(@Param('id') id: string, @CurrentPrincipal() principal: Principal) {
    return this.appointments.get(id, principal);
  }

  @Post('appointments/:id/cancel')
  @HttpCode(200)
  cancel(
    @Param('id') id: string,
    @Body() body: { reason_code?: string },
    @CurrentPrincipal() principal: Principal,
  ) {
    return this.appointments.cancel(id, { ...principal, reasonCode: body.reason_code });
  }

  @Post('appointments/:id/video/join')
  @HttpCode(200)
  joinVideo(
    @Param('id') id: string,
    @CurrentPrincipal() principal: Principal,
    @Headers('x-request-id') requestId?: string,
  ) {
    this.assertCustomer(principal);
    return this.video.join(id, principal, requestId);
  }

  @Post('appointments/:id/video/leave')
  @HttpCode(200)
  leaveVideo(
    @Param('id') id: string,
    @CurrentPrincipal() principal: Principal,
    @Headers('x-request-id') requestId?: string,
  ) {
    this.assertCustomer(principal);
    return this.video.leave(id, principal, requestId);
  }

  @Get('appointments/:id/video')
  getVideo(@Param('id') id: string, @CurrentPrincipal() principal: Principal) {
    this.assertCustomer(principal);
    return this.video.get(id, principal);
  }

  @Post('appointments/:id/reschedule')
  @HttpCode(200)
  reschedule(
    @Param('id') id: string,
    @Body() body: { starts_at?: string },
    @CurrentPrincipal() principal: Principal,
  ) {
    if (!body.starts_at) {
      throw Errors.validation('starts_at is required');
    }
    return this.appointments.reschedule(id, principal, body.starts_at);
  }

  private assertCustomer(principal: Principal) {
    if (principal.audience !== 'customer') {
      throw Errors.forbidden('Customer session required');
    }
  }
}
