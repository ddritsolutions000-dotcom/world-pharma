import { Body, Controller, Get, Headers, Param, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { Errors } from '../common/problem';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { ImagingStudyService } from './imaging-study.service';
import { InterpretationService } from './interpretation.service';

const checkInSchema = z.object({
  imaging_org_id: z.string().uuid(),
  imaging_booking_id: z.string().uuid(),
  assignee_person_id: z.string().uuid().optional(),
});

const assignSchema = z.object({
  imaging_org_id: z.string().uuid(),
  assignee_person_id: z.string().uuid(),
});

const completeSchema = z.object({
  imaging_org_id: z.string().uuid(),
  equipment_code: z.string().max(64).optional(),
  modality_code: z.string().max(32).optional(),
});

const failSchema = z.object({
  imaging_org_id: z.string().uuid(),
  failure_code: z.string().min(1).max(64),
});

@Controller('radiology')
@UseGuards(JwtAuthGuard, AudienceGuard)
@RequireAudiences('customer', 'partner_applicant')
export class RadiologyStudiesController {
  constructor(
    private readonly studies: ImagingStudyService,
    private readonly interpretation: InterpretationService,
  ) {}

  @Get('interpretations')
  listInterpretations(@CurrentPrincipal() principal: Principal, @Query('imaging_org_id') imagingOrgId: string) {
    if (!imagingOrgId) {
      throw Errors.validation('imaging_org_id is required');
    }
    return this.interpretation.listOrgInterpretationMetadata(principal, imagingOrgId);
  }

  @Get('studies')
  list(@CurrentPrincipal() principal: Principal, @Query('imaging_org_id') imagingOrgId: string, @Query('status') status?: string) {
    if (!imagingOrgId) {
      throw Errors.validation('imaging_org_id is required');
    }
    return this.studies.listStudies(principal, imagingOrgId, { status });
  }

  @Get('studies/:id')
  get(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Query('imaging_org_id') imagingOrgId: string,
  ) {
    if (!imagingOrgId) {
      throw Errors.validation('imaging_org_id is required');
    }
    return this.studies.getStudy(principal, imagingOrgId, id);
  }

  @Post('check-in')
  checkIn(@CurrentPrincipal() principal: Principal, @Body() body: unknown) {
    const parsed = checkInSchema.safeParse(body);
    if (!parsed.success) {
      throw Errors.validation(parsed.error.message);
    }
    return this.studies.checkIn(principal, parsed.data.imaging_org_id, {
      imaging_booking_id: parsed.data.imaging_booking_id,
      assignee_person_id: parsed.data.assignee_person_id,
    });
  }

  @Post('studies/:id/assign')
  assign(@CurrentPrincipal() principal: Principal, @Param('id') id: string, @Body() body: unknown) {
    const parsed = assignSchema.safeParse(body);
    if (!parsed.success) {
      throw Errors.validation(parsed.error.message);
    }
    return this.studies.assignTechnician(principal, parsed.data.imaging_org_id, id, parsed.data.assignee_person_id);
  }

  @Post('studies/:id/start')
  start(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Query('imaging_org_id') imagingOrgId: string,
    @Headers('idempotency-key') idempotencyKey: string,
  ) {
    void idempotencyKey;
    if (!imagingOrgId) {
      throw Errors.validation('imaging_org_id is required');
    }
    return this.studies.startAcquisition(principal, imagingOrgId, id);
  }

  @Post('studies/:id/complete')
  complete(@CurrentPrincipal() principal: Principal, @Param('id') id: string, @Body() body: unknown) {
    const parsed = completeSchema.safeParse(body);
    if (!parsed.success) {
      throw Errors.validation(parsed.error.message);
    }
    return this.studies.completeAcquisition(principal, parsed.data.imaging_org_id, id, {
      equipment_code: parsed.data.equipment_code,
      modality_code: parsed.data.modality_code,
    });
  }

  @Post('studies/:id/fail')
  fail(@CurrentPrincipal() principal: Principal, @Param('id') id: string, @Body() body: unknown) {
    const parsed = failSchema.safeParse(body);
    if (!parsed.success) {
      throw Errors.validation(parsed.error.message);
    }
    return this.studies.failAcquisition(principal, parsed.data.imaging_org_id, id, {
      failure_code: parsed.data.failure_code,
    });
  }
}
