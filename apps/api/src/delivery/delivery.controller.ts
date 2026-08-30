import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Errors } from '../common/problem';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { DeliveryService } from './delivery.service';

@Controller('delivery')
@UseGuards(JwtAuthGuard, AudienceGuard)
@RequireAudiences('customer', 'partner_applicant')
export class DeliveryController {
  constructor(private readonly delivery: DeliveryService) {}

  @Post('presence')
  presence(
    @CurrentPrincipal() principal: Principal,
    @Body() body: { online?: boolean; organization_id?: string },
  ) {
    return this.delivery.setPresence(principal, Boolean(body.online), body.organization_id);
  }

  @Get('jobs')
  list(@CurrentPrincipal() principal: Principal) {
    return this.delivery.listJobs(principal);
  }

  @Get('jobs/:id')
  get(@CurrentPrincipal() principal: Principal, @Param('id') id: string) {
    return this.delivery.getJob(principal, id);
  }

  @Post('jobs/:id/accept')
  accept(@CurrentPrincipal() principal: Principal, @Param('id') id: string) {
    return this.delivery.acceptJob(principal, id);
  }

  @Post('jobs/:id/arrive')
  arrive(@CurrentPrincipal() principal: Principal, @Param('id') id: string) {
    return this.delivery.arrive(principal, id);
  }

  @Post('jobs/:id/pickup')
  pickup(@CurrentPrincipal() principal: Principal, @Param('id') id: string) {
    return this.delivery.pickup(principal, id);
  }

  @Post('jobs/:id/deliver')
  deliver(@CurrentPrincipal() principal: Principal, @Param('id') id: string) {
    return this.delivery.deliverSample(principal, id);
  }

  @Post('jobs/:id/pod')
  pod(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: { code?: string },
  ) {
    if (!body.code) {
      throw Errors.validation('code is required.');
    }
    return this.delivery.verifyPod(principal, id, body.code);
  }

  @Post('jobs/:id/fail')
  fail(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: { reason?: string },
  ) {
    return this.delivery.failDelivery(principal, id, body.reason ?? 'failed');
  }

  @Post('jobs/:id/rto')
  rto(@CurrentPrincipal() principal: Principal, @Param('id') id: string) {
    return this.delivery.startRto(principal, id);
  }
}
