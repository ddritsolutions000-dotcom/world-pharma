import { Body, Controller, Get, Headers, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { Errors } from '../common/problem';
import { RxHandoffService } from './rx-handoff.service';

@Controller('customer')
@UseGuards(JwtAuthGuard, AudienceGuard)
@RequireAudiences('customer')
export class CustomerRxHandoffController {
  constructor(private readonly handoff: RxHandoffService) {}

  @Get('prescriptions/:id/commerce-eligibility')
  eligibility(@Param('id') id: string, @CurrentPrincipal() principal: Principal) {
    return this.handoff.eligibilityForPrescription(principal, id);
  }

  @Post('rx-handoff')
  @HttpCode(200)
  start(
    @CurrentPrincipal() principal: Principal,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: { dispensing_case_id?: string; idempotency_key?: string },
  ) {
    if (!body?.dispensing_case_id) {
      throw Errors.validation('dispensing_case_id is required.');
    }
    return this.handoff.startHandoff(
      principal,
      { dispensing_case_id: body.dispensing_case_id },
      idempotencyKey ?? body.idempotency_key ?? '',
    );
  }
}
