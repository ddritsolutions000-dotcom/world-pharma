import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { CredentialReviewStatus, PartnerStatus } from '@prisma/client';
import { Errors } from '../common/problem';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { PermissionsGuard } from '../identity/permissions.guard';
import { RequirePermissions } from '../identity/require-permissions';
import { PartnerService } from '../partner/partner.service';
import { DoctorService } from './doctor.service';

@Controller('admin/doctors')
@UseGuards(JwtAuthGuard, AudienceGuard, PermissionsGuard)
@RequireAudiences('admin')
export class DoctorAdminController {
  constructor(
    private readonly doctors: DoctorService,
    private readonly partners: PartnerService,
  ) {}

  @Get()
  @RequirePermissions('doctor:review')
  list(@CurrentPrincipal() principal: Principal) {
    this.assertAdmin(principal);
    return this.doctors.listAdminDoctors();
  }

  @Get(':partnerId')
  @RequirePermissions('doctor:review')
  get(@Param('partnerId') partnerId: string, @CurrentPrincipal() principal: Principal) {
    this.assertAdmin(principal);
    return this.doctors.getAdminDoctor(partnerId);
  }

  @Post(':partnerId/credentials/:credentialId/review')
  @HttpCode(200)
  @RequirePermissions('doctor:review')
  reviewCredential(
    @Param('partnerId') partnerId: string,
    @Param('credentialId') credentialId: string,
    @Body() body: { status?: CredentialReviewStatus; note?: string },
    @CurrentPrincipal() principal: Principal,
  ) {
    this.assertAdmin(principal);
    if (!body.status) {
      throw Errors.validation('status is required');
    }
    return this.doctors.reviewCredential({
      actorId: principal.personId,
      partnerId,
      credentialId,
      status: body.status,
      note: body.note,
    });
  }

  @Post(':partnerId/reviews')
  @HttpCode(200)
  @RequirePermissions('doctor:review')
  note(
    @Param('partnerId') partnerId: string,
    @Body() body: { action?: string; notes?: string; application_id?: string },
    @CurrentPrincipal() principal: Principal,
  ) {
    this.assertAdmin(principal);
    if (!body.action) {
      throw Errors.validation('action is required');
    }
    return this.doctors.addVerificationNote({
      actorId: principal.personId,
      partnerId,
      action: body.action,
      notes: body.notes,
      applicationId: body.application_id,
    });
  }

  @Post('applications/:applicationId/transition')
  @HttpCode(200)
  @RequirePermissions('doctor:review')
  transition(
    @Param('applicationId') applicationId: string,
    @Body() body: { to?: PartnerStatus; reason?: string },
    @CurrentPrincipal() principal: Principal,
  ) {
    this.assertAdmin(principal);
    if (!body.to || !body.reason) {
      throw Errors.validation('to and reason are required');
    }
    return this.partners.transition({
      applicationId,
      to: body.to,
      actorId: principal.personId,
      reason: body.reason,
    });
  }

  private assertAdmin(principal: Principal) {
    if (principal.audience !== 'admin') {
      throw Errors.forbidden('Admin audience is required');
    }
  }
}
