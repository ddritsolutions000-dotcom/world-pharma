import { Controller, Get, Header, Param, Query, StreamableFile } from '@nestjs/common';
import { PrismaService, runWithTenant } from '../app/prisma.service';
import { Errors } from '../common/problem';
import { workerTenantContext } from '../tenancy/build-tenant-context';
import { resolveCountryByCode } from './cms-country';
import { CmsAssetService } from './cms-asset.service';
import { helpMediaPath } from './cms-public-media';
import { CmsSearchService } from './cms-search.service';

@Controller('help')
export class HelpCenterController {
  constructor(
    private readonly search: CmsSearchService,
    private readonly prisma: PrismaService,
    private readonly assets: CmsAssetService,
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
    return runWithTenant(workerTenantContext({ countryId: country.id }), async () => {
      const rows = await this.search.listBanners(country.id, locale);
      return {
        data: rows.map((row) => ({
          ...row,
          image_url: row.asset_id ? helpMediaPath(row.asset_id, country.isoAlpha2) : null,
        })),
      };
    });
  }

  @Get('media/:assetId')
  @Header('Cache-Control', 'public, max-age=120')
  async media(@Param('assetId') assetId: string, @Query('country_code') countryCode?: string) {
    const file = await this.assets.servePublished(assetId, countryCode);
    return new StreamableFile(file.bytes, {
      type: file.contentType,
      disposition: 'inline',
    });
  }
}
