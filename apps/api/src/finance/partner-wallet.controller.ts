import { Body, Controller, Get, HttpCode, Post, Query, UseGuards } from '@nestjs/common';
import { Errors } from '../common/problem';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { PartnerWalletService, type PartnerWalletScope } from './partner-wallet.service';

function parseScope(query: {
  partner_type?: string;
  organization_id?: string;
  lab_org_id?: string;
}): PartnerWalletScope {
  const type = (query.partner_type ?? '').toUpperCase();
  const orgId = query.organization_id || query.lab_org_id;
  if (type === 'LAB') {
    if (!orgId) {
      throw Errors.validation('organization_id (or lab_org_id) is required for LAB wallet');
    }
    return { kind: 'LAB', organizationId: orgId };
  }
  if (type === 'AFFILIATE') {
    return { kind: 'AFFILIATE' };
  }
  if (type === 'DELIVERY' || type === 'DELIVERY_PARTNER') {
    return { kind: 'DELIVERY' };
  }
  if (type === 'DOCTOR') {
    return { kind: 'DOCTOR' };
  }
  throw Errors.validation('partner_type must be LAB, AFFILIATE, DELIVERY, or DOCTOR');
}

@Controller('partner/wallet')
@UseGuards(JwtAuthGuard, AudienceGuard)
@RequireAudiences('customer', 'partner_applicant', 'doctor', 'admin')
export class PartnerWalletController {
  constructor(private readonly wallets: PartnerWalletService) {}

  @Get()
  get(
    @CurrentPrincipal() principal: Principal,
    @Query()
    query: { partner_type?: string; organization_id?: string; lab_org_id?: string },
  ) {
    return this.wallets.getWalletView(principal, parseScope(query));
  }

  @Post('payout-account')
  @HttpCode(200)
  savePayoutAccount(
    @CurrentPrincipal() principal: Principal,
    @Body()
    body: {
      partner_type?: string;
      organization_id?: string;
      lab_org_id?: string;
      method?: 'BANK' | 'UPI';
      account_holder_name?: string;
      bank_name?: string;
      account_number?: string;
      ifsc_or_routing?: string;
      upi_id?: string;
    },
  ) {
    if (!body.account_holder_name) {
      throw Errors.validation('account_holder_name is required');
    }
    return this.wallets.upsertPayoutAccount(principal, parseScope(body), {
      method: body.method,
      account_holder_name: body.account_holder_name,
      bank_name: body.bank_name,
      account_number: body.account_number,
      ifsc_or_routing: body.ifsc_or_routing,
      upi_id: body.upi_id,
    });
  }

  @Post('withdraw')
  @HttpCode(200)
  withdraw(
    @CurrentPrincipal() principal: Principal,
    @Body()
    body: {
      partner_type?: string;
      organization_id?: string;
      lab_org_id?: string;
      amount_minor?: string;
    },
  ) {
    if (!body.amount_minor) {
      throw Errors.validation('amount_minor is required');
    }
    return this.wallets.requestWithdraw(principal, parseScope(body), {
      amount_minor: body.amount_minor,
    });
  }
}
