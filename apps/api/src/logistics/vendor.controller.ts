import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { Errors } from '../common/problem';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { LogisticsService } from './logistics.service';

@Controller('vendor/shipments')
@UseGuards(JwtAuthGuard, AudienceGuard)
@RequireAudiences('customer', 'partner_applicant')
export class LogisticsVendorController {
  constructor(private readonly logistics: LogisticsService) {}

  @Get()
  list(@CurrentPrincipal() principal: Principal, @Query('seller_org_id') sellerOrgId: string) {
    if (!sellerOrgId) {
      throw Errors.validation('seller_org_id is required.');
    }
    return this.logistics.listVendor(principal, sellerOrgId);
  }

  @Get(':id')
  get(@CurrentPrincipal() principal: Principal, @Param('id') id: string) {
    return this.logistics.getVendor(principal, id);
  }
}
