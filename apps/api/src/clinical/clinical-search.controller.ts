import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { PermissionsGuard } from '../identity/permissions.guard';
import { RequirePermissions } from '../identity/require-permissions';
import { Errors } from '../common/problem';
import { isArtifactReadPurpose } from '../clinical/consent-scope';
import { ClinicalSearchService } from './clinical-search.service';

const querySchema = z
  .object({
    country_code: z.string().min(2).max(2),
    patient_person_id: z.string().uuid(),
    q: z.string().min(1).max(120),
    purpose: z.string().min(1),
    limit: z.coerce.number().int().min(1).max(25).optional(),
  })
  .strict();

function parseClinicalSearchQuery(query: unknown) {
  const parsed = querySchema.safeParse(query);
  if (!parsed.success) {
    throw Errors.validation('Invalid clinical search query parameters.');
  }
  if (!isArtifactReadPurpose(parsed.data.purpose)) {
    throw Errors.validation('Unsupported clinical search purpose.');
  }
  return parsed.data;
}

@Controller('clinical/search')
@UseGuards(JwtAuthGuard, AudienceGuard, PermissionsGuard)
export class ClinicalSearchController {
  constructor(private readonly clinicalSearch: ClinicalSearchService) {}

  @Get()
  @RequireAudiences('doctor')
  @RequirePermissions('clinical:search')
  async search(@CurrentPrincipal() principal: Principal, @Query() query: unknown) {
    const input = parseClinicalSearchQuery(query);
    return this.clinicalSearch.search(principal, {
      countryCode: input.country_code.toUpperCase(),
      patientPersonId: input.patient_person_id,
      query: input.q,
      purpose: input.purpose,
      limit: input.limit,
    });
  }
}
