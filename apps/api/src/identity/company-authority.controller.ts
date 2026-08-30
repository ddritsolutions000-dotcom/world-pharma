import { Body, Controller, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { Errors } from '../common/problem';
import { CurrentPrincipal, type Principal } from './current-principal';
import { JwtAuthGuard } from './jwt.guard';
import { AudienceGuard } from './audience.guard';
import { RequireAudiences } from './require-audiences';
import { PermissionsGuard } from './permissions.guard';
import { RequirePermissions } from './require-permissions';
import { CompanyAuthorityService } from './company-authority.service';

@Controller('admin/company-authority')
@UseGuards(JwtAuthGuard, AudienceGuard, PermissionsGuard)
@RequireAudiences('admin')
export class CompanyAuthorityController {
  constructor(private readonly authority: CompanyAuthorityService) {}

  @Post('memberships')
  @HttpCode(200)
  @RequirePermissions('rbac:grant_company')
  grant(
    @Body()
    body: { target_person_id?: string; role_code?: string; reason?: string },
    @CurrentPrincipal() principal: Principal,
  ) {
    if (!body.target_person_id || !body.role_code || !body.reason) {
      throw Errors.validation('target_person_id, role_code and reason are required');
    }
    return this.authority.requestCompanyMembership({
      actorId: principal.personId,
      targetPersonId: body.target_person_id,
      roleCode: body.role_code,
      reason: body.reason,
    });
  }

  @Post('grants/:id/review')
  @HttpCode(200)
  @RequirePermissions('rbac:grant_company')
  review(
    @Param('id') id: string,
    @Body() body: { approve?: boolean },
    @CurrentPrincipal() principal: Principal,
  ) {
    return this.authority.reviewGrant({
      actorId: principal.personId,
      requestId: id,
      approve: body.approve === true,
    });
  }

  @Post('break-glass')
  @HttpCode(200)
  @RequirePermissions('security:break_glass')
  breakGlass(
    @Body()
    body: { target_person_id?: string; reason?: string; permissions?: string[]; ttl_minutes?: number },
    @CurrentPrincipal() principal: Principal,
  ) {
    if (!body.target_person_id || !body.reason) {
      throw Errors.validation('target_person_id and reason are required');
    }
    return this.authority.openBreakGlass({
      actorId: principal.personId,
      targetPersonId: body.target_person_id,
      reason: body.reason,
      permissions: body.permissions ?? [],
      ttlMinutes: body.ttl_minutes,
    });
  }
}
