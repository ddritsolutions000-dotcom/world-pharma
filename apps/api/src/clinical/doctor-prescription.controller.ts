import { Body, Controller, Get, Headers, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { Errors } from '../common/problem';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { PrescriptionService, type PrescriptionLineInput } from './prescription.service';

@Controller('doctor/prescriptions')
@UseGuards(JwtAuthGuard, AudienceGuard)
@RequireAudiences('doctor')
export class DoctorPrescriptionController {
  constructor(private readonly prescriptions: PrescriptionService) {}

  @Get()
  list(@CurrentPrincipal() principal: Principal) {
    return this.prescriptions.listForDoctor(principal);
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentPrincipal() principal: Principal) {
    return this.prescriptions.getForDoctor(principal, id);
  }

  @Post()
  @HttpCode(200)
  create(
    @Body()
    body: {
      encounter_id?: string;
      lines?: PrescriptionLineInput[];
    },
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentPrincipal() principal: Principal,
  ) {
    if (!body.encounter_id) {
      throw Errors.validation('encounter_id is required');
    }
    return this.prescriptions.createDraft(principal, {
      encounter_id: body.encounter_id,
      lines: body.lines ?? [],
      idempotency_key: idempotencyKey ?? '',
    });
  }

  @Post(':id/issue')
  @HttpCode(200)
  issue(
    @Param('id') id: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentPrincipal() principal: Principal,
  ) {
    return this.prescriptions.issue(principal, id, idempotencyKey ?? '');
  }

  @Post(':id/amend')
  @HttpCode(200)
  amend(
    @Param('id') id: string,
    @Body() body: { lines?: PrescriptionLineInput[] },
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentPrincipal() principal: Principal,
  ) {
    return this.prescriptions.amend(principal, id, {
      lines: body.lines ?? [],
      idempotency_key: idempotencyKey ?? '',
    });
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(
    @Param('id') id: string,
    @Body() body: { reason_code?: string },
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentPrincipal() principal: Principal,
  ) {
    return this.prescriptions.cancel(principal, id, idempotencyKey ?? '', body.reason_code);
  }
}
