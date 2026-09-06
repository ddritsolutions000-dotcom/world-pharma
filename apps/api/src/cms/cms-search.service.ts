import { Injectable } from '@nestjs/common';
import { CmsContentType } from '@prisma/client';
import { SITE_CHROME_SLUGS } from '@world-pharma/shared/site-chrome';
import { uuidv7 } from '@world-pharma/shared';
import { PrismaService } from '../app/prisma.service';
import { Errors } from '../common/problem';

const MAX_QUERY_LEN = 200;
const MAX_RESULTS = 50;

@Injectable()
export class CmsSearchService {
  constructor(private readonly prisma: PrismaService) {}

  async upsertPublishedDocument(input: {
    contentItemId: string;
    countryId: string;
    locale: string;
    slug: string;
    contentType: CmsContentType;
    categorySlug?: string | null;
    title: string;
    body: string;
    publishedAt: Date;
  }) {
    await this.prisma.cmsContentSearchDocument.upsert({
      where: { contentItemId: input.contentItemId },
      create: {
        id: uuidv7(),
        contentItemId: input.contentItemId,
        countryId: input.countryId,
        locale: input.locale,
        slug: input.slug,
        contentType: input.contentType,
        categorySlug: input.categorySlug,
        title: input.title,
        body: input.body,
        published: true,
        publishedAt: input.publishedAt,
      },
      update: {
        locale: input.locale,
        slug: input.slug,
        contentType: input.contentType,
        categorySlug: input.categorySlug,
        title: input.title,
        body: input.body,
        published: true,
        publishedAt: input.publishedAt,
      },
    });
  }

  async unpublishDocument(contentItemId: string) {
    const existing = await this.prisma.cmsContentSearchDocument.findUnique({
      where: { contentItemId },
    });
    if (!existing) {
      return;
    }
    await this.prisma.cmsContentSearchDocument.update({
      where: { contentItemId },
      data: { published: false },
    });
  }

  async search(countryId: string, locale: string, query: string, limit = 20) {
    const q = query.trim();
    if (!q) {
      return [];
    }
    if (q.length > MAX_QUERY_LEN) {
      throw Errors.validation(`Search query must be at most ${MAX_QUERY_LEN} characters`);
    }
    const take = Math.min(Math.max(limit, 1), MAX_RESULTS);
    return this.prisma.cmsContentSearchDocument.findMany({
      where: {
        countryId,
        locale,
        published: true,
        contentType: { not: CmsContentType.PACK_STRING },
        slug: { notIn: [...SITE_CHROME_SLUGS] },
        OR: [
          { title: { contains: q, mode: 'insensitive' } },
          { body: { contains: q, mode: 'insensitive' } },
          { slug: { contains: q, mode: 'insensitive' } },
        ],
      },
      orderBy: [{ title: 'asc' }, { slug: 'asc' }, { id: 'asc' }],
      take,
      select: {
        contentItemId: true,
        slug: true,
        title: true,
        contentType: true,
        categorySlug: true,
        publishedAt: true,
      },
    });
  }

  async listPublishedArticles(
    countryId: string,
    locale: string,
    filters?: { contentType?: CmsContentType; categorySlug?: string },
  ) {
    return this.prisma.cmsContentSearchDocument.findMany({
      where: {
        countryId,
        locale,
        published: true,
        contentType: filters?.contentType,
        categorySlug: filters?.categorySlug,
        slug: { notIn: [...SITE_CHROME_SLUGS] },
        NOT: [{ contentType: CmsContentType.BANNER }, { contentType: CmsContentType.PACK_STRING }],
      },
      orderBy: [{ categorySlug: 'asc' }, { title: 'asc' }, { slug: 'asc' }],
      select: {
        contentItemId: true,
        slug: true,
        title: true,
        contentType: true,
        categorySlug: true,
        publishedAt: true,
      },
    });
  }

  async getPublishedArticle(countryId: string, locale: string, slug: string) {
    const row = await this.prisma.cmsContentSearchDocument.findFirst({
      where: { countryId, locale, slug, published: true },
      include: {
        contentItem: {
          select: {
            title: true,
            summary: true,
            body: true,
            status: true,
            publishedVersion: true,
            updatedAt: true,
            publications: {
              orderBy: { publicationVersion: 'desc' },
              take: 1,
              select: {
                title: true,
                summary: true,
                body: true,
                publicationVersion: true,
                publishedAt: true,
              },
            },
          },
        },
      },
    });
    if (!row) {
      return null;
    }
    const pub = row.contentItem.publications[0];
    const title = pub?.title ?? row.contentItem.title;
    const summary = pub?.summary ?? row.contentItem.summary;
    const body = pub?.body ?? row.contentItem.body;
    return {
      id: row.contentItemId,
      slug: row.slug,
      title,
      summary,
      body,
      content_type: row.contentType,
      category_slug: row.categorySlug,
      locale,
      version: pub?.publicationVersion ?? row.contentItem.publishedVersion,
      published_at: (pub?.publishedAt ?? row.contentItem.updatedAt).toISOString(),
    };
  }

  async listBanners(countryId: string, locale: string) {
    const rows = await this.prisma.cmsContentSearchDocument.findMany({
      where: {
        countryId,
        locale,
        published: true,
        contentType: CmsContentType.BANNER,
      },
      orderBy: [{ title: 'asc' }, { slug: 'asc' }],
      select: {
        contentItemId: true,
        slug: true,
        title: true,
        body: true,
      },
    });
    const ids = rows.map((row) => row.contentItemId);
    const assets = ids.length
      ? await this.prisma.cmsContentAsset.findMany({
          where: { contentItemId: { in: ids } },
          orderBy: { createdAt: 'desc' },
          select: { id: true, contentItemId: true },
        })
      : [];
    const latest = new Map<string, string>();
    for (const asset of assets) {
      if (asset.contentItemId && !latest.has(asset.contentItemId)) {
        latest.set(asset.contentItemId, asset.id);
      }
    }
    return rows.map((row) => ({
      contentItemId: row.contentItemId,
      slug: row.slug,
      title: row.title,
      body: row.body,
      asset_id: latest.get(row.contentItemId) ?? null,
    }));
  }

  async listCategories(countryId: string, locale: string) {
    const rows = await this.prisma.cmsContentSearchDocument.findMany({
      where: {
        countryId,
        locale,
        published: true,
        categorySlug: { not: null },
        NOT: { contentType: CmsContentType.BANNER },
      },
      distinct: ['categorySlug'],
      select: { categorySlug: true },
      orderBy: { categorySlug: 'asc' },
    });
    return rows.map((row) => row.categorySlug).filter(Boolean);
  }
}
