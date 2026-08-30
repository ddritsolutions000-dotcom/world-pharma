import { Injectable } from '@nestjs/common';
import { SearchIndexJobStatus, SearchIndexKind } from '@prisma/client';
import { uuidv7 } from '@world-pharma/shared';
import { PrismaService } from '../app/prisma.service';
import { Errors } from '../common/problem';
import { OutboxService } from '../events/outbox.service';
import { CatalogSearchService } from '../catalog/search.service';
import { ProviderSearchService } from './provider-search.service';
import { ClinicalSearchIndexService } from './clinical-search-index.service';

export interface ScheduleCatalogReindexInput {
  countryId: string;
  itemId: string;
  locale?: string;
  idempotencyKey?: string;
  force?: boolean;
  sourceType?: string;
}

export interface ScheduleProviderReindexInput {
  countryId: string;
  sourceId: string;
  indexKind: Exclude<SearchIndexKind, 'CATALOG' | 'CLINICAL'>;
  locale?: string;
  idempotencyKey?: string;
  force?: boolean;
  sourceType?: string;
}

export interface ScheduleClinicalReindexInput {
  countryId: string;
  artifactId: string;
  idempotencyKey?: string;
  force?: boolean;
  sourceType?: string;
}

@Injectable()
export class SearchIndexJobService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalogSearch: CatalogSearchService,
    private readonly providerSearch: ProviderSearchService,
    private readonly clinicalSearchIndex: ClinicalSearchIndexService,
    private readonly outbox: OutboxService,
  ) {}

  catalogIdempotencyKey(itemId: string, countryId: string, locale: string): string {
    return `catalog:${itemId}:${countryId}:${locale}`;
  }

  providerIdempotencyKey(indexKind: SearchIndexKind, sourceId: string, countryId: string, locale: string): string {
    return `${indexKind.toLowerCase()}:${sourceId}:${countryId}:${locale}`;
  }

  clinicalIdempotencyKey(artifactId: string, countryId: string): string {
    return `clinical:${artifactId}:${countryId}`;
  }

  async scheduleClinicalReindex(input: ScheduleClinicalReindexInput) {
    const idempotencyKey =
      input.idempotencyKey ?? this.clinicalIdempotencyKey(input.artifactId, input.countryId);
    return this.scheduleJob({
      countryId: input.countryId,
      sourceId: input.artifactId,
      indexKind: SearchIndexKind.CLINICAL,
      locale: 'en',
      idempotencyKey,
      force: input.force,
      sourceType: input.sourceType ?? 'health_artifact',
    });
  }

  async scheduleCatalogReindex(input: ScheduleCatalogReindexInput) {
    const locale = input.locale ?? 'en';
    const idempotencyKey =
      input.idempotencyKey ?? this.catalogIdempotencyKey(input.itemId, input.countryId, locale);
    return this.scheduleJob({
      countryId: input.countryId,
      sourceId: input.itemId,
      indexKind: SearchIndexKind.CATALOG,
      locale,
      idempotencyKey,
      force: input.force,
      sourceType: input.sourceType ?? 'catalog_item',
    });
  }

  async scheduleProviderReindex(input: ScheduleProviderReindexInput) {
    const locale = input.locale ?? 'en';
    const idempotencyKey =
      input.idempotencyKey ??
      this.providerIdempotencyKey(input.indexKind, input.sourceId, input.countryId, locale);
    return this.scheduleJob({
      countryId: input.countryId,
      sourceId: input.sourceId,
      indexKind: input.indexKind,
      locale,
      idempotencyKey,
      force: input.force,
      sourceType: input.sourceType ?? input.indexKind.toLowerCase(),
    });
  }

  private async scheduleJob(input: {
    countryId: string;
    sourceId: string;
    indexKind: SearchIndexKind;
    locale: string;
    idempotencyKey: string;
    force?: boolean;
    sourceType: string;
  }) {
    const existing = await this.prisma.searchIndexJob.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) {
      if (!input.force && (existing.status === SearchIndexJobStatus.PENDING || existing.status === SearchIndexJobStatus.RUNNING)) {
        return existing;
      }
      if (!input.force && existing.status === SearchIndexJobStatus.SUCCEEDED) {
        return existing;
      }
      if (!input.force && existing.status === SearchIndexJobStatus.FAILED) {
        return this.runJob(existing.id);
      }
      if (input.force) {
        const forcedKey = `${input.idempotencyKey}:force:${Date.now()}`;
        const job = await this.prisma.searchIndexJob.create({
          data: {
            id: uuidv7(),
            countryId: input.countryId,
            indexKind: input.indexKind,
            sourceType: input.sourceType,
            sourceId: input.sourceId,
            locale: input.locale,
            status: SearchIndexJobStatus.PENDING,
            idempotencyKey: forcedKey,
          },
        });
        return this.runJob(job.id);
      }
      return existing;
    }
    const job = await this.prisma.searchIndexJob.create({
      data: {
        id: uuidv7(),
        countryId: input.countryId,
        indexKind: input.indexKind,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        locale: input.locale,
        status: SearchIndexJobStatus.PENDING,
        idempotencyKey: input.idempotencyKey,
      },
    });
    return this.runJob(job.id);
  }

  async enqueueCatalogInvalidation(countryId: string, itemId: string, locale = 'en'): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.outbox.enqueue(tx, {
        type: 'SEARCH_INDEX_INVALIDATE',
        aggregateType: 'CatalogItem',
        aggregateId: itemId,
        producer: 'search',
        countryId,
        payload: { item_id: itemId, country_id: countryId, locale },
        occurrenceKey: `search-inv:${itemId}:${countryId}:${locale}`,
      });
    });
  }

  async runJob(jobId: string) {
    const job = await this.prisma.searchIndexJob.findUnique({ where: { id: jobId } });
    if (!job) {
      throw Errors.notFound('Search index job not found.');
    }
    if (job.status === SearchIndexJobStatus.SUCCEEDED) {
      return job;
    }
    if (job.status === SearchIndexJobStatus.RUNNING) {
      return job;
    }
    await this.prisma.searchIndexJob.update({
      where: { id: jobId },
      data: {
        status: SearchIndexJobStatus.RUNNING,
        startedAt: new Date(),
        attempts: { increment: 1 },
        lastError: null,
      },
    });
    try {
      switch (job.indexKind) {
        case SearchIndexKind.CATALOG:
          await this.catalogSearch.reindexItem(job.sourceId, job.countryId, job.locale);
          break;
        case SearchIndexKind.PROVIDER_DOCTOR:
          await this.providerSearch.reindexDoctor(job.sourceId, job.countryId, job.locale);
          break;
        case SearchIndexKind.PROVIDER_LAB:
          await this.providerSearch.reindexLab(job.sourceId, job.countryId, job.locale);
          break;
        case SearchIndexKind.PROVIDER_TEST:
          await this.providerSearch.reindexTest(job.sourceId, job.countryId, job.locale);
          break;
        case SearchIndexKind.PROVIDER_PHARMACY:
          await this.providerSearch.reindexPharmacy(job.sourceId, job.countryId, job.locale);
          break;
        case SearchIndexKind.CLINICAL:
          await this.clinicalSearchIndex.reindexArtifact(job.sourceId, job.countryId);
          break;
        default:
          throw Errors.validation(`Unsupported search index kind: ${job.indexKind}`);
      }
      return await this.prisma.searchIndexJob.update({
        where: { id: jobId },
        data: {
          status: SearchIndexJobStatus.SUCCEEDED,
          finishedAt: new Date(),
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 500) : 'search_index_failed';
      return await this.prisma.searchIndexJob.update({
        where: { id: jobId },
        data: {
          status: SearchIndexJobStatus.FAILED,
          finishedAt: new Date(),
          lastError: message,
        },
      });
    }
  }

  async backfillCatalog(countryId: string, locale = 'en') {
    const items = await this.prisma.catalogItemCountry.findMany({
      where: { countryId },
      select: { itemId: true },
    });
    const jobs = [];
    for (const row of items) {
      jobs.push(
        await this.scheduleCatalogReindex({
          countryId,
          itemId: row.itemId,
          locale,
          force: true,
          sourceType: 'backfill',
        }),
      );
    }
    return { scheduled: jobs.length };
  }

  async backfillProviders(countryId: string, locale = 'en') {
    return this.providerSearch.backfillAll(countryId, locale);
  }

  backfillProviderDoctors(countryId: string, locale = 'en') {
    return this.providerSearch.backfillDoctors(countryId, locale);
  }

  backfillProviderLabs(countryId: string, locale = 'en') {
    return this.providerSearch.backfillLabs(countryId, locale);
  }

  backfillProviderTests(countryId: string, locale = 'en') {
    return this.providerSearch.backfillTests(countryId, locale);
  }

  backfillProviderPharmacies(countryId: string, locale = 'en') {
    return this.providerSearch.backfillPharmacies(countryId, locale);
  }

  listJobs(input: { countryId?: string; status?: SearchIndexJobStatus; limit?: number }) {
    const take = Math.min(input.limit ?? 50, 100);
    return this.prisma.searchIndexJob.findMany({
      where: {
        ...(input.countryId ? { countryId: input.countryId } : {}),
        ...(input.status ? { status: input.status } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }
}
