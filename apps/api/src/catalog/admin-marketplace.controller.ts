import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { Errors } from '../common/problem';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { PermissionsGuard } from '../identity/permissions.guard';
import { RequirePermissions } from '../identity/require-permissions';
import { MarketplaceEligibilityService } from './marketplace-eligibility.service';

@Controller('admin/marketplace')
@UseGuards(JwtAuthGuard, AudienceGuard, PermissionsGuard)
@RequireAudiences('admin')
export class AdminMarketplaceController {
  constructor(private readonly eligibility: MarketplaceEligibilityService) {}

  @Get('eligibility')
  @RequirePermissions('partner:manage')
  async get(@Query('seller_org_id') sellerOrgId: string) {
    if (!sellerOrgId) {
      throw Errors.validation('seller_org_id is required.');
    }
    return this.eligibility.evaluate(sellerOrgId);
  }

  @Post('acceptance')
  @RequirePermissions('partner:manage')
  async acceptance(
    @CurrentPrincipal() principal: Principal,
    @Body() body: { seller_org_id?: string; action?: 'accept' | 'block' | 'reset'; reason?: string },
  ) {
    const sellerOrgId = String(body.seller_org_id ?? '');
    const action = body.action;
    if (!sellerOrgId) {
      throw Errors.validation('seller_org_id is required.');
    }
    if (action !== 'accept' && action !== 'block' && action !== 'reset') {
      throw Errors.validation('action must be accept, block, or reset.');
    }
    return this.eligibility.setAcceptance(principal.personId, sellerOrgId, action, body.reason);
  }
}
