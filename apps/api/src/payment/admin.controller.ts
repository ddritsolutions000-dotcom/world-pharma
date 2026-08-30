import { Body, Controller, Get, Headers, Param, Post, Query, UseGuards } from '@nestjs/common';
import { PaymentIntentStatus, PaymentMethodFamily } from '@prisma/client';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { PermissionsGuard } from '../identity/permissions.guard';
import { RequirePermissions } from '../identity/require-permissions';
import type { WebhookProcessingStatus } from './payment-observability';
import { PaymentService } from './payment.service';

@Controller('admin/payments')
@UseGuards(JwtAuthGuard, AudienceGuard, PermissionsGuard)
@RequireAudiences('admin')
export class PaymentAdminController {
  constructor(private readonly payments: PaymentService) {}

  @Get()
  @RequirePermissions('payment:read')
  search(
    @CurrentPrincipal() principal: Principal,
    @Query('country_code') countryCode?: string,
    @Query('status') status?: PaymentIntentStatus,
    @Query('gateway_code') gatewayCode?: string,
    @Query('order_id') orderId?: string,
    @Query('checkout_session_id') checkoutSessionId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ) {
    return this.payments.adminSearch(principal, {
      country_code: countryCode,
      status,
      gateway_code: gatewayCode,
      order_id: orderId,
      checkout_session_id: checkoutSessionId,
      from,
      to,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('unknown')
  @RequirePermissions('payment:reconcile')
  unknown(@CurrentPrincipal() principal: Principal, @Query('country_code') countryCode?: string) {
    return this.payments.unknownQueue(principal, countryCode);
  }

  @Get('routing-matrix')
  @RequirePermissions('payment:read')
  routingMatrix(
    @CurrentPrincipal() principal: Principal,
    @Query('country_code') countryCode: string,
    @Query('method') method?: PaymentMethodFamily,
    @Query('gateway') gateway?: string,
    @Query('environment') environment?: 'sandbox' | 'production' | 'all',
    @Query('active') active?: string,
  ) {
    return this.payments.adminRoutingMatrix(principal, {
      country_code: countryCode,
      method,
      gateway,
      environment,
      active,
    });
  }

  @Get('webhooks')
  @RequirePermissions('payment:read')
  listWebhooks(
    @CurrentPrincipal() principal: Principal,
    @Query('country_code') countryCode?: string,
    @Query('intent_id') intentId?: string,
    @Query('gateway_code') gatewayCode?: string,
    @Query('processing_status') processingStatus?: WebhookProcessingStatus,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ) {
    return this.payments.adminListWebhooks(principal, {
      country_code: countryCode,
      intent_id: intentId,
      gateway_code: gatewayCode,
      processing_status: processingStatus,
      from,
      to,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('webhooks/:eventId')
  @RequirePermissions('payment:read')
  getWebhook(
    @CurrentPrincipal() principal: Principal,
    @Param('eventId') eventId: string,
    @Query('country_code') countryCode?: string,
  ) {
    return this.payments.adminGetWebhook(principal, eventId, countryCode ?? '');
  }

  @Get(':id/observability')
  @RequirePermissions('payment:read')
  getObservability(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Query('country_code') countryCode?: string,
  ) {
    return this.payments.adminGetObservability(principal, id, countryCode ?? '');
  }

  @Get(':id')
  @RequirePermissions('payment:read')
  get(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Query('country_code') countryCode?: string,
  ) {
    return this.payments.adminGet(principal, id, countryCode);
  }

  @Post(':id/refund')
  @RequirePermissions('payment:refund')
  refund(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Headers('idempotency-key') idempotencyKey: string,
    @Body() body: { amount_minor?: string },
  ) {
    const amount = body.amount_minor ? BigInt(body.amount_minor) : undefined;
    return this.payments.refund(principal, id, amount, idempotencyKey, true);
  }

  @Post(':id/reconcile')
  @RequirePermissions('payment:reconcile')
  reconcile(@Param('id') id: string) {
    return this.payments.reconcile(id);
  }
}
