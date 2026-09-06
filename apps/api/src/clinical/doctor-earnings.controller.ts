import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { Errors } from '../common/problem';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { DoctorEarningsService } from './doctor-earnings.service';
import { DoctorWalletService } from './doctor-wallet.service';

@Controller('doctor/earnings')
@UseGuards(JwtAuthGuard, AudienceGuard)
@RequireAudiences('doctor')
export class DoctorEarningsController {
  constructor(
    private readonly earnings: DoctorEarningsService,
    private readonly wallet: DoctorWalletService,
  ) {}

  @Get('summary')
  async summary(@CurrentPrincipal() principal: Principal) {
    this.assertDoctor(principal);
    const wallet = await this.wallet.getWalletView(principal.personId);
    if (wallet) {
      return {
        sandbox: true,
        live_payout: false,
        settlement_enabled: false,
        payout_authority: 'doctor_wallet_self_withdraw',
        wallet_enabled: true,
        self_withdraw_enabled: true,
        message: wallet.message,
        country_code: wallet.country_code,
        currency: wallet.currency,
        completed_consult_count: wallet.ledger.filter((e) => e.kind === 'CONSULT_CREDIT').length,
        unit_fee_minor: wallet.unit_fee_minor,
        platform_fee_bps: wallet.platform_fee_bps,
        gross_minor: wallet.lifetime_earned_minor,
        platform_fee_minor: '0',
        doctor_payable_minor: wallet.available_minor,
        pending_settlement_minor: wallet.held_minor,
        settled_minor: wallet.lifetime_withdrawn_minor,
        settlement_status: 'WALLET_AVAILABLE',
        available_minor: wallet.available_minor,
        held_minor: wallet.held_minor,
        lifetime_earned_minor: wallet.lifetime_earned_minor,
        lifetime_withdrawn_minor: wallet.lifetime_withdrawn_minor,
      };
    }
    return this.earnings.summary(principal.personId);
  }

  @Get('consultations')
  consultations(@CurrentPrincipal() principal: Principal) {
    this.assertDoctor(principal);
    return this.earnings.consultations(principal.personId);
  }

  @Get('wallet')
  async walletView(@CurrentPrincipal() principal: Principal) {
    this.assertDoctor(principal);
    const view = await this.wallet.getWalletView(principal.personId);
    if (!view) {
      throw Errors.forbidden('Active doctor profile required for wallet.');
    }
    return view;
  }

  @Post('payout-account')
  @HttpCode(200)
  savePayoutAccount(
    @CurrentPrincipal() principal: Principal,
    @Body()
    body: {
      method?: 'BANK' | 'UPI';
      account_holder_name?: string;
      bank_name?: string;
      account_number?: string;
      ifsc_or_routing?: string;
      upi_id?: string;
    },
  ) {
    this.assertDoctor(principal);
    if (!body.account_holder_name) {
      throw Errors.validation('account_holder_name is required');
    }
    return this.wallet.upsertPayoutAccount(principal.personId, {
      method: body.method,
      account_holder_name: body.account_holder_name,
      bank_name: body.bank_name,
      account_number: body.account_number,
      ifsc_or_routing: body.ifsc_or_routing,
      upi_id: body.upi_id,
    });
  }

  @Post('wallet/withdraw')
  @HttpCode(200)
  withdraw(
    @CurrentPrincipal() principal: Principal,
    @Body() body: { amount_minor?: string; destination_hint?: string },
  ) {
    this.assertDoctor(principal);
    if (!body.amount_minor) {
      throw Errors.validation('amount_minor is required');
    }
    return this.wallet.requestWithdraw(principal.personId, {
      amount_minor: body.amount_minor,
      destination_hint: body.destination_hint,
    });
  }

  private assertDoctor(principal: Principal) {
    if (principal.audience !== 'doctor' && principal.audience !== 'partner_applicant') {
      throw Errors.forbidden('Doctor session required');
    }
  }
}
