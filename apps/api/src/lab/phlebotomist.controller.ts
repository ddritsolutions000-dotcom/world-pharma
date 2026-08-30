import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { LabSampleCocStatus } from '@prisma/client';
import { z } from 'zod';
import { Errors } from '../common/problem';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { SampleCollectionService } from './sample-collection.service';

const cocSchema = z
  .object({
    to_status: z.nativeEnum(LabSampleCocStatus),
    action_code: z.string().min(1),
    idempotency_key: z.string().min(8).optional(),
    container_barcode: z.string().min(4).optional(),
    exception_code: z.string().optional(),
    source_kind: z.string().optional(),
    destination_kind: z.string().optional(),
  })
  .strict();

@Controller('phlebotomist')
@UseGuards(JwtAuthGuard, AudienceGuard)
@RequireAudiences('customer')
export class PhlebotomistController {
  constructor(private readonly collections: SampleCollectionService) {}

  @Get('jobs')
  listJobs(@CurrentPrincipal() principal: Principal) {
    return this.collections.listPhlebotomistJobs(principal);
  }

  @Get('jobs/:id')
  getJob(@CurrentPrincipal() principal: Principal, @Param('id') id: string) {
    return this.collections.getPhlebotomistJob(principal, id);
  }

  @Post('jobs/:id/accept')
  accept(@CurrentPrincipal() principal: Principal, @Param('id') id: string) {
    return this.collections.acceptJob(principal, id);
  }

  @Post('jobs/:id/arrive')
  arrive(@CurrentPrincipal() principal: Principal, @Param('id') id: string, @Body() body: unknown) {
    return this.coc(principal, id, LabSampleCocStatus.ARRIVED, body, 'arrived');
  }

  @Post('jobs/:id/verify')
  verify(@CurrentPrincipal() principal: Principal, @Param('id') id: string, @Body() body: unknown) {
    return this.coc(principal, id, LabSampleCocStatus.VERIFIED, body, 'customer_verified');
  }

  @Post('jobs/:id/collect')
  collect(@CurrentPrincipal() principal: Principal, @Param('id') id: string, @Body() body: unknown) {
    return this.coc(principal, id, LabSampleCocStatus.COLLECTED, body, 'specimen_collected');
  }

  @Post('jobs/:id/seal')
  seal(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const parsed = z
      .object({
        container_barcode: z.string().min(4),
        idempotency_key: z.string().min(8).optional(),
      })
      .strict()
      .safeParse(body ?? {});
    if (!parsed.success) {
      throw Errors.validation('container_barcode is required to seal specimen.');
    }
    return this.collections.cocTransition(principal, id, LabSampleCocStatus.SEALED, {
      actionCode: 'specimen_sealed',
      containerBarcode: parsed.data.container_barcode,
      idempotencyKey: parsed.data.idempotency_key,
      destinationKind: 'SEALED_CONTAINER',
    });
  }

  @Post('jobs/:id/handover')
  handover(@CurrentPrincipal() principal: Principal, @Param('id') id: string, @Body() body: unknown) {
    return this.coc(principal, id, LabSampleCocStatus.HANDED_OVER, body, 'custody_handed_over');
  }

  @Post('jobs/:id/fail')
  fail(@CurrentPrincipal() principal: Principal, @Param('id') id: string, @Body() body: unknown) {
    const parsed = z
      .object({
        exception_code: z.enum([
          'REJECTED',
          'DAMAGED',
          'LOST',
          'TEMPERATURE_EXCEPTION',
          'INSUFFICIENT_SAMPLE',
          'WRONG_SAMPLE',
          'RECOLLECTION_REQUIRED',
        ]),
        idempotency_key: z.string().min(8).optional(),
      })
      .strict()
      .safeParse(body ?? {});
    if (!parsed.success) {
      throw Errors.validation('exception_code is required.');
    }
    const map: Record<string, LabSampleCocStatus> = {
      REJECTED: LabSampleCocStatus.REJECTED,
      DAMAGED: LabSampleCocStatus.DAMAGED,
      LOST: LabSampleCocStatus.LOST,
      TEMPERATURE_EXCEPTION: LabSampleCocStatus.TEMPERATURE_EXCEPTION,
      INSUFFICIENT_SAMPLE: LabSampleCocStatus.INSUFFICIENT_SAMPLE,
      WRONG_SAMPLE: LabSampleCocStatus.WRONG_SAMPLE,
      RECOLLECTION_REQUIRED: LabSampleCocStatus.RECOLLECTION_REQUIRED,
    };
    return this.collections.cocTransition(principal, id, map[parsed.data.exception_code]!, {
      actionCode: 'collection_exception',
      exceptionCode: parsed.data.exception_code,
      idempotencyKey: parsed.data.idempotency_key,
    });
  }

  private coc(
    principal: Principal,
    jobId: string,
    toStatus: LabSampleCocStatus,
    body: unknown,
    defaultAction: string,
  ) {
    const parsed = z
      .object({ idempotency_key: z.string().min(8).optional(), action_code: z.string().optional() })
      .strict()
      .safeParse(body ?? {});
    if (!parsed.success) {
      throw Errors.validation('Invalid collection transition payload.');
    }
    return this.collections.cocTransition(principal, jobId, toStatus, {
      actionCode: parsed.data.action_code ?? defaultAction,
      idempotencyKey: parsed.data.idempotency_key,
    });
  }
}
