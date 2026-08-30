import { Body, Controller, Get, Headers, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { PermissionsGuard } from '../identity/permissions.guard';
import { RequirePermissions } from '../identity/require-permissions';
import { AdminSupportService } from './admin-support.service';

@Controller('admin/support')
@UseGuards(JwtAuthGuard, AudienceGuard, PermissionsGuard)
export class AdminSupportController {
  constructor(private readonly adminSupport: AdminSupportService) {}

  @Get('queues')
  @RequireAudiences('admin')
  @RequirePermissions('support:read')
  listQueues(@CurrentPrincipal() principal: Principal, @Query('country_code') countryCode?: string) {
    return this.adminSupport.listQueues(principal, countryCode);
  }

  @Get('tickets')
  @RequireAudiences('admin')
  @RequirePermissions('support:read')
  listTickets(
    @CurrentPrincipal() principal: Principal,
    @Query('country_code') countryCode?: string,
    @Query('status') status?: string,
    @Query('queue_id') queueId?: string,
  ) {
    return this.adminSupport.listTickets(principal, {
      country_code: countryCode,
      status,
      queue_id: queueId,
    });
  }

  @Get('tickets/:id')
  @RequireAudiences('admin')
  @RequirePermissions('support:read')
  getTicket(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Query('country_code') countryCode?: string,
  ) {
    return this.adminSupport.getTicket(principal, id, countryCode);
  }

  @Post('tickets/:id/assign')
  @RequireAudiences('admin')
  @RequirePermissions('support:manage')
  assign(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: { assignee_person_id?: string; country_code?: string; idempotency_key?: string },
    @Headers('idempotency-key') idempotencyHeader?: string,
  ) {
    return this.adminSupport.assignTicket(principal, id, {
      ...body,
      idempotency_key: body.idempotency_key ?? idempotencyHeader,
    });
  }

  @Post('tickets/:id/messages')
  @RequireAudiences('admin')
  @RequirePermissions('support:manage')
  addMessage(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body()
    body: { body?: string; visibility?: string; country_code?: string; idempotency_key?: string },
    @Headers('idempotency-key') idempotencyHeader?: string,
  ) {
    return this.adminSupport.addMessage(principal, id, {
      ...body,
      idempotency_key: body.idempotency_key ?? idempotencyHeader,
    });
  }

  @Post('tickets/:id/status')
  @RequireAudiences('admin')
  @RequirePermissions('support:manage')
  setStatus(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: { status?: string; country_code?: string; idempotency_key?: string },
    @Headers('idempotency-key') idempotencyHeader?: string,
  ) {
    return this.adminSupport.setStatus(principal, id, {
      ...body,
      idempotency_key: body.idempotency_key ?? idempotencyHeader,
    });
  }

  @Post('tickets/:id/escalate')
  @RequireAudiences('admin')
  @RequirePermissions('support:manage')
  escalate(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: { queue_id?: string; country_code?: string },
  ) {
    return this.adminSupport.escalate(principal, id, body);
  }
}
