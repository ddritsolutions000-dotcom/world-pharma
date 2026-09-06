import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { PermissionsGuard } from '../identity/permissions.guard';
import { RequirePermissions } from '../identity/require-permissions';
import type { ProviderConfigPatch } from './provider-config';
import { ProviderConfigService } from './provider-config.service';

@Controller('admin/payments/providers')
@UseGuards(JwtAuthGuard, AudienceGuard, PermissionsGuard)
@RequireAudiences('admin')
export class ProviderConfigAdminController {
  constructor(private readonly providers: ProviderConfigService) {}

  @Get()
  @RequirePermissions('payment:read')
  list() {
    return this.providers.list();
  }

  @Get(':code/audit')
  @RequirePermissions('payment:read')
  audit(@Param('code') code: string) {
    return this.providers.audit(code);
  }

  @Get(':code')
  @RequirePermissions('payment:read')
  get(@Param('code') code: string) {
    return this.providers.get(code);
  }

  @Put(':code')
  @RequirePermissions('payment:admin')
  update(
    @CurrentPrincipal() principal: Principal,
    @Param('code') code: string,
    @Body() body: ProviderConfigPatch,
  ) {
    return this.providers.update(principal, code, body ?? {});
  }
}
