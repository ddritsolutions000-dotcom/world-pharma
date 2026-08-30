import { Controller, Get, Param, Query } from '@nestjs/common';
import { z } from 'zod';
import { Errors } from '../common/problem';
import { RECOMMENDATION_DEFAULT_LIMIT, RECOMMENDATION_MAX_LIMIT } from './recommendation-query';
import { RecommendationsService } from './recommendations.service';

const itemRecommendationsSchema = z
  .object({
    country: z.string().length(2),
    locale: z.string().min(2).max(35).optional(),
    limit: z.coerce.number().int().min(1).max(RECOMMENDATION_MAX_LIMIT).optional(),
  })
  .strict();

@Controller('catalog/items/:itemId')
export class RecommendationsCatalogController {
  constructor(private readonly recommendations: RecommendationsService) {}

  @Get('recommendations')
  itemRecommendations(@Param('itemId') itemId: string, @Query() query: Record<string, unknown>) {
    const parsed = itemRecommendationsSchema.safeParse(query);
    if (!parsed.success) {
      throw Errors.validation('country query parameter is required');
    }
    return this.recommendations.getItemRecommendations(
      itemId,
      parsed.data.country,
      parsed.data.locale ?? 'en',
      parsed.data.limit ?? RECOMMENDATION_DEFAULT_LIMIT,
    );
  }
}
