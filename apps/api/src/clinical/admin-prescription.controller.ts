import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { Errors } from '../common/problem';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { PermissionsGuard } from '../identity/permissions.guard';
import { RequirePermissions } from '../identity/require-permissions';
import { PrescriptionService } from './prescription.service';

@Controller('admin/prescriptions')
@UseGuards(JwtAuthGuard, AudienceGuard, PermissionsGuard)
@RequireAudiences('admin')
export class AdminPrescriptionController {
  constructor(private readonly prescriptions: PrescriptionService) {}

  @Get()
  @RequirePermissions('prescription:read')
  list(@CurrentPrincipal() principal: Principal) {
    this.assertAdmin(principal);
    return this.prescriptions.listAdmin(principal);
  }

  @Get(':id')
  @RequirePermissions('prescription:read')
  get(@Param('id') id: string, @CurrentPrincipal() principal: Principal) {
    this.assertAdmin(principal);
    return this.prescriptions.getAdmin(principal, id);
  }

  private assertAdmin(principal: Principal) {
    if (principal.audience !== 'admin') {
      throw Errors.forbidden('Admin session required');
    }
  }
}
