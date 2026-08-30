import { Controller, Get, Param, Query } from '@nestjs/common';
import { PrismaService, runWithTenant } from '../app/prisma.service';
import { Errors } from '../common/problem';
import { workerTenantContext } from '../tenancy/build-tenant-context';
import { resolveCountryByCode } from './cms-country';
import { CmsSearchService } from './cms-search.service';

@Controller('help')
export class HelpCenterController {
  constructor(
    private readonly search: CmsSearchService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('categories')
  async categories(@Query('country_code') countryCode?: string, @Query('locale') locale = 'en') {
    const country = await resolveCountryByCode(this.prisma, countryCode);
    return runWithTenant(workerTenantContext({ countryId: country.id }), async () => ({
      data: await this.search.listCategories(country.id, locale),
    }));
  }

  @Get('articles')
  async articles(
    @Query('country_code') countryCode?: string,
    @Query('locale') locale = 'en',
    @Query('content_type') contentType?: string,
    @Query('category_slug') categorySlug?: string,
  ) {
    const country = await resolveCountryByCode(this.prisma, countryCode);
    return runWithTenant(workerTenantContext({ countryId: country.id }), async () => ({
      data: await this.search.listPublishedArticles(country.id, locale, {
        contentType: contentType?.trim().toUpperCase() as never,
        categorySlug: categorySlug?.trim(),
      }),
    }));
  }

  @Get('articles/:slug')
  async article(
    @Param('slug') slug: string,
    @Query('country_code') countryCode?: string,
    @Query('locale') locale = 'en',
  ) {
    const country = await resolveCountryByCode(this.prisma, countryCode);
    const article = await runWithTenant(workerTenantContext({ countryId: country.id }), () =>
      this.search.getPublishedArticle(country.id, locale, slug),
    );
    if (!article) {
      throw Errors.notFound('Article not found');
    }
    return article;
  }

  @Get('search')
  async searchArticles(
    @Query('country_code') countryCode?: string,
    @Query('locale') locale = 'en',
    @Query('q') query?: string,
    @Query('limit') limitRaw?: string,
  ) {
    const country = await resolveCountryByCode(this.prisma, countryCode);
    const limit = limitRaw ? Number(limitRaw) : undefined;
    return runWithTenant(workerTenantContext({ countryId: country.id }), async () => ({
      data: await this.search.search(country.id, locale, query ?? '', limit),
    }));
  }

  @Get('banners')
  async banners(@Query('country_code') countryCode?: string, @Query('locale') locale = 'en') {
    const country = await resolveCountryByCode(this.prisma, countryCode);
    return runWithTenant(workerTenantContext({ countryId: country.id }), async () => ({
      data: await this.search.listBanners(country.id, locale),
    }));
  }
}
