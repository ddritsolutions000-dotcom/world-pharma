import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { PrescriptionService } from './prescription.service';

@Controller('customer/prescriptions')
@UseGuards(JwtAuthGuard, AudienceGuard)
@RequireAudiences('customer')
export class CustomerPrescriptionController {
  constructor(private readonly prescriptions: PrescriptionService) {}

  @Get()
  list(@CurrentPrincipal() principal: Principal) {
    return this.prescriptions.listForCustomer(principal);
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentPrincipal() principal: Principal) {
    return this.prescriptions.getForCustomer(principal, id);
  }
}
