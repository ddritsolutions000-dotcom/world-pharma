import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { PermissionsGuard } from '../identity/permissions.guard';
import { RequirePermissions } from '../identity/require-permissions';
import { Errors } from '../common/problem';
import { SecurityEventsService } from '../identity/security-events.service';
import { AnalyticsReadService } from './analytics-read.service';

const querySchema = z
  .object({
    country_code: z.string().min(2).max(2),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    catalog_item_id: z.string().uuid().optional(),
  })
  .strict();

function parseAnalyticsQuery(query: unknown) {
  const parsed = querySchema.safeParse(query);
  if (!parsed.success) {
    throw Errors.validation('Invalid analytics query parameters.');
  }
  return parsed.data;
}

@Controller('admin/analytics')
@UseGuards(JwtAuthGuard, AudienceGuard, PermissionsGuard)
export class AdminAnalyticsController {
  constructor(
    private readonly analytics: AnalyticsReadService,
    private readonly securityEvents: SecurityEventsService,
  ) {}

  @Get('overview')
  @RequireAudiences('admin')
  @RequirePermissions('analytics:read')
  async overview(@CurrentPrincipal() principal: Principal, @Query() query: unknown) {
    const input = parseAnalyticsQuery(query);
    const body = await this.analytics.overview(principal, input.country_code, input.from, input.to);
    await this.securityEvents.emit({
      type: 'ANALYTICS_QUERY',
      outcome: 'success',
      personId: principal.personId,
      metadata: {
        dashboard_id: 'overview',
        country_code: input.country_code,
        row_count: body.daily.length,
      },
    });
    return body;
  }

  @Get('commerce')
  @RequireAudiences('admin')
  @RequirePermissions('analytics:read')
  async commerce(@CurrentPrincipal() principal: Principal, @Query() query: unknown) {
    const input = parseAnalyticsQuery(query);
    const body = await this.analytics.commerce(
      principal,
      input.country_code,
      input.from,
      input.to,
      input.catalog_item_id,
    );
    await this.securityEvents.emit({
      type: 'ANALYTICS_QUERY',
      outcome: 'success',
      personId: principal.personId,
      metadata: {
        dashboard_id: 'commerce',
        country_code: input.country_code,
        row_count: body.items.length,
      },
    });
    return body;
  }

  @Get('marketing')
  @RequireAudiences('admin')
  @RequirePermissions('analytics:read')
  async marketing(@CurrentPrincipal() principal: Principal, @Query() query: unknown) {
    const input = parseAnalyticsQuery(query);
    const body = await this.analytics.marketing(principal, input.country_code, input.from, input.to);
    await this.securityEvents.emit({
      type: 'ANALYTICS_QUERY',
      outcome: 'success',
      personId: principal.personId,
      metadata: {
        dashboard_id: 'marketing',
        country_code: input.country_code,
        row_count: body.daily.length,
      },
    });
    return body;
  }
}
