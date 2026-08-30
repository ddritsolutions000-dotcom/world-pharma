import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { SearchIndexJobStatus, SearchIndexKind } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../app/prisma.service';
import { Errors } from '../common/problem';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { PermissionsGuard } from '../identity/permissions.guard';
import { RequirePermissions } from '../identity/require-permissions';
import { SecurityEventsService } from '../identity/security-events.service';
import { SearchIndexJobService } from './search-index-job.service';

const INDEX_KINDS = [
  'catalog',
  'provider_doctors',
  'provider_labs',
  'provider_tests',
  'provider_pharmacies',
  'providers',
  'clinical',
] as const;

const reindexSchema = z
  .object({
    country_code: z.string().min(2).max(2),
    index_kind: z.enum(INDEX_KINDS).default('catalog'),
    item_id: z.string().uuid().optional(),
    profile_id: z.string().uuid().optional(),
    organization_id: z.string().uuid().optional(),
    location_id: z.string().uuid().optional(),
    artifact_id: z.string().uuid().optional(),
    locale: z.string().min(2).max(10).optional(),
    force: z.boolean().optional(),
  })
  .strict();

@Controller('admin/search')
@UseGuards(JwtAuthGuard, AudienceGuard, PermissionsGuard)
export class AdminSearchController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: SearchIndexJobService,
    private readonly securityEvents: SecurityEventsService,
  ) {}

  @Post('reindex')
  @RequireAudiences('admin')
  @RequirePermissions('search:admin')
  async reindex(@CurrentPrincipal() principal: Principal, @Body() body: unknown) {
    const input = reindexSchema.parse(body);
    const country = await this.prisma.country.findUnique({ where: { isoAlpha2: input.country_code } });
    if (!country) {
      throw Errors.notFound('Country not found.');
    }
    const locale = input.locale ?? 'en';
    let result: unknown;
    if (input.index_kind === 'catalog') {
      if (input.item_id) {
        result = await this.jobs.scheduleCatalogReindex({
          countryId: country.id,
          itemId: input.item_id,
          locale,
          force: input.force ?? true,
          sourceType: 'admin_reindex',
        });
      } else {
        result = await this.jobs.backfillCatalog(country.id, locale);
      }
    } else if (input.index_kind === 'providers') {
      result = await this.jobs.backfillProviders(country.id, locale);
    } else if (input.index_kind === 'provider_doctors') {
      if (input.profile_id) {
        result = await this.jobs.scheduleProviderReindex({
          countryId: country.id,
          sourceId: input.profile_id,
          indexKind: SearchIndexKind.PROVIDER_DOCTOR,
          locale,
          force: input.force ?? true,
          sourceType: 'admin_reindex',
        });
      } else {
        result = await this.jobs.backfillProviderDoctors(country.id, locale);
      }
    } else if (input.index_kind === 'provider_labs') {
      if (input.organization_id) {
        result = await this.jobs.scheduleProviderReindex({
          countryId: country.id,
          sourceId: input.organization_id,
          indexKind: SearchIndexKind.PROVIDER_LAB,
          locale,
          force: input.force ?? true,
          sourceType: 'admin_reindex',
        });
      } else {
        result = await this.jobs.backfillProviderLabs(country.id, locale);
      }
    } else if (input.index_kind === 'provider_tests') {
      if (input.item_id) {
        result = await this.jobs.scheduleProviderReindex({
          countryId: country.id,
          sourceId: input.item_id,
          indexKind: SearchIndexKind.PROVIDER_TEST,
          locale,
          force: input.force ?? true,
          sourceType: 'admin_reindex',
        });
      } else {
        result = await this.jobs.backfillProviderTests(country.id, locale);
      }
    } else if (input.index_kind === 'provider_pharmacies') {
      if (input.location_id) {
        result = await this.jobs.scheduleProviderReindex({
          countryId: country.id,
          sourceId: input.location_id,
          indexKind: SearchIndexKind.PROVIDER_PHARMACY,
          locale,
          force: input.force ?? true,
          sourceType: 'admin_reindex',
        });
      } else {
        result = await this.jobs.backfillProviderPharmacies(country.id, locale);
      }
    } else if (input.index_kind === 'clinical') {
      if (!input.artifact_id) {
        throw Errors.validation('artifact_id is required for clinical reindex.');
      }
      result = await this.jobs.scheduleClinicalReindex({
        countryId: country.id,
        artifactId: input.artifact_id,
        force: input.force ?? true,
        sourceType: 'admin_reindex',
      });
    } else {
      throw Errors.validation('Unsupported index kind.');
    }
    await this.securityEvents.emit({
      type: 'SEARCH_REINDEX_REQUESTED',
      outcome: 'success',
      personId: principal.personId,
      metadata: {
        country_id: country.id,
        index_kind: input.index_kind,
        item_id: input.item_id ?? null,
        profile_id: input.profile_id ?? null,
        organization_id: input.organization_id ?? null,
        location_id: input.location_id ?? null,
        artifact_id: input.artifact_id ?? null,
        locale,
      },
    });
    return result;
  }

  @Get('jobs')
  @RequireAudiences('admin')
  @RequirePermissions('search:admin')
  async listJobs(
    @Query('country_code') countryCode?: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
  ) {
    let countryId: string | undefined;
    if (countryCode) {
      const country = await this.prisma.country.findUnique({ where: { isoAlpha2: countryCode } });
      if (!country) {
        throw Errors.notFound('Country not found.');
      }
      countryId = country.id;
    }
    const parsedStatus =
      status && Object.values(SearchIndexJobStatus).includes(status as SearchIndexJobStatus)
        ? (status as SearchIndexJobStatus)
        : undefined;
    const rows = await this.jobs.listJobs({
      countryId,
      status: parsedStatus,
      limit: limit ? Number(limit) : undefined,
    });
    return { data: rows };
  }
}
