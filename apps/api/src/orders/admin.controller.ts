import { Controller, Get, Headers, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { PermissionsGuard } from '../identity/permissions.guard';
import { RequirePermissions } from '../identity/require-permissions';
import { OrderService } from './order.service';

@Controller('admin/orders')
@UseGuards(JwtAuthGuard, AudienceGuard, PermissionsGuard)
@RequireAudiences('admin')
export class OrderAdminController {
  constructor(private readonly orders: OrderService) {}

  @Get()
  @RequirePermissions('order:read')
  search() {
    return this.orders.adminSearch();
  }

  @Get(':id')
  @RequirePermissions('order:read')
  get(@Param('id') id: string) {
    return this.orders.adminGet(id);
  }

  @Post(':id/cancel')
  @RequirePermissions('order:cancel')
  cancel(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Headers('idempotency-key') idempotencyKey: string,
  ) {
    return this.orders.cancel(principal, id, idempotencyKey, true);
  }

  @Post(':id/pick/start')
  @RequirePermissions('order:fulfill')
  startPick(@CurrentPrincipal() principal: Principal, @Param('id') id: string) {
    return this.orders.startPick(principal, id);
  }

  @Post(':id/pick/complete')
  @RequirePermissions('order:fulfill')
  completePick(@CurrentPrincipal() principal: Principal, @Param('id') id: string) {
    return this.orders.completePick(principal, id);
  }

  @Post(':id/pack/start')
  @RequirePermissions('order:fulfill')
  startPack(@CurrentPrincipal() principal: Principal, @Param('id') id: string) {
    return this.orders.startPack(principal, id);
  }

  @Post(':id/pack/complete')
  @RequirePermissions('order:fulfill')
  completePack(@CurrentPrincipal() principal: Principal, @Param('id') id: string) {
    return this.orders.completePack(principal, id);
  }

  @Post(':id/refund')
  @RequirePermissions('order:admin')
  refund(@CurrentPrincipal() principal: Principal, @Param('id') id: string) {
    return this.orders.requestRefund(principal, id, true);
  }
}
