import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { Errors } from '../common/problem';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { PermissionsGuard } from '../identity/permissions.guard';
import { RequirePermissions } from '../identity/require-permissions';
import { DeliveryService } from './delivery.service';

@Controller('admin/delivery')
@UseGuards(JwtAuthGuard, AudienceGuard, PermissionsGuard)
@RequireAudiences('admin')
export class DeliveryAdminController {
  constructor(private readonly delivery: DeliveryService) {}

  @Get('jobs')
  @RequirePermissions('logistics:read')
  jobs() {
    return this.delivery.listJobsAdmin();
  }

  @Post('jobs/assign')
  @HttpCode(200)
  @RequirePermissions('logistics:manage')
  assign(
    @CurrentPrincipal() principal: Principal,
    @Body() body: { shipment_id?: string; assignee_id?: string },
  ) {
    if (!body.shipment_id || !body.assignee_id) {
      throw Errors.validation('shipment_id and assignee_id are required.');
    }
    return this.delivery.assignJob(body.shipment_id, body.assignee_id, principal.personId);
  }
}
