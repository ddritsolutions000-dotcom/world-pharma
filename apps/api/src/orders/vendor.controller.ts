import { Controller, Get, Param, Post, Query, Body, UseGuards } from '@nestjs/common';
import { Errors } from '../common/problem';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { OrderService } from './order.service';

@Controller('vendor/orders')
@UseGuards(JwtAuthGuard, AudienceGuard)
@RequireAudiences('customer', 'partner_applicant')
export class OrderVendorController {
  constructor(private readonly orders: OrderService) {}

  @Get()
  list(@CurrentPrincipal() principal: Principal, @Query('seller_org_id') sellerOrgId: string) {
    if (!sellerOrgId) {
      throw Errors.validation('seller_org_id is required.');
    }
    return this.orders.listVendor(principal, sellerOrgId);
  }

  @Get(':id')
  get(@CurrentPrincipal() principal: Principal, @Param('id') id: string) {
    return this.orders.getVendor(principal, id);
  }

  @Post(':id/accept')
  accept(@CurrentPrincipal() principal: Principal, @Param('id') id: string) {
    return this.orders.acceptForVendor(principal, id);
  }

  @Post(':id/reject')
  reject(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    const reason = typeof body['reason'] === 'string' ? body['reason'].trim() : '';
    if (!reason) {
      throw Errors.validation('reason is required.');
    }
    const idempotencyKey =
      typeof body['idempotency_key'] === 'string' && body['idempotency_key'].trim()
        ? body['idempotency_key'].trim()
        : `vendor-reject:${id}:${reason.slice(0, 32)}`;
    return this.orders.rejectForVendor(principal, id, reason, idempotencyKey);
  }

  @Post(':id/pick/start')
  startPick(@CurrentPrincipal() principal: Principal, @Param('id') id: string) {
    return this.orders.startPickForVendor(principal, id);
  }

  @Post(':id/pick/complete')
  completePick(@CurrentPrincipal() principal: Principal, @Param('id') id: string) {
    return this.orders.completePickForVendor(principal, id);
  }

  @Post(':id/pack/start')
  startPack(@CurrentPrincipal() principal: Principal, @Param('id') id: string) {
    return this.orders.startPackForVendor(principal, id);
  }

  @Post(':id/pack/complete')
  completePack(@CurrentPrincipal() principal: Principal, @Param('id') id: string) {
    return this.orders.completePackForVendor(principal, id);
  }

  @Post(':id/ready')
  ready(@CurrentPrincipal() principal: Principal, @Param('id') id: string) {
    return this.orders.markReadyToShipForVendor(principal, id);
  }
}
