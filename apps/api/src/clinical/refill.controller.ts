import { Body, Controller, Get, Headers, Param, Post, UseGuards } from '@nestjs/common';
import { Errors } from '../common/problem';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { RefillService } from './refill.service';

@Controller()
@UseGuards(JwtAuthGuard, AudienceGuard)
export class CustomerRefillController {
  constructor(private readonly refills: RefillService) {}

  @Get('customer/prescriptions/:id/refill-eligibility')
  @RequireAudiences('customer')
  eligibility(@CurrentPrincipal() principal: Principal, @Param('id') id: string) {
    return this.refills.eligibility(principal, id);
  }

  @Get('customer/refill-requests')
  @RequireAudiences('customer')
  list(@CurrentPrincipal() principal: Principal) {
    return this.refills.listCustomerRequests(principal);
  }

  @Post('customer/refill-requests')
  @RequireAudiences('customer')
  request(
    @CurrentPrincipal() principal: Principal,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: { prescription_id?: string },
  ) {
    if (!body?.prescription_id) {
      throw Errors.validation('prescription_id is required');
    }
    return this.refills.requestRefill(
      principal,
      { prescription_id: body.prescription_id },
      idempotencyKey ?? '',
    );
  }

  @Post('customer/refill-requests/:id/cancel')
  @RequireAudiences('customer')
  cancel(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return this.refills.cancelCustomer(principal, id, idempotencyKey ?? '');
  }

  @Get('customer/prescriptions/:id/subscription')
  @RequireAudiences('customer')
  subscription(@CurrentPrincipal() principal: Principal, @Param('id') id: string) {
    return this.refills.getOrCreateSubscriptionView(principal, id);
  }

  @Post('customer/prescriptions/:id/subscription/pause')
  @RequireAudiences('customer')
  pause(@CurrentPrincipal() principal: Principal, @Param('id') id: string) {
    return this.refills.pauseSubscription(principal, id);
  }

  @Post('customer/prescriptions/:id/subscription/cancel')
  @RequireAudiences('customer')
  cancelSub(@CurrentPrincipal() principal: Principal, @Param('id') id: string) {
    return this.refills.cancelSubscription(principal, id);
  }
}

@Controller('doctor/refill-requests')
@UseGuards(JwtAuthGuard, AudienceGuard)
@RequireAudiences('doctor')
export class DoctorRefillController {
  constructor(private readonly refills: RefillService) {}

  @Get()
  pending(@CurrentPrincipal() principal: Principal) {
    return this.refills.listDoctorPending(principal);
  }

  @Post(':id/approve')
  approve(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return this.refills.approve(principal, id, idempotencyKey ?? '');
  }

  @Post(':id/reject')
  reject(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: { reason_code?: string },
  ) {
    return this.refills.reject(principal, id, body?.reason_code, idempotencyKey ?? '');
  }
}

@Controller('admin/refill-requests')
@UseGuards(JwtAuthGuard, AudienceGuard)
@RequireAudiences('admin')
export class AdminRefillController {
  constructor(private readonly refills: RefillService) {}

  @Get()
  list() {
    return this.refills.adminList();
  }
}
