import { Controller, Get, Headers, Param, Query, UseGuards } from '@nestjs/common';
import { HealthArtifactType } from '@prisma/client';
import { Errors } from '../common/problem';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { PolicyResolver } from '../policy/resolver';
import { PrismaService } from '../app/prisma.service';
import { HealthArtifactService } from './health-artifact.service';
import { ARTIFACT_READ_PURPOSES } from '../clinical/consent-scope';

@Controller('health/patients/:patientPersonId')
@UseGuards(JwtAuthGuard, AudienceGuard)
@RequireAudiences('doctor')
export class HealthDoctorController {
  constructor(
    private readonly artifacts: HealthArtifactService,
    private readonly policy: PolicyResolver,
    private readonly prisma: PrismaService,
  ) {}

  @Get('timeline')
  async patientTimeline(
    @CurrentPrincipal() principal: Principal,
    @Param('patientPersonId') patientPersonId: string,
    @Query('country_code') countryCode: string | undefined,
    @Query('purpose') purpose: string | undefined,
    @Query('cursor') cursor: string | undefined,
    @Query('limit') limitRaw: string | undefined,
    @Query('types') typesRaw: string | undefined,
  ) {
    const country = await this.resolveCountry(countryCode);
    await this.assertHealthTimelineEnabled(country.isoAlpha2);
    const resolvedPurpose = this.resolvePurpose(purpose);
    const limit = limitRaw ? Number(limitRaw) : undefined;
    return this.artifacts.getTimelineForDoctor({
      patientPersonId,
      doctorPersonId: principal.personId,
      countryId: country.id,
      countryCode: country.isoAlpha2,
      purpose: resolvedPurpose,
      audience: principal.audience,
      cursor,
      limit: Number.isFinite(limit) ? limit : undefined,
      types: this.parseTypes(typesRaw),
    });
  }

  @Get('artifacts/:id')
  async artifactMetadata(
    @CurrentPrincipal() principal: Principal,
    @Param('patientPersonId') patientPersonId: string,
    @Param('id') id: string,
    @Query('country_code') countryCode: string | undefined,
    @Query('purpose') purpose: string | undefined,
    @Headers('x-request-id') requestId?: string,
  ) {
    const country = await this.resolveCountry(countryCode);
    await this.assertHealthTimelineEnabled(country.isoAlpha2);
    const resolvedPurpose = this.resolvePurpose(purpose);
    return this.artifacts.getMetadataForDoctor({
      artifactId: id,
      patientPersonId,
      doctorPersonId: principal.personId,
      countryId: country.id,
      countryCode: country.isoAlpha2,
      purpose: resolvedPurpose,
      audience: principal.audience,
      requestId,
    });
  }

  @Get('artifacts/:id/payload')
  async artifactPayload(
    @CurrentPrincipal() principal: Principal,
    @Param('patientPersonId') patientPersonId: string,
    @Param('id') id: string,
    @Query('country_code') countryCode: string | undefined,
    @Query('purpose') purpose: string | undefined,
    @Headers('x-request-id') requestId?: string,
  ) {
    const country = await this.resolveCountry(countryCode);
    await this.assertHealthTimelineEnabled(country.isoAlpha2);
    const resolvedPurpose = this.resolvePurpose(purpose);
    return this.artifacts.getPayloadForDoctor({
      artifactId: id,
      patientPersonId,
      doctorPersonId: principal.personId,
      countryId: country.id,
      countryCode: country.isoAlpha2,
      purpose: resolvedPurpose,
      audience: principal.audience,
      requestId,
    });
  }

  private resolvePurpose(purpose: string | undefined) {
    const resolvedPurpose = purpose?.trim();
    if (!resolvedPurpose) {
      throw Errors.validation('purpose is required');
    }
    if (!(ARTIFACT_READ_PURPOSES as readonly string[]).includes(resolvedPurpose)) {
      throw Errors.validation(`purpose must be one of: ${ARTIFACT_READ_PURPOSES.join(', ')}`);
    }
    return resolvedPurpose;
  }

  private async resolveCountry(countryCode: string | undefined) {
    if (!countryCode?.trim()) {
      throw Errors.validation('country_code is required');
    }
    const country = await this.prisma.country.findUnique({
      where: { isoAlpha2: countryCode.trim().toUpperCase() },
    });
    if (!country) {
      throw Errors.notFound('Country not found');
    }
    return country;
  }

  private async assertHealthTimelineEnabled(countryCode: string) {
    const resolved = await this.policy.resolvePublished(countryCode);
    if (!this.policy.isHealthTimelineEnabled(resolved?.document ?? null)) {
      throw Errors.forbidden('Health timeline is not enabled for this country.');
    }
  }

  private parseTypes(raw: string | undefined): HealthArtifactType[] | undefined {
    if (!raw?.trim()) {
      return undefined;
    }
    const values = raw
      .split(',')
      .map((part) => part.trim().toUpperCase())
      .filter(Boolean);
    const allowed = new Set(Object.values(HealthArtifactType));
    const invalid = values.filter((value) => !allowed.has(value as HealthArtifactType));
    if (invalid.length) {
      throw Errors.validation(`Invalid artifact types: ${invalid.join(', ')}`);
    }
    return values as HealthArtifactType[];
  }
}
