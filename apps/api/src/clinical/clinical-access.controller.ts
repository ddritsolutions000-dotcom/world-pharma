import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ClinicalRelationshipKind } from '@prisma/client';
import { Errors } from '../common/problem';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { PermissionsGuard } from '../identity/permissions.guard';
import { RequirePermissions } from '../identity/require-permissions';
import { ClinicalAccessService } from './clinical-access.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class ClinicalAccessController {
  constructor(private readonly access: ClinicalAccessService) {}

  @Post('clinical/access/evaluate')
  @HttpCode(200)
  evaluate(
    @Body() body: { patient_person_id?: string; purpose?: string; country_code?: string },
    @CurrentPrincipal() principal: Principal,
  ) {
    if (!body.patient_person_id || !body.purpose || !body.country_code) {
      throw Errors.validation('patient_person_id, purpose and country_code are required');
    }
    return this.access.evaluate({
      actorId: principal.personId,
      audience: principal.audience,
      patientPersonId: body.patient_person_id,
      purpose: body.purpose,
      countryCode: body.country_code,
    });
  }

  @Post('admin/clinical/relationships')
  @HttpCode(200)
  @UseGuards(PermissionsGuard)
  @RequirePermissions('doctor:review')
  recordRelationship(
    @Body()
    body: {
      patient_person_id?: string;
      doctor_partner_id?: string;
      kind?: ClinicalRelationshipKind;
      organization_id?: string;
    },
    @CurrentPrincipal() principal: Principal,
  ) {
    if (principal.audience !== 'admin') {
      throw Errors.forbidden('Admin audience is required');
    }
    if (!body.patient_person_id || !body.doctor_partner_id || !body.kind) {
      throw Errors.validation('patient_person_id, doctor_partner_id and kind are required');
    }
    return this.access.recordRelationship({
      actorId: principal.personId,
      patientPersonId: body.patient_person_id,
      doctorPartnerId: body.doctor_partner_id,
      kind: body.kind,
      organizationId: body.organization_id,
    });
  }
}
