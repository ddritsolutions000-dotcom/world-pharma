import { Controller, Get, Headers, Param, Post, Query, UseGuards, Body } from '@nestjs/common';
import { HealthArtifactType } from '@prisma/client';
import { Errors } from '../common/problem';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { PolicyResolver } from '../policy/resolver';
import { PrismaService } from '../app/prisma.service';
import { HealthArtifactService } from './health-artifact.service';
import { HealthDashboardService } from './health-dashboard.service';
import { HealthTimelineService } from './health-timeline.service';
import { HealthUploadService } from './health-upload.service';
import { HEALTH_UPLOAD_ARTIFACT_TYPES } from './health-upload.constants';
import { HealthSubjectService } from './health-subject.service';

@Controller('health')
@UseGuards(JwtAuthGuard, AudienceGuard)
@RequireAudiences('customer')
export class HealthController {
  constructor(
    private readonly timeline: HealthTimelineService,
    private readonly dashboard: HealthDashboardService,
    private readonly artifacts: HealthArtifactService,
    private readonly uploads: HealthUploadService,
    private readonly policy: PolicyResolver,
    private readonly prisma: PrismaService,
    private readonly subjects: HealthSubjectService,
  ) {}

  @Get('dashboard')
  async dashboardSummary(
    @CurrentPrincipal() principal: Principal,
    @Query('country_code') countryCode: string | undefined,
    @Query('family_member_id') familyMemberId?: string,
  ) {
    const country = await this.resolveCountry(countryCode);
    const subject = await this.subjects.resolve(principal, country.isoAlpha2, familyMemberId);
    if (subject.kind === 'family_member') {
      await this.subjects.auditSubjectAccess(principal.personId, subject, 'dashboard_read');
    }
    return this.dashboard.build(principal, country.id, country.isoAlpha2, subject);
  }

  @Get('timeline')
  async listTimeline(
    @CurrentPrincipal() principal: Principal,
    @Query('country_code') countryCode: string | undefined,
    @Query('cursor') cursor: string | undefined,
    @Query('limit') limitRaw: string | undefined,
    @Query('types') typesRaw: string | undefined,
    @Query('family_member_id') familyMemberId?: string,
  ) {
    const country = await this.resolveCountry(countryCode);
    await this.assertHealthTimelineEnabled(country.isoAlpha2);
    const subject = await this.subjects.resolve(principal, country.isoAlpha2, familyMemberId);
    if (subject.kind === 'family_member') {
      await this.subjects.auditSubjectAccess(principal.personId, subject, 'timeline_read');
    }
    const types = this.parseTypes(typesRaw);
    const limit = limitRaw ? Number(limitRaw) : undefined;
    return this.timeline.listForPatient({
      personId: principal.personId,
      countryId: country.id,
      types,
      cursor,
      limit: Number.isFinite(limit) ? limit : undefined,
      subjectFamilyMemberId: subject.familyMemberId,
    });
  }

  @Get('artifacts/:id')
  async artifactMetadata(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Query('country_code') countryCode: string | undefined,
  ) {
    const country = await this.resolveCountry(countryCode);
    await this.assertHealthTimelineEnabled(country.isoAlpha2);
    return this.artifacts.getMetadataForPatient({
      artifactId: id,
      personId: principal.personId,
      countryId: country.id,
    });
  }

  @Get('artifacts/:id/payload')
  async artifactPayload(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Query('country_code') countryCode: string | undefined,
    @Headers('x-request-id') requestId?: string,
  ) {
    const country = await this.resolveCountry(countryCode);
    await this.assertHealthTimelineEnabled(country.isoAlpha2);
    return this.artifacts.getPayloadForPatient({
      artifactId: id,
      personId: principal.personId,
      countryId: country.id,
      countryCode: country.isoAlpha2,
      audience: principal.audience,
      requestId,
    });
  }

  @Post('uploads')
  async uploadDocument(
    @CurrentPrincipal() principal: Principal,
    @Body()
    body: {
      country_code?: string;
      artifact_type?: string;
      title?: string;
      original_name?: string;
      content_type?: string;
      content_base64?: string;
      idempotency_key?: string;
    },
    @Headers('x-request-id') requestId?: string,
  ) {
    const country = await this.resolveCountry(body.country_code);
    await this.assertHealthTimelineEnabled(country.isoAlpha2);
    if (!body.artifact_type?.trim() || !body.content_type?.trim() || !body.content_base64) {
      throw Errors.validation('artifact_type, content_type and content_base64 are required.');
    }
    const artifactType = body.artifact_type.trim().toUpperCase() as HealthArtifactType;
    if (!HEALTH_UPLOAD_ARTIFACT_TYPES.has(artifactType)) {
      throw Errors.validation(`Invalid upload artifact type: ${body.artifact_type}`);
    }
    if (!body.original_name?.trim()) {
      throw Errors.validation('original_name is required.');
    }
    const bytes = Buffer.from(body.content_base64, 'base64');
    return this.uploads.uploadDocument({
      personId: principal.personId,
      countryId: country.id,
      artifactType,
      title: body.title,
      originalName: body.original_name,
      contentType: body.content_type.trim(),
      bytes,
      idempotencyKey: body.idempotency_key,
      requestId,
    });
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
