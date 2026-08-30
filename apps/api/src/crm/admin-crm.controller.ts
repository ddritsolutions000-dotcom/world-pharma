import { Body, Controller, Get, Headers, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { PermissionsGuard } from '../identity/permissions.guard';
import { RequirePermissions } from '../identity/require-permissions';
import { Customer360Service } from './customer360.service';
import { ConversionEventService } from './conversion-event.service';

@Controller('admin/crm')
@UseGuards(JwtAuthGuard, AudienceGuard, PermissionsGuard)
export class AdminCrmController {
  constructor(
    private readonly customer360: Customer360Service,
    private readonly conversionEvents: ConversionEventService,
  ) {}

  @Get('customers')
  @RequireAudiences('admin')
  @RequirePermissions('crm:read')
  listCustomers(
    @CurrentPrincipal() principal: Principal,
    @Query('country_code') countryCode?: string,
    @Query('q') q?: string,
    @Query('limit') limit?: string,
  ) {
    return this.customer360.searchCustomers(principal, {
      country_code: countryCode ?? '',
      q,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('customers/:personId')
  @RequireAudiences('admin')
  @RequirePermissions('crm:read')
  getCustomer(
    @CurrentPrincipal() principal: Principal,
    @Param('personId') personId: string,
    @Query('country_code') countryCode?: string,
  ) {
    return this.customer360.getCustomer360(principal, personId, countryCode ?? '');
  }

  @Get('customers/:personId/orders')
  @RequireAudiences('admin')
  @RequirePermissions('crm:read')
  getOrders(
    @CurrentPrincipal() principal: Principal,
    @Param('personId') personId: string,
    @Query('country_code') countryCode?: string,
  ) {
    return this.customer360.listCustomerOrders(principal, personId, countryCode ?? '');
  }

  @Get('customers/:personId/tickets')
  @RequireAudiences('admin')
  @RequirePermissions('crm:read')
  getTickets(
    @CurrentPrincipal() principal: Principal,
    @Param('personId') personId: string,
    @Query('country_code') countryCode?: string,
  ) {
    return this.customer360.listCustomerTickets(principal, personId, countryCode ?? '');
  }

  @Post('conversion-events')
  @RequireAudiences('admin')
  @RequirePermissions('crm:write')
  recordConversion(
    @CurrentPrincipal() principal: Principal,
    @Body()
    body: {
      country_code?: string;
      source?: string;
      source_key?: string;
      event_kind?: string;
      person_id?: string;
      order_id?: string;
      session_id?: string;
      occurred_at?: string;
      metadata?: Record<string, unknown>;
    },
    @Headers('idempotency-key') idempotencyHeader?: string,
  ) {
    return this.conversionEvents.record(principal, {
      country_code: body.country_code ?? '',
      source: body.source ?? '',
      source_key: body.source_key ?? idempotencyHeader ?? '',
      event_kind: body.event_kind ?? '',
      person_id: body.person_id,
      order_id: body.order_id,
      session_id: body.session_id,
      occurred_at: body.occurred_at,
      metadata: body.metadata,
      idempotency_key: idempotencyHeader,
    });
  }
}
