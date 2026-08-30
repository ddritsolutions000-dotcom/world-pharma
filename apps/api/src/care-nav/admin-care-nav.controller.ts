import { Body, Controller, Get, Headers, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { PermissionsGuard } from '../identity/permissions.guard';
import { RequirePermissions } from '../identity/require-permissions';
import { AdminCareNavService } from './admin-care-nav.service';
import { CareNavOverrideService } from './care-nav-override.service';

@Controller('admin/care-nav')
@UseGuards(JwtAuthGuard, AudienceGuard, PermissionsGuard)
export class AdminCareNavController {
  constructor(
    private readonly adminCareNav: AdminCareNavService,
    private readonly overrides: CareNavOverrideService,
  ) {}

  @Get('sessions')
  @RequireAudiences('admin')
  @RequirePermissions('care_nav:audit:read')
  listSessions(
    @CurrentPrincipal() principal: Principal,
    @Query('country_id') countryId?: string,
    @Query('status') status?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limitRaw?: string,
  ) {
    const limit = limitRaw ? Number(limitRaw) : undefined;
    return this.adminCareNav.listSessions(principal, {
      countryId,
      status,
      cursor,
      limit: Number.isFinite(limit) ? limit : undefined,
    });
  }

  @Get('sessions/:id')
  @RequireAudiences('admin')
  @RequirePermissions('care_nav:audit:read')
  getSession(@CurrentPrincipal() principal: Principal, @Param('id') sessionId: string) {
    return this.adminCareNav.getSession(principal, sessionId);
  }

  @Post('sessions/:id/override')
  @RequireAudiences('admin', 'doctor')
  @RequirePermissions('care_nav:override')
  applyOverride(
    @CurrentPrincipal() principal: Principal,
    @Param('id') sessionId: string,
    @Body()
    body: {
      action: string;
      reason?: string;
      country_code?: string;
      idempotency_key?: string;
    },
    @Headers('x-request-id') requestId?: string,
  ) {
    return this.overrides.applyOverride(principal, sessionId, body, requestId);
  }
}
