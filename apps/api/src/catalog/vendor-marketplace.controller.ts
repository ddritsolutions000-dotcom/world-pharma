import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { Errors } from '../common/problem';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { assertVendorSellerAccess } from './access';
import { MarketplaceEligibilityService } from './marketplace-eligibility.service';
import { PrismaService } from '../app/prisma.service';

@Controller('vendor/marketplace')
@UseGuards(JwtAuthGuard, AudienceGuard)
@RequireAudiences('customer', 'partner_applicant')
export class VendorMarketplaceController {
  constructor(
    private readonly marketplace: MarketplaceEligibilityService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('eligibility')
  async eligibility(@CurrentPrincipal() principal: Principal, @Query('seller_org_id') sellerOrgId: string) {
    if (!sellerOrgId) {
      throw Errors.validation('seller_org_id is required.');
    }
    await assertVendorSellerAccess(this.prisma, principal, sellerOrgId);
    return this.marketplace.evaluate(sellerOrgId);
  }

  @Post('attest')
  async attest(
    @CurrentPrincipal() principal: Principal,
    @Body() body: { seller_org_id?: string; attestation_code?: string },
  ) {
    const sellerOrgId = String(body.seller_org_id ?? '');
    const code = String(body.attestation_code ?? '');
    if (!sellerOrgId) {
      throw Errors.validation('seller_org_id is required.');
    }
    return this.marketplace.attest(principal, sellerOrgId, code);
  }

  @Get('activity')
  async activity(@CurrentPrincipal() principal: Principal, @Query('seller_org_id') sellerOrgId: string) {
    if (!sellerOrgId) {
      throw Errors.validation('seller_org_id is required.');
    }
    return this.marketplace.listSellerActivity(principal, sellerOrgId);
  }
}
