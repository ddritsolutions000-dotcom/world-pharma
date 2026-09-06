import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Errors } from '../common/problem';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { OrderService } from './order.service';

@Controller('vendor/returns')
@UseGuards(JwtAuthGuard, AudienceGuard)
@RequireAudiences('customer', 'partner_applicant')
export class OrderVendorReturnsController {
  constructor(private readonly orders: OrderService) {}

  @Get()
  list(
    @CurrentPrincipal() principal: Principal,
    @Query('seller_org_id') sellerOrgId: string,
    @Query('status') status?: string,
  ) {
    if (!sellerOrgId) {
      throw Errors.validation('seller_org_id is required.');
    }
    return this.orders.listReturnsForVendor(principal, sellerOrgId, status?.trim() || undefined);
  }

  @Post(':orderId/:returnId/approve')
  approve(
    @CurrentPrincipal() principal: Principal,
    @Param('orderId') orderId: string,
    @Param('returnId') returnId: string,
  ) {
    return this.orders.approveReturnForVendor(principal, orderId, returnId);
  }

  @Post(':orderId/:returnId/receive')
  receive(
    @CurrentPrincipal() principal: Principal,
    @Param('orderId') orderId: string,
    @Param('returnId') returnId: string,
  ) {
    return this.orders.receiveReturnForVendor(principal, orderId, returnId);
  }

  @Post(':orderId/:returnId/reject')
  reject(
    @CurrentPrincipal() principal: Principal,
    @Param('orderId') orderId: string,
    @Param('returnId') returnId: string,
    @Body() body: Record<string, unknown>,
  ) {
    const reason = typeof body['reason'] === 'string' ? body['reason'].trim() : '';
    if (!reason) {
      throw Errors.validation('reason is required.');
    }
    return this.orders.rejectReturnForVendor(principal, orderId, returnId, reason);
  }
}
