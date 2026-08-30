import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Errors } from '../common/problem';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { PermissionsGuard } from '../identity/permissions.guard';
import { RequirePermissions } from '../identity/require-permissions';
import { PolicyAdminService } from './admin.service';

@Controller('admin/policy-packs')
@UseGuards(JwtAuthGuard, AudienceGuard, PermissionsGuard)
@RequireAudiences('admin')
export class PolicyAdminController {
  constructor(private readonly admin: PolicyAdminService) {}

  @Get()
  @RequirePermissions('policy:read')
  list(@Query('country') country?: string) {
    if (!country) {
      throw Errors.validation('country query is required');
    }
    return this.admin.list(country);
  }

  @Post()
  @HttpCode(200)
  @RequirePermissions('policy:publish')
  create(
    @Body() body: { country_code?: string; document?: unknown },
    @CurrentPrincipal() principal: Principal,
  ) {
    if (!body.country_code || !body.document) {
      throw Errors.validation('country_code and document are required');
    }
    return this.admin.createDraft(body.country_code, body.document, principal.personId);
  }

  @Post(':id/publish')
  @HttpCode(200)
  @RequirePermissions('policy:publish')
  publish(
    @Param('id') id: string,
    @Body() body: { dual_control?: boolean },
    @CurrentPrincipal() principal: Principal,
  ) {
    return this.admin.publish(id, principal.personId, { dualControl: body.dual_control === true });
  }

  @Post(':id/retire')
  @HttpCode(200)
  @RequirePermissions('policy:publish')
  retire(@Param('id') id: string, @CurrentPrincipal() principal: Principal) {
    return this.admin.retire(id, principal.personId);
  }

  @Post('rollback')
  @HttpCode(200)
  @RequirePermissions('policy:publish')
  rollback(
    @Body() body: { country_code?: string },
    @CurrentPrincipal() principal: Principal,
  ) {
    if (!body.country_code) {
      throw Errors.validation('country_code is required');
    }
    return this.admin.rollback(body.country_code, principal.personId);
  }
}
