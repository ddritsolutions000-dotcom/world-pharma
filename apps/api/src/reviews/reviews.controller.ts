import { Body, Controller, Get, Headers, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Errors } from '../common/problem';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { ReviewsService } from './reviews.service';

@Controller('catalog/items/:itemId')
export class ReviewsCatalogController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get('reviews')
  listPublic(@Param('itemId') itemId: string, @Query('country') country?: string) {
    if (!country?.trim()) {
      throw Errors.validation('country query parameter is required');
    }
    return this.reviews.listPublicReviews(itemId, country);
  }

  @Get('questions')
  listPublicQuestions(@Param('itemId') itemId: string, @Query('country') country?: string) {
    if (!country?.trim()) {
      throw Errors.validation('country query parameter is required');
    }
    return this.reviews.listPublicQuestions(itemId, country);
  }

  @Post('reviews')
  @UseGuards(JwtAuthGuard, AudienceGuard)
  @RequireAudiences('customer')
  @HttpCode(201)
  submitReview(
    @CurrentPrincipal() principal: Principal,
    @Param('itemId') itemId: string,
    @Body() body: { country_code?: string; rating?: number; title?: string; body?: string },
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.reviews.submitReview(
      principal,
      itemId,
      {
        country_code: body.country_code ?? '',
        rating: body.rating ?? 0,
        title: body.title,
        body: body.body ?? '',
      },
      idempotencyKey,
    );
  }

  @Post('questions')
  @UseGuards(JwtAuthGuard, AudienceGuard)
  @RequireAudiences('customer')
  @HttpCode(201)
  submitQuestion(
    @CurrentPrincipal() principal: Principal,
    @Param('itemId') itemId: string,
    @Body() body: { country_code?: string; body?: string },
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.reviews.submitQuestion(
      principal,
      itemId,
      { country_code: body.country_code ?? '', body: body.body ?? '' },
      idempotencyKey,
    );
  }
}

@Controller('me/catalog/items/:itemId')
@UseGuards(JwtAuthGuard, AudienceGuard)
@RequireAudiences('customer')
export class ReviewsSelfController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get('review')
  ownReview(
    @CurrentPrincipal() principal: Principal,
    @Param('itemId') itemId: string,
    @Query('country_code') countryCode?: string,
  ) {
    return this.reviews.getOwnReview(principal, itemId, countryCode ?? '');
  }
}
