import { Controller, Get, Param, Query } from '@nestjs/common';
import { HealthContentService } from './health-content.service';

@Controller('public/health-content')
export class PublicHealthContentController {
  constructor(private readonly healthContent: HealthContentService) {}

  @Get('articles')
  articles(
    @Query('country_code') countryCode?: string,
    @Query('category') category?: string,
    @Query('search') search?: string,
    @Query('limit') limit?: string,
  ) {
    return this.healthContent.listHealthArticles(null, {
      country_code: countryCode,
      category,
      search,
      limit: limit ? parseInt(limit, 10) : 20,
    });
  }

  @Get('featured')
  featured(@Query('country_code') countryCode?: string) {
    return this.healthContent.getFeaturedArticles(null, countryCode);
  }

  @Get('articles/:slug')
  article(@Param('slug') slug: string, @Query('country_code') countryCode?: string) {
    return this.healthContent.getHealthArticle(null, slug, countryCode);
  }
}
