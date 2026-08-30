import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { PermissionsGuard } from '../identity/permissions.guard';
import { RequirePermissions } from '../identity/require-permissions';
import { ReviewsService } from './reviews.service';

@Controller('admin/reviews')
@UseGuards(JwtAuthGuard, AudienceGuard, PermissionsGuard)
@RequireAudiences('admin')
export class AdminReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get('moderation')
  @RequirePermissions('review:moderate')
  listReviews(
    @CurrentPrincipal() principal: Principal,
    @Query('country_code') countryCode?: string,
    @Query('status') status?: string,
  ) {
    return this.reviews.listModerationReviews(principal, countryCode ?? '', status);
  }

  @Patch(':id')
  @RequirePermissions('review:moderate')
  moderateReview(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body()
    body: {
      country_code?: string;
      status?: string;
      version?: number;
      response_body?: string;
    },
  ) {
    return this.reviews.moderateReview(principal, id, {
      country_code: body.country_code ?? '',
      status: body.status ?? '',
      version: body.version ?? 0,
      response_body: body.response_body,
    });
  }
}

@Controller('admin/questions')
@UseGuards(JwtAuthGuard, AudienceGuard, PermissionsGuard)
@RequireAudiences('admin')
export class AdminQuestionsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get('moderation')
  @RequirePermissions('review:moderate')
  listQuestions(
    @CurrentPrincipal() principal: Principal,
    @Query('country_code') countryCode?: string,
    @Query('status') status?: string,
  ) {
    return this.reviews.listModerationQuestions(principal, countryCode ?? '', status);
  }

  @Patch(':id')
  @RequirePermissions('review:moderate')
  moderateQuestion(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body()
    body: {
      country_code?: string;
      status?: string;
      version?: number;
      answer_body?: string;
    },
  ) {
    return this.reviews.moderateQuestion(principal, id, {
      country_code: body.country_code ?? '',
      status: body.status ?? '',
      version: body.version ?? 0,
      answer_body: body.answer_body,
    });
  }
}
