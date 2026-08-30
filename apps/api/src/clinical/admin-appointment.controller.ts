import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { Errors } from '../common/problem';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { PermissionsGuard } from '../identity/permissions.guard';
import { RequirePermissions } from '../identity/require-permissions';
import { AppointmentService } from './appointment.service';

@Controller('admin/appointments')
@UseGuards(JwtAuthGuard, AudienceGuard, PermissionsGuard)
@RequireAudiences('admin')
export class AdminAppointmentController {
  constructor(private readonly appointments: AppointmentService) {}

  @Get()
  @RequirePermissions('appointment:read')
  list(@CurrentPrincipal() principal: Principal) {
    this.assertAdmin(principal);
    return this.appointments.listAdmin();
  }

  @Get(':id')
  @RequirePermissions('appointment:read')
  get(@Param('id') id: string, @CurrentPrincipal() principal: Principal) {
    this.assertAdmin(principal);
    return this.appointments.get(id, principal);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @RequirePermissions('appointment:manage')
  cancel(
    @Param('id') id: string,
    @Body() body: { reason_code?: string },
    @CurrentPrincipal() principal: Principal,
  ) {
    this.assertAdmin(principal);
    return this.appointments.cancel(id, { ...principal, reasonCode: body.reason_code });
  }

  private assertAdmin(principal: Principal) {
    if (principal.audience !== 'admin') {
      throw Errors.forbidden('Admin session required');
    }
  }
}
