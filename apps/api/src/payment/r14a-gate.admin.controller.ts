import { Body, Controller, Get, HttpCode, Param, Post, Put, UseGuards } from '@nestjs/common';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { PermissionsGuard } from '../identity/permissions.guard';
import { RequirePermissions } from '../identity/require-permissions';
import { R14AGateService } from './r14a-gate.service';

@Controller('admin/payments/r14a-gates')
@UseGuards(JwtAuthGuard, AudienceGuard, PermissionsGuard)
@RequireAudiences('admin')
export class R14AGateAdminController {
  constructor(private readonly gates: R14AGateService) {}

  @Get()
  @RequirePermissions('payment:read')
  list() {
    return this.gates.list();
  }

  @Get(':gateCode/revisions')
  @RequirePermissions('payment:read')
  revisions(@Param('gateCode') gateCode: string) {
    return this.gates.revisions(gateCode);
  }

  @Put(':gateCode')
  @RequirePermissions('payment:admin')
  upsert(
    @CurrentPrincipal() principal: Principal,
    @Param('gateCode') gateCode: string,
    @Body() body: { value?: string; evidence_ref?: string | null },
  ) {
    return this.gates.upsert(principal, gateCode, body);
  }

  @Post(':gateCode/verify')
  @HttpCode(200)
  @RequirePermissions('payment:admin')
  verify(
    @CurrentPrincipal() principal: Principal,
    @Param('gateCode') gateCode: string,
    @Body() body: { evidence_ref?: string },
  ) {
    return this.gates.verify(principal, gateCode, body);
  }
}
