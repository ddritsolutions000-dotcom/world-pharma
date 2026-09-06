import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { PermissionsGuard } from '../identity/permissions.guard';
import { RequirePermissions } from '../identity/require-permissions';
import { CorporateWellnessService } from './corporate-wellness.service';

@Controller('admin/corporate-wellness')
@UseGuards(JwtAuthGuard, AudienceGuard, PermissionsGuard)
@RequireAudiences('admin')
export class AdminCorporateWellnessController {
  constructor(private readonly wellness: CorporateWellnessService) {}

  @Get('programs')
  @RequirePermissions('partner:manage')
  programs(@Query('country_code') countryCode?: string) {
    return this.wellness.getCorporatePrograms(null, countryCode);
  }
}
