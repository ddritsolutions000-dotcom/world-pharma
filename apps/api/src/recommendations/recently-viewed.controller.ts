import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { Errors } from '../common/problem';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { RECOMMENDATION_MAX_LIMIT } from './recommendation-query';
import { RecentlyViewedService } from './recently-viewed.service';

const querySchema = z
  .object({
    country_code: z.string().length(2),
    locale: z.string().min(2).max(35).optional(),
    limit: z.coerce.number().int().min(1).max(RECOMMENDATION_MAX_LIMIT).optional(),
  })
  .strict();

@Controller('me/recently-viewed')
@UseGuards(JwtAuthGuard, AudienceGuard)
@RequireAudiences('customer')
export class RecentlyViewedController {
  constructor(private readonly recentlyViewed: RecentlyViewedService) {}

  @Get()
  list(@CurrentPrincipal() principal: Principal, @Query() query: Record<string, unknown>) {
    const parsed = querySchema.safeParse(query);
    if (!parsed.success) {
      throw Errors.validation('country_code query parameter is required');
    }
    return this.recentlyViewed.list(
      principal,
      parsed.data.country_code,
      parsed.data.locale ?? 'en',
      parsed.data.limit ?? 12,
    );
  }
}
