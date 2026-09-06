import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { HealthContentService } from './health-content.service';

/**
 * Customer-facing health content controller - 1mg-style health information
 * Exposes curated health articles, medicine guides, disease information
 */
@Controller('customer/health-content')
@UseGuards(JwtAuthGuard, AudienceGuard)
export class CustomerHealthContentController {
  constructor(private readonly healthContent: HealthContentService) {}

  /**
   * Get health articles and information (1mg-style)
   * Categories: medicines, diseases, lab-tests, wellness, nutrition
   */
  @Get('articles')
  @RequireAudiences('customer')
  async listHealthArticles(
    @CurrentPrincipal() principal: Principal,
    @Query('country_code') countryCode?: string,
    @Query('category') category?: string,
    @Query('search') search?: string,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = limit ? parseInt(limit, 10) : 20;
    return this.healthContent.listHealthArticles(principal, {
      country_code: countryCode,
      category,
      search,
      limit: parsedLimit,
    });
  }

  /**
   * Get health article by slug (1mg-style detailed view)
   */
  @Get('articles/:slug')
  @RequireAudiences('customer')
  async getHealthArticle(
    @CurrentPrincipal() principal: Principal,
    @Param('slug') slug: string,
    @Query('country_code') countryCode?: string,
  ) {
    return this.healthContent.getHealthArticle(principal, slug, countryCode);
  }

  /**
   * Get health categories (1mg-style categories)
   */
  @Get('categories')
  @RequireAudiences('customer')
  async getHealthCategories(@CurrentPrincipal() principal: Principal) {
    return this.healthContent.getHealthCategories();
  }

  /**
   * Search health content (1mg-style search)
   */
  @Get('search')
  @RequireAudiences('customer')
  async searchHealthContent(
    @CurrentPrincipal() principal: Principal,
    @Query('q') query: string,
    @Query('country_code') countryCode?: string,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = limit ? parseInt(limit, 10) : 10;
    return this.healthContent.searchHealthContent(principal, query, countryCode, parsedLimit);
  }

  @Get('featured')
  @RequireAudiences('customer')
  async getFeaturedArticles(
    @CurrentPrincipal() principal: Principal,
    @Query('country_code') countryCode?: string,
  ) {
    return this.healthContent.getFeaturedArticles(principal, countryCode);
  }
}
