import { Controller, Get, UseGuards } from '@nestjs/common';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { PermissionsGuard } from '../identity/permissions.guard';
import { RequirePermissions } from '../identity/require-permissions';
import { DispensingService } from './dispensing.service';

@Controller('admin/dispensing-cases')
@UseGuards(JwtAuthGuard, AudienceGuard, PermissionsGuard)
@RequireAudiences('admin')
@RequirePermissions('prescription:read')
export class AdminDispensingController {
  constructor(private readonly dispensing: DispensingService) {}

  @Get()
  list(@CurrentPrincipal() principal: Principal) {
    return this.dispensing.listAdmin(principal);
  }
}
