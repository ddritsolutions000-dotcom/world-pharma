import { Injectable } from '@nestjs/common';
import { CmsContentType } from '@prisma/client';
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
        NOT: { contentType: CmsContentType.BANNER },
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
            summary: true,
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
    if (!row?.contentItem.publications[0]) {
      return null;
    }
    const pub = row.contentItem.publications[0];
    return {
      id: row.contentItemId,
      slug: row.slug,
      title: pub.title,
      summary: pub.summary,
      body: pub.body,
      content_type: row.contentType,
      category_slug: row.categorySlug,
      locale,
      version: pub.publicationVersion,
      published_at: pub.publishedAt.toISOString(),
    };
  }

  async listBanners(countryId: string, locale: string) {
    return this.prisma.cmsContentSearchDocument.findMany({
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
