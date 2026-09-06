import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { PartnerStatus } from '@prisma/client';
import { Errors } from '../common/problem';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { PermissionsGuard } from '../identity/permissions.guard';
import { RequirePermissions } from '../identity/require-permissions';
import { PartnerService } from '../partner/partner.service';
import { LabAdminService } from './lab-admin.service';

@Controller('admin/labs')
@UseGuards(JwtAuthGuard, AudienceGuard, PermissionsGuard)
@RequireAudiences('admin')
export class AdminLabsController {
  constructor(
    private readonly labs: LabAdminService,
    private readonly partners: PartnerService,
  ) {}

  @Get()
  @RequirePermissions('lab:review')
  list(@CurrentPrincipal() principal: Principal) {
    this.assertAdmin(principal);
    return this.labs.listAdminLabs();
  }

  @Get(':partnerId')
  @RequirePermissions('lab:review')
  get(@Param('partnerId') partnerId: string, @CurrentPrincipal() principal: Principal) {
    this.assertAdmin(principal);
    return this.labs.getAdminLab(partnerId);
  }

  @Post('applications/:applicationId/transition')
  @HttpCode(200)
  @RequirePermissions('lab:review')
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

  @Post(':partnerId/reviews')
  @HttpCode(200)
  @RequirePermissions('lab:review')
  note(
    @Param('partnerId') partnerId: string,
    @Body() body: { action?: string; notes?: string },
    @CurrentPrincipal() principal: Principal,
  ) {
    this.assertAdmin(principal);
    if (!body.action) {
      throw Errors.validation('action is required');
    }
    return this.labs.addVerificationNote({
      actorId: principal.personId,
      partnerId,
      action: body.action,
      notes: body.notes,
    });
  }

  private assertAdmin(principal: Principal) {
    if (principal.audience !== 'admin') {
      throw Errors.forbidden('Admin audience is required');
    }
  }
}
