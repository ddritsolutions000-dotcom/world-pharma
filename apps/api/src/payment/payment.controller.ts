import { Body, Controller, Get, Headers, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Errors } from '../common/problem';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { PaymentService } from './payment.service';

@Controller()
export class PaymentController {
  constructor(private readonly payments: PaymentService) {}

  @Get('payments/methods')
  methods(@Query('country') country: string) {
    if (!country) {
      throw Errors.validation('country is required.');
    }
    return this.payments.listMethods(country);
  }

  @Get('me/payments/intents/:id')
  @UseGuards(JwtAuthGuard)
  getIntent(@CurrentPrincipal() principal: Principal, @Param('id') id: string) {
    return this.payments.getIntent(principal, id);
  }

  @Post('me/payments/intents/:id/confirm')
  @UseGuards(JwtAuthGuard)
  confirm(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Headers('idempotency-key') idempotencyKey: string,
  ) {
    return this.payments.confirm(principal, id, idempotencyKey);
  }

  @Post('me/payments/intents/:id/capture')
  @UseGuards(JwtAuthGuard)
  capture(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Headers('idempotency-key') idempotencyKey: string,
  ) {
    return this.payments.capture(principal, id, idempotencyKey);
  }

  @Post('me/payments/intents/:id/refund')
  @UseGuards(JwtAuthGuard)
  refund(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Headers('idempotency-key') idempotencyKey: string,
    @Body() body: { amount_minor?: string },
  ) {
    const amount = body.amount_minor ? BigInt(body.amount_minor) : undefined;
    return this.payments.refund(principal, id, amount, idempotencyKey, false);
  }
}
