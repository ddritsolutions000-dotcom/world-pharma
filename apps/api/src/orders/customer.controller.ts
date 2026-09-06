import { Body, Controller, Get, Headers, Param, Post, UseGuards } from '@nestjs/common';
import { ReturnReason } from '@prisma/client';
import { Errors } from '../common/problem';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { OrderService } from './order.service';
import { ReorderService } from './reorder.service';

@Controller('me/orders')
@UseGuards(JwtAuthGuard, AudienceGuard)
@RequireAudiences('customer')
export class OrderCustomerController {
  constructor(
    private readonly orders: OrderService,
    private readonly reorder: ReorderService,
  ) {}

  @Get()
  list(@CurrentPrincipal() principal: Principal) {
    return this.orders.listMine(principal);
  }

  @Get('buy-again')
  buyAgain(@CurrentPrincipal() principal: Principal) {
    return this.orders.listBuyAgain(principal);
  }

  @Get(':id')
  get(@CurrentPrincipal() principal: Principal, @Param('id') id: string) {
    return this.orders.getMine(principal, id);
  }

  @Get(':id/tracking/live')
  liveTrack(@CurrentPrincipal() principal: Principal, @Param('id') id: string) {
    return this.orders.getMineLiveTracking(principal, id);
  }

  @Post()
  create(
    @CurrentPrincipal() principal: Principal,
    @Headers('idempotency-key') idempotencyKey: string,
    @Body() body: { payment_intent_id?: string },
  ) {
    if (!body?.payment_intent_id) {
      throw Errors.validation('payment_intent_id is required.');
    }
    return this.orders.createFromPayment(principal, body.payment_intent_id, idempotencyKey);
  }

  @Post(':id/cancel')
  cancel(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Headers('idempotency-key') idempotencyKey: string,
  ) {
    return this.orders.cancel(principal, id, idempotencyKey);
  }

  @Get(':id/return-eligibility')
  returnEligibility(@CurrentPrincipal() principal: Principal, @Param('id') id: string) {
    return this.orders.getReturnEligibility(principal, id);
  }

  @Post(':id/returns')
  returns(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body()
    body: {
      reason?: ReturnReason;
      note?: string;
      pickup_slot_start?: string;
      pickup_slot_end?: string;
    },
  ) {
    if (!body?.reason) {
      throw Errors.validation('reason is required.');
    }
    return this.orders.requestReturn(principal, id, body.reason, body.note, {
      slot_start: body.pickup_slot_start,
      slot_end: body.pickup_slot_end,
    });
  }

  @Post(':id/refund')
  refund(@CurrentPrincipal() principal: Principal, @Param('id') id: string) {
    return this.orders.requestRefund(principal, id);
  }

  @Post(':id/reorder')
  reorderOrder(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Headers('idempotency-key') idempotencyKey: string,
    @Body() body: { country_code?: string; postal_code?: string },
  ) {
    if (!body?.country_code) {
      throw Errors.validation('country_code is required.');
    }
    return this.reorder.reorderFromOrder(
      principal,
      id,
      { country_code: body.country_code, postal_code: body.postal_code },
      idempotencyKey,
    );
  }
}
