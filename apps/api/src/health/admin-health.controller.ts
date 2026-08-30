import { Body, Controller, Get, Headers, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { PermissionsGuard } from '../identity/permissions.guard';
import { RequirePermissions } from '../identity/require-permissions';
import { AdminHealthService } from './admin-health.service';

@Controller('admin/health')
@UseGuards(JwtAuthGuard, AudienceGuard, PermissionsGuard)
@RequireAudiences('admin')
export class AdminHealthController {
  constructor(private readonly adminHealth: AdminHealthService) {}

  @Get('consent-grants')
  @RequirePermissions('clinical:audit:read')
  listConsentGrants(
    @CurrentPrincipal() principal: Principal,
    @Query('country_id') countryId?: string,
    @Query('status') status?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limitRaw?: string,
  ) {
    const limit = limitRaw ? Number(limitRaw) : undefined;
    return this.adminHealth.listConsentGrants(principal, {
      countryId,
      status,
      cursor,
      limit: Number.isFinite(limit) ? limit : undefined,
    });
  }

  @Get('access-audits')
  @RequirePermissions('clinical:audit:read')
  listAccessAudits(
    @CurrentPrincipal() principal: Principal,
    @Query('country_id') countryId?: string,
    @Query('patient_person_id') patientPersonId?: string,
    @Query('doctor_partner_id') doctorPartnerId?: string,
    @Query('allowed') allowed?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limitRaw?: string,
  ) {
    const limit = limitRaw ? Number(limitRaw) : undefined;
    return this.adminHealth.listAccessAudits(principal, {
      countryId,
      patientPersonId,
      doctorPartnerId,
      allowed,
      cursor,
      limit: Number.isFinite(limit) ? limit : undefined,
    });
  }

  @Get('break-glass')
  @RequirePermissions('security:break_glass')
  listBreakGlass(
    @CurrentPrincipal() principal: Principal,
    @Query('active_only') activeOnly?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limitRaw?: string,
  ) {
    const limit = limitRaw ? Number(limitRaw) : undefined;
    return this.adminHealth.listBreakGlass(principal, {
      activeOnly,
      cursor,
      limit: Number.isFinite(limit) ? limit : undefined,
    });
  }

  @Post('break-glass')
  @RequirePermissions('security:break_glass')
  openBreakGlass(
    @CurrentPrincipal() principal: Principal,
    @Body()
    body: {
      patient_person_id: string;
      doctor_partner_id: string;
      country_id: string;
      reason: string;
      ticket_id?: string;
      ttl_minutes?: number;
      organization_id?: string;
    },
    @Headers('x-request-id') requestId?: string,
  ) {
    return this.adminHealth.openBreakGlass(principal, body, requestId);
  }

  @Post('break-glass/:grantId/review')
  @RequirePermissions('security:break_glass')
  reviewBreakGlass(
    @CurrentPrincipal() principal: Principal,
    @Param('grantId') grantId: string,
    @Body() body: { review_notes?: string },
    @Headers('x-request-id') requestId?: string,
  ) {
    return this.adminHealth.reviewBreakGlass(principal, grantId, body, requestId);
  }
}
