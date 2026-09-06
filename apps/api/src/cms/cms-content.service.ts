import { Injectable } from '@nestjs/common';
import { CmsContentStatus, CmsContentType, Prisma } from '@prisma/client';
import { uuidv7 } from '@world-pharma/shared';
import { PrismaService, runWithTenant } from '../app/prisma.service';
import { Errors } from '../common/problem';
import { OutboxService } from '../events/outbox.service';
import type { Principal } from '../identity/current-principal';
import { SecurityEventsService } from '../identity/security-events.service';
import { workerTenantContext } from '../tenancy/build-tenant-context';
import { assertUuid, resolveCountryByCode } from './cms-country';
import { CmsAuditService } from './cms-audit.service';
import { CmsSearchService } from './cms-search.service';
import { assertCmsTransition, isEditableCmsStatus } from './cms-status';

@Injectable()
export class CmsContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audits: CmsAuditService,
    private readonly search: CmsSearchService,
    private readonly outbox: OutboxService,
    private readonly securityEvents: SecurityEventsService,
  ) {}

  async listContent(
    principal: Principal,
    query: { country_code?: string; status?: string; content_type?: string; slug?: string },
  ) {
    const country = await resolveCountryByCode(this.prisma, query.country_code);
    return runWithTenant(workerTenantContext({ countryId: country.id, personId: principal.personId }), async () => {
      const where: Prisma.CmsContentItemWhereInput = { countryId: country.id };
      if (query.status?.trim()) {
        const status = query.status.trim().toUpperCase() as CmsContentStatus;
        if (!Object.values(CmsContentStatus).includes(status)) {
          throw Errors.validation(`Invalid CMS status: ${query.status}`);
        }
        where.status = status;
      }
      if (query.content_type?.trim()) {
        const contentType = query.content_type.trim().toUpperCase() as CmsContentType;
        if (!Object.values(CmsContentType).includes(contentType)) {
          throw Errors.validation(`Invalid CMS content type: ${query.content_type}`);
        }
        where.contentType = contentType;
      }
      if (query.slug?.trim()) {
        where.slug = query.slug.trim();
      }
      const rows = await this.prisma.cmsContentItem.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        take: 100,
      });
      return { data: rows.map((row) => this.presentItem(row)) };
    });
  }

  async createContent(
    principal: Principal,
    body: {
      country_code?: string;
      content_type?: string;
      slug?: string;
      locale?: string;
      title?: string;
      summary?: string;
      body?: string;
      category_slug?: string;
      idempotency_key?: string;
    },
  ) {
    const country = await resolveCountryByCode(this.prisma, body.country_code);
    const slug = body.slug?.trim();
    const title = body.title?.trim();
    if (!slug || !title) {
      throw Errors.validation('slug and title are required');
    }
    const contentType = (body.content_type?.trim().toUpperCase() ?? 'ARTICLE') as CmsContentType;
    if (!Object.values(CmsContentType).includes(contentType)) {
      throw Errors.validation(`Invalid content type: ${body.content_type}`);
    }
    const locale = body.locale?.trim() || 'en';

    return runWithTenant(workerTenantContext({ countryId: country.id, personId: principal.personId }), async () => {
      if (body.idempotency_key?.trim()) {
        const existing = await this.prisma.cmsContentAudit.findFirst({
          where: {
            action: 'CMS_CONTENT_CREATED',
            metadata: { path: ['idempotency_key'], equals: body.idempotency_key.trim() },
          },
          orderBy: { createdAt: 'desc' },
        });
        if (existing) {
          const item = await this.prisma.cmsContentItem.findUnique({ where: { id: existing.contentItemId } });
          if (item) {
            return this.presentItem(item);
          }
        }
      }

      const itemId = uuidv7();
      const item = await this.prisma.$transaction(async (tx) => {
        const created = await tx.cmsContentItem.create({
          data: {
            id: itemId,
            countryId: country.id,
            contentType,
            slug,
            locale,
            title,
            summary: body.summary?.trim() ?? '',
            body: body.body?.trim() ?? '',
            categorySlug: body.category_slug?.trim() || null,
            authorPersonId: principal.personId,
            status: CmsContentStatus.DRAFT,
          },
        });
        await tx.cmsContentRevision.create({
          data: {
            id: uuidv7(),
            contentItemId: itemId,
            revisionNumber: 1,
            title,
            summary: created.summary,
            body: created.body,
            createdByPersonId: principal.personId,
          },
        });
        await this.audits.record({
          contentItemId: itemId,
          actorPersonId: principal.personId,
          action: 'CMS_CONTENT_CREATED',
          metadata: { idempotency_key: body.idempotency_key?.trim() ?? null },
        });
        await this.outbox.enqueue(tx, {
          type: 'CMS_CONTENT_CREATED',
          aggregateType: 'cms_content_item',
          aggregateId: itemId,
          producer: 'cms',
          countryId: country.id,
          actorId: principal.personId,
          payload: { content_id: itemId, slug, country_id: country.id },
          occurrenceKey: `CMS_CONTENT_CREATED:${itemId}`,
        });
        return created;
      });

      await this.securityEvents.emit({
        type: 'CMS_CONTENT_CREATED',
        outcome: 'success',
        personId: principal.personId,
        metadata: { content_id: itemId, country_id: country.id },
      });

      return this.presentItem(item);
    });
  }

  async getContent(principal: Principal, contentId: string, countryCode?: string) {
    assertUuid(contentId, 'content id');
    const country = await resolveCountryByCode(this.prisma, countryCode);
    return runWithTenant(workerTenantContext({ countryId: country.id, personId: principal.personId }), async () => {
      const item = await this.prisma.cmsContentItem.findFirst({
        where: { id: contentId, countryId: country.id },
      });
      if (!item) {
        throw Errors.notFound('CMS content not found');
      }
      return this.presentItem(item);
    });
  }

  async updateContent(
    principal: Principal,
    contentId: string,
    body: {
      country_code?: string;
      title?: string;
      summary?: string;
      body?: string;
      category_slug?: string;
      expected_version?: number;
    },
  ) {
    assertUuid(contentId, 'content id');
    const country = await resolveCountryByCode(this.prisma, body.country_code);
    return runWithTenant(workerTenantContext({ countryId: country.id, personId: principal.personId }), async () => {
      const item = await this.prisma.cmsContentItem.findFirst({
        where: { id: contentId, countryId: country.id },
      });
      if (!item) {
        throw Errors.notFound('CMS content not found');
      }
      if (!isEditableCmsStatus(item.status)) {
        throw Errors.conflict('Published or archived content cannot be edited directly');
      }
      if (body.expected_version !== undefined && body.expected_version !== item.version) {
        throw Errors.conflict('Content version conflict');
      }

      const title = body.title?.trim() ?? item.title;
      const summary = body.summary?.trim() ?? item.summary;
      const contentBody = body.body?.trim() ?? item.body;
      const nextRevision = item.version + 1;

      const updated = await this.prisma.$transaction(async (tx) => {
        const row = await tx.cmsContentItem.update({
          where: { id: contentId },
          data: {
            title,
            summary,
            body: contentBody,
            categorySlug: body.category_slug?.trim() ?? item.categorySlug,
            version: { increment: 1 },
          },
        });
        await tx.cmsContentRevision.create({
          data: {
            id: uuidv7(),
            contentItemId: contentId,
            revisionNumber: nextRevision,
            title,
            summary,
            body: contentBody,
            createdByPersonId: principal.personId,
          },
        });
        await this.audits.record({
          contentItemId: contentId,
          actorPersonId: principal.personId,
          action: 'CMS_CONTENT_UPDATED',
          metadata: { revision_number: nextRevision },
        });
        await this.outbox.enqueue(tx, {
          type: 'CMS_CONTENT_UPDATED',
          aggregateType: 'cms_content_item',
          aggregateId: contentId,
          producer: 'cms',
          countryId: country.id,
          actorId: principal.personId,
          payload: { content_id: contentId },
          occurrenceKey: `CMS_CONTENT_UPDATED:${contentId}:${nextRevision}`,
        });
        return row;
      });

      await this.securityEvents.emit({
        type: 'CMS_CONTENT_UPDATED',
        outcome: 'success',
        personId: principal.personId,
        metadata: { content_id: contentId },
      });

      return this.presentItem(updated);
    });
  }

  async submitReview(principal: Principal, contentId: string, countryCode?: string) {
    assertUuid(contentId, 'content id');
    const country = await resolveCountryByCode(this.prisma, countryCode);
    return runWithTenant(workerTenantContext({ countryId: country.id, personId: principal.personId }), async () => {
      const item = await this.prisma.cmsContentItem.findFirst({
        where: { id: contentId, countryId: country.id },
      });
      if (!item) {
        throw Errors.notFound('CMS content not found');
      }
      assertCmsTransition(item.status, CmsContentStatus.IN_REVIEW);
      if (!item.title.trim() || !item.body.trim()) {
        throw Errors.validation('title and body are required before review');
      }

      const updated = await this.prisma.$transaction(async (tx) => {
        const row = await tx.cmsContentItem.update({
          where: { id: contentId },
          data: { status: CmsContentStatus.IN_REVIEW, version: { increment: 1 } },
        });
        await this.audits.record({
          contentItemId: contentId,
          actorPersonId: principal.personId,
          action: 'CMS_CONTENT_SUBMITTED',
        });
        await this.outbox.enqueue(tx, {
          type: 'CMS_CONTENT_SUBMITTED',
          aggregateType: 'cms_content_item',
          aggregateId: contentId,
          producer: 'cms',
          countryId: country.id,
          actorId: principal.personId,
          payload: { content_id: contentId },
          occurrenceKey: `CMS_CONTENT_SUBMITTED:${contentId}:${row.version}`,
        });
        return row;
      });

      await this.securityEvents.emit({
        type: 'CMS_CONTENT_SUBMITTED',
        outcome: 'success',
        personId: principal.personId,
        metadata: { content_id: contentId },
      });

      return this.presentItem(updated);
    });
  }

  async publish(
    principal: Principal,
    contentId: string,
    body: { country_code?: string; idempotency_key?: string },
  ) {
    assertUuid(contentId, 'content id');
    const country = await resolveCountryByCode(this.prisma, body.country_code);
    const idempotencyKey = body.idempotency_key?.trim();

    return runWithTenant(workerTenantContext({ countryId: country.id, personId: principal.personId }), async () => {
      if (idempotencyKey) {
        const prior = await this.prisma.cmsContentPublication.findUnique({
          where: { contentItemId_idempotencyKey: { contentItemId: contentId, idempotencyKey } },
        });
        if (prior) {
          const item = await this.prisma.cmsContentItem.findUnique({ where: { id: contentId } });
          if (item) {
            return this.presentItem(item);
          }
        }
      }

      const item = await this.prisma.cmsContentItem.findFirst({
        where: { id: contentId, countryId: country.id },
      });
      if (!item) {
        throw Errors.notFound('CMS content not found');
      }
      if (item.status === CmsContentStatus.PUBLISHED && idempotencyKey) {
        return this.presentItem(item);
      }
      if (item.status !== CmsContentStatus.IN_REVIEW) {
        throw Errors.conflict('CMS content must be IN_REVIEW before publish. Submit for review first.');
      }
      assertCmsTransition(item.status, CmsContentStatus.PUBLISHED);

      const lastRevision = await this.prisma.cmsContentRevision.findFirst({
        where: { contentItemId: contentId },
        orderBy: { revisionNumber: 'desc' },
        select: { createdByPersonId: true },
      });
      const lastEditorId = lastRevision?.createdByPersonId ?? item.authorPersonId;
      if (lastEditorId === principal.personId) {
        throw Errors.conflict('CMS dual-control: publisher cannot be the same operator who last edited this draft');
      }

      const publicationVersion = item.publishedVersion + 1;
      const now = new Date();

      const updated = await this.prisma.$transaction(async (tx) => {
        const publication = await tx.cmsContentPublication.create({
          data: {
            id: uuidv7(),
            contentItemId: contentId,
            publicationVersion,
            revisionNumber: item.version,
            title: item.title,
            summary: item.summary,
            body: item.body,
            publishedByPersonId: principal.personId,
            idempotencyKey: idempotencyKey ?? null,
            publishedAt: now,
          },
        });
        const row = await tx.cmsContentItem.update({
          where: { id: contentId },
          data: {
            status: CmsContentStatus.PUBLISHED,
            publishedVersion: publicationVersion,
            version: { increment: 1 },
          },
        });
        await this.search.upsertPublishedDocument({
          contentItemId: contentId,
          countryId: country.id,
          locale: item.locale,
          slug: item.slug,
          contentType: item.contentType,
          categorySlug: item.categorySlug,
          title: item.title,
          body: item.body,
          publishedAt: now,
        });
        await this.audits.record({
          contentItemId: contentId,
          actorPersonId: principal.personId,
          action: 'CMS_CONTENT_PUBLISHED',
          metadata: { publication_version: publicationVersion },
        });
        await this.outbox.enqueue(tx, {
          type: 'CMS_CONTENT_PUBLISHED',
          aggregateType: 'cms_content_item',
          aggregateId: contentId,
          producer: 'cms',
          countryId: country.id,
          actorId: principal.personId,
          payload: { content_id: contentId, slug: item.slug, country_id: country.id },
          occurrenceKey: idempotencyKey
            ? `CMS_CONTENT_PUBLISHED:${contentId}:${idempotencyKey}`
            : `CMS_CONTENT_PUBLISHED:${contentId}:${publicationVersion}`,
        });
        return { row, publication };
      });

      await this.securityEvents.emit({
        type: 'CMS_CONTENT_PUBLISHED',
        outcome: 'success',
        personId: principal.personId,
        metadata: { content_id: contentId, publication_version: publicationVersion },
      });

      return this.presentItem(updated.row);
    });
  }

  async revise(principal: Principal, contentId: string, countryCode?: string) {
    assertUuid(contentId, 'content id');
    const country = await resolveCountryByCode(this.prisma, countryCode);
    return runWithTenant(workerTenantContext({ countryId: country.id, personId: principal.personId }), async () => {
      const item = await this.prisma.cmsContentItem.findFirst({
        where: { id: contentId, countryId: country.id },
      });
      if (!item) {
        throw Errors.notFound('CMS content not found');
      }
      if (isEditableCmsStatus(item.status)) {
        return this.presentItem(item);
      }
      assertCmsTransition(item.status, CmsContentStatus.DRAFT);

      const updated = await this.prisma.$transaction(async (tx) => {
        const row = await tx.cmsContentItem.update({
          where: { id: contentId },
          data: { status: CmsContentStatus.DRAFT, version: { increment: 1 } },
        });
        await this.audits.record({
          contentItemId: contentId,
          actorPersonId: principal.personId,
          action: 'CMS_CONTENT_REVISED',
        });
        await this.outbox.enqueue(tx, {
          type: 'CMS_CONTENT_REVISED',
          aggregateType: 'cms_content_item',
          aggregateId: contentId,
          producer: 'cms',
          countryId: country.id,
          actorId: principal.personId,
          payload: { content_id: contentId },
          occurrenceKey: `CMS_CONTENT_REVISED:${contentId}:${row.version}`,
        });
        return row;
      });

      await this.securityEvents.emit({
        type: 'CMS_CONTENT_REVISED',
        outcome: 'success',
        personId: principal.personId,
        metadata: { content_id: contentId },
      });

      return this.presentItem(updated);
    });
  }

  async archive(principal: Principal, contentId: string, countryCode?: string) {
    assertUuid(contentId, 'content id');
    const country = await resolveCountryByCode(this.prisma, countryCode);
    return runWithTenant(workerTenantContext({ countryId: country.id, personId: principal.personId }), async () => {
      const item = await this.prisma.cmsContentItem.findFirst({
        where: { id: contentId, countryId: country.id },
      });
      if (!item) {
        throw Errors.notFound('CMS content not found');
      }
      if (item.status === CmsContentStatus.ARCHIVED) {
        return this.presentItem(item);
      }
      assertCmsTransition(item.status, CmsContentStatus.ARCHIVED);

      const updated = await this.prisma.$transaction(async (tx) => {
        const row = await tx.cmsContentItem.update({
          where: { id: contentId },
          data: { status: CmsContentStatus.ARCHIVED, version: { increment: 1 } },
        });
        await this.search.unpublishDocument(contentId);
        await this.audits.record({
          contentItemId: contentId,
          actorPersonId: principal.personId,
          action: 'CMS_CONTENT_ARCHIVED',
        });
        await this.outbox.enqueue(tx, {
          type: 'CMS_CONTENT_ARCHIVED',
          aggregateType: 'cms_content_item',
          aggregateId: contentId,
          producer: 'cms',
          countryId: country.id,
          actorId: principal.personId,
          payload: { content_id: contentId },
          occurrenceKey: `CMS_CONTENT_ARCHIVED:${contentId}:${row.version}`,
        });
        return row;
      });

      await this.securityEvents.emit({
        type: 'CMS_CONTENT_ARCHIVED',
        outcome: 'success',
        personId: principal.personId,
        metadata: { content_id: contentId },
      });

      return this.presentItem(updated);
    });
  }

  async listVersions(principal: Principal, contentId: string, countryCode?: string) {
    assertUuid(contentId, 'content id');
    const country = await resolveCountryByCode(this.prisma, countryCode);
    return runWithTenant(workerTenantContext({ countryId: country.id, personId: principal.personId }), async () => {
      const item = await this.prisma.cmsContentItem.findFirst({
        where: { id: contentId, countryId: country.id },
      });
      if (!item) {
        throw Errors.notFound('CMS content not found');
      }
      const [revisions, publications] = await Promise.all([
        this.prisma.cmsContentRevision.findMany({
          where: { contentItemId: contentId },
          orderBy: { revisionNumber: 'desc' },
        }),
        this.prisma.cmsContentPublication.findMany({
          where: { contentItemId: contentId },
          orderBy: { publicationVersion: 'desc' },
        }),
      ]);
      return {
        revisions: revisions.map((row) => ({
          revision_number: row.revisionNumber,
          title: row.title,
          created_at: row.createdAt.toISOString(),
        })),
        publications: publications.map((row) => ({
          publication_version: row.publicationVersion,
          revision_number: row.revisionNumber,
          title: row.title,
          published_at: row.publishedAt.toISOString(),
        })),
      };
    });
  }

  private presentItem(item: {
    id: string;
    countryId: string;
    contentType: CmsContentType;
    slug: string;
    locale: string;
    status: CmsContentStatus;
    categorySlug: string | null;
    title: string;
    summary: string;
    body: string;
    authorPersonId: string;
    publishedVersion: number;
    version: number;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: item.id,
      country_id: item.countryId,
      content_type: item.contentType,
      slug: item.slug,
      locale: item.locale,
      status: item.status,
      category_slug: item.categorySlug,
      title: item.title,
      summary: item.summary,
      body: item.body,
      author_person_id: item.authorPersonId,
      published_version: item.publishedVersion,
      version: item.version,
      created_at: item.createdAt.toISOString(),
      updated_at: item.updatedAt.toISOString(),
    };
  }
}
