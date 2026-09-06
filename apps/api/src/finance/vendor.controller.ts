import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { Errors } from '../common/problem';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { FinanceService } from './finance.service';

@Controller('vendor')
@UseGuards(JwtAuthGuard, AudienceGuard)
@RequireAudiences('customer', 'partner_applicant')
export class FinanceVendorController {
  constructor(private readonly finance: FinanceService) {}

  @Get('payables')
  listPayables(@CurrentPrincipal() principal: Principal, @Query('seller_org_id') sellerOrgId: string) {
    if (!sellerOrgId) {
      throw Errors.validation('seller_org_id is required.');
    }
    return this.finance.listVendorPayables(principal, sellerOrgId);
  }

  @Get('finance/summary')
  summary(@CurrentPrincipal() principal: Principal, @Query('seller_org_id') sellerOrgId: string) {
    if (!sellerOrgId) {
      throw Errors.validation('seller_org_id is required.');
    }
    return this.finance.getVendorFinanceSummary(principal, sellerOrgId);
  }
}

@Controller('vendor/settlements')
@UseGuards(JwtAuthGuard, AudienceGuard)
@RequireAudiences('customer', 'partner_applicant')
export class FinanceVendorSettlementsController {
  constructor(private readonly finance: FinanceService) {}

  @Get()
  list(@CurrentPrincipal() principal: Principal, @Query('seller_org_id') sellerOrgId: string) {
    if (!sellerOrgId) {
      throw Errors.validation('seller_org_id is required.');
    }
    return this.finance.listVendorSettlements(principal, sellerOrgId);
  }

  @Get(':id')
  get(@CurrentPrincipal() principal: Principal, @Param('id') id: string) {
    return this.finance.getVendorSettlementLine(principal, id);
  }
}
