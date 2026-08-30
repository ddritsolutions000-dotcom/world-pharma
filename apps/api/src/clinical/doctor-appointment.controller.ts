import { Body, Controller, Get, Headers, HttpCode, Param, Post, Put, UseGuards } from '@nestjs/common';
import { Errors } from '../common/problem';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { AppointmentService } from './appointment.service';
import { ScheduleService } from './schedule.service';
import { VideoService } from './video.service';

@Controller('doctor')
@UseGuards(JwtAuthGuard, AudienceGuard)
@RequireAudiences('doctor')
export class DoctorAppointmentController {
  constructor(
    private readonly appointments: AppointmentService,
    private readonly schedule: ScheduleService,
    private readonly video: VideoService,
  ) {}

  @Put('me/availability/windows')
  replaceWindows(
    @Body()
    body: {
      timezone?: string;
      windows?: Array<{
        weekday: number;
        start_local: string;
        end_local: string;
        slot_minutes?: number;
        buffer_minutes?: number;
      }>;
    },
    @CurrentPrincipal() principal: Principal,
  ) {
    this.assertDoctor(principal);
    if (!body.timezone) {
      throw Errors.validation('timezone is required');
    }
    return this.schedule.replaceWindows(principal.personId, {
      timezone: body.timezone,
      windows: body.windows ?? [],
    });
  }

  @Post('me/availability/exceptions')
  @HttpCode(200)
  addException(
    @Body() body: { starts_at?: string; ends_at?: string; reason_code?: string },
    @CurrentPrincipal() principal: Principal,
  ) {
    this.assertDoctor(principal);
    if (!body.starts_at || !body.ends_at) {
      throw Errors.validation('starts_at and ends_at are required');
    }
    return this.schedule.addException(principal.personId, {
      starts_at: body.starts_at,
      ends_at: body.ends_at,
      reason_code: body.reason_code,
    });
  }

  @Get('me/availability/windows')
  listWindows(@CurrentPrincipal() principal: Principal) {
    this.assertDoctor(principal);
    return this.schedule.list(principal.personId);
  }

  @Get('appointments')
  list(@CurrentPrincipal() principal: Principal) {
    this.assertDoctor(principal);
    return this.appointments.listForDoctor(principal.personId);
  }

  @Get('appointments/:id')
  get(@Param('id') id: string, @CurrentPrincipal() principal: Principal) {
    this.assertDoctor(principal);
    return this.appointments.get(id, principal);
  }

  @Post('appointments/:id/confirm')
  @HttpCode(200)
  confirm(@Param('id') id: string, @CurrentPrincipal() principal: Principal) {
    this.assertDoctor(principal);
    return this.appointments.confirm(id, principal);
  }

  @Post('appointments/:id/check-in')
  @HttpCode(200)
  checkIn(@Param('id') id: string, @CurrentPrincipal() principal: Principal) {
    this.assertDoctor(principal);
    return this.appointments.checkIn(id, principal);
  }

  @Post('appointments/:id/start')
  @HttpCode(200)
  start(@Param('id') id: string, @CurrentPrincipal() principal: Principal) {
    this.assertDoctor(principal);
    return this.appointments.startConsultation(id, principal);
  }

  @Post('appointments/:id/complete')
  @HttpCode(200)
  complete(
    @Param('id') id: string,
    @Body() body: { patient_summary?: string } = {},
    @CurrentPrincipal() principal: Principal,
  ) {
    this.assertDoctor(principal);
    return this.appointments.complete(id, { ...principal, patientSummary: body.patient_summary });
  }

  @Post('appointments/:id/no-show')
  @HttpCode(200)
  noShow(@Param('id') id: string, @CurrentPrincipal() principal: Principal) {
    this.assertDoctor(principal);
    return this.appointments.markNoShow(id, principal);
  }

  @Post('appointments/:id/cancel')
  @HttpCode(200)
  cancel(
    @Param('id') id: string,
    @Body() body: { reason_code?: string },
    @CurrentPrincipal() principal: Principal,
  ) {
    this.assertDoctor(principal);
    return this.appointments.cancel(id, { ...principal, reasonCode: body.reason_code });
  }

  @Post('appointments/:id/video/join')
  @HttpCode(200)
  joinVideo(
    @Param('id') id: string,
    @CurrentPrincipal() principal: Principal,
    @Headers('x-request-id') requestId?: string,
  ) {
    this.assertDoctor(principal);
    return this.video.join(id, principal, requestId);
  }

  @Post('appointments/:id/video/leave')
  @HttpCode(200)
  leaveVideo(
    @Param('id') id: string,
    @CurrentPrincipal() principal: Principal,
    @Headers('x-request-id') requestId?: string,
  ) {
    this.assertDoctor(principal);
    return this.video.leave(id, principal, requestId);
  }

  @Post('appointments/:id/video/end')
  @HttpCode(200)
  endVideo(
    @Param('id') id: string,
    @CurrentPrincipal() principal: Principal,
    @Headers('x-request-id') requestId?: string,
  ) {
    this.assertDoctor(principal);
    return this.video.end(id, principal, requestId);
  }

  @Get('appointments/:id/video')
  getVideo(@Param('id') id: string, @CurrentPrincipal() principal: Principal) {
    this.assertDoctor(principal);
    return this.video.get(id, principal);
  }

  @Post('appointments/:id/reschedule')
  @HttpCode(200)
  reschedule(
    @Param('id') id: string,
    @Body() body: { starts_at?: string },
    @CurrentPrincipal() principal: Principal,
  ) {
    this.assertDoctor(principal);
    if (!body.starts_at) {
      throw Errors.validation('starts_at is required');
    }
    return this.appointments.reschedule(id, principal, body.starts_at);
  }

  private assertDoctor(principal: Principal) {
    if (principal.audience !== 'doctor' && principal.audience !== 'partner_applicant') {
      throw Errors.forbidden('Doctor session required');
    }
  }
}
