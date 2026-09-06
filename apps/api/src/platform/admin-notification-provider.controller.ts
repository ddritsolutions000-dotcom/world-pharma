import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { PermissionsGuard } from '../identity/permissions.guard';
import { RequirePermissions } from '../identity/require-permissions';
import { NotificationProviderConfigService } from './notification-provider-config.service';
import type { NotificationProviderPatch } from './notification-provider-config';

@Controller('admin/notifications/providers')
@UseGuards(JwtAuthGuard, AudienceGuard, PermissionsGuard)
@RequireAudiences('admin')
export class AdminNotificationProviderController {
  constructor(private readonly providers: NotificationProviderConfigService) {}

  @Get()
  @RequirePermissions('campaign:read')
  list(@Query('country_code') countryCode?: string) {
    return this.providers.list(countryCode);
  }

  @Get('matrix')
  @RequirePermissions('campaign:read')
  matrix(@Query('country_code') countryCode: string) {
    return this.providers.matrix(countryCode);
  }

  @Post()
  @RequirePermissions('campaign:send')
  create(
    @CurrentPrincipal() principal: Principal,
    @Body()
    body: {
      country_code?: string;
      channel?: string;
      provider_code?: string;
      provider_name?: string;
      role?: string;
    },
  ) {
    return this.providers.create(principal, {
      country_code: String(body.country_code ?? ''),
      channel: String(body.channel ?? ''),
      provider_code: String(body.provider_code ?? ''),
      provider_name: String(body.provider_name ?? ''),
      role: body.role,
    });
  }

  @Patch(':id')
  @RequirePermissions('campaign:send')
  update(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: NotificationProviderPatch,
  ) {
    return this.providers.update(principal, id, body);
  }
}
