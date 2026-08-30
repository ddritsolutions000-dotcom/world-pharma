import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { PersonalizationService } from './personalization.service';

@Controller('me/personalization/events')
@UseGuards(JwtAuthGuard, AudienceGuard)
@RequireAudiences('customer')
export class PersonalizationController {
  constructor(private readonly personalization: PersonalizationService) {}

  @Post()
  record(
    @CurrentPrincipal() principal: Principal,
    @Body()
    body: {
      country_code?: string;
      event_kind?: string;
      source?: string;
      source_key?: string;
      catalog_item_id?: string;
      catalog_offer_id?: string;
      order_id?: string;
      metadata?: Record<string, unknown>;
    },
  ) {
    return this.personalization.record(principal, {
      country_code: body.country_code ?? '',
      event_kind: body.event_kind ?? '',
      source: body.source ?? '',
      source_key: body.source_key ?? '',
      catalog_item_id: body.catalog_item_id,
      catalog_offer_id: body.catalog_offer_id,
      order_id: body.order_id,
      metadata: body.metadata,
    });
  }
}
