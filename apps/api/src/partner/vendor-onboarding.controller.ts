import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Errors } from '../common/problem';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { assertVendorSellerAccess } from '../catalog/access';
import { PrismaService } from '../app/prisma.service';
import { VendorActivationReadinessService } from './vendor-activation-readiness.service';

@Controller('vendor/onboarding')
@UseGuards(JwtAuthGuard, AudienceGuard)
@RequireAudiences('customer', 'partner_applicant')
export class VendorOnboardingController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly readiness: VendorActivationReadinessService,
  ) {}

  @Get('readiness')
  async getReadiness(@CurrentPrincipal() principal: Principal, @Query('seller_org_id') sellerOrgId: string) {
    if (!sellerOrgId) {
      throw Errors.validation('seller_org_id is required.');
    }
    await assertVendorSellerAccess(this.prisma, principal, sellerOrgId);
    const view = await this.readiness.evaluateByOrganizationId(sellerOrgId);
    if (!view) {
      throw Errors.notFound('No vendor onboarding application is linked to this seller organization.');
    }
    return view;
  }
}
