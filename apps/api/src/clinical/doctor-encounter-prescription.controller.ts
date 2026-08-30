import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { PrescriptionService } from './prescription.service';

/** R5-B prescribe chrome — Book 113 §15.2 */
@Controller('doctor/encounters')
@UseGuards(JwtAuthGuard, AudienceGuard)
@RequireAudiences('doctor')
export class DoctorEncounterPrescriptionController {
  constructor(private readonly prescriptions: PrescriptionService) {}

  @Get(':id/prescription-context')
  context(@Param('id') id: string, @CurrentPrincipal() principal: Principal) {
    return this.prescriptions.prescriptionContext(principal, id);
  }
}
