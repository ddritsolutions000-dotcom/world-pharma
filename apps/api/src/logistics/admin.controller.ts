import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { PermissionsGuard } from '../identity/permissions.guard';
import { RequirePermissions } from '../identity/require-permissions';
import type { MockBookingScenario } from './carrier.port';
import { LogisticsService } from './logistics.service';

@Controller('admin/shipments')
@UseGuards(JwtAuthGuard, AudienceGuard, PermissionsGuard)
@RequireAudiences('admin')
export class LogisticsAdminController {
  constructor(private readonly logistics: LogisticsService) {}

  @Get()
  @RequirePermissions('logistics:read')
  search() {
    return this.logistics.adminSearch();
  }

  @Post(':id/book')
  @RequirePermissions('logistics:manage')
  book(@Param('id') id: string, @Body() body: { scenario?: MockBookingScenario }) {
    return this.logistics.requestBooking(id, body.scenario ?? 'BOOK_SUCCESS');
  }

  @Post(':id/reconcile')
  @RequirePermissions('logistics:reconcile')
  recon(@Param('id') id: string) {
    return this.logistics.reconcile(id);
  }

  @Post(':id/rto')
  @RequirePermissions('logistics:manage')
  rto(@Param('id') id: string) {
    return this.logistics.markRto(id);
  }

  @Post(':id/otp')
  @RequirePermissions('logistics:manage')
  otp(@Param('id') id: string) {
    return this.logistics.createOtp(id);
  }

  @Post(':id/otp/verify')
  @RequirePermissions('logistics:manage')
  verify(@Param('id') id: string, @Body() body: { code?: string }) {
    return this.logistics.verifyOtp(id, body.code ?? '');
  }

  @Post(':id/partner-job')
  @RequirePermissions('logistics:read')
  job(@CurrentPrincipal() principal: Principal, @Param('id') id: string) {
    return this.logistics.partnerJob(principal, id);
  }
}
