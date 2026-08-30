import { Body, Controller, Get, Headers, Patch, Query, UseGuards } from '@nestjs/common';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { MarketingPreferenceService } from './marketing-preference.service';

@Controller('me/marketing-preferences')
@UseGuards(JwtAuthGuard, AudienceGuard)
@RequireAudiences('customer')
export class MarketingPreferenceController {
  constructor(private readonly marketingPrefs: MarketingPreferenceService) {}

  @Get()
  get(
    @CurrentPrincipal() principal: Principal,
    @Query('country_code') countryCode?: string,
  ) {
    return this.marketingPrefs.getForPerson(principal.personId, countryCode ?? '');
  }

  @Patch()
  patch(
    @CurrentPrincipal() principal: Principal,
    @Query('country_code') countryCode?: string,
    @Body()
    body?: {
      marketing_allowed?: boolean;
      email_allowed?: boolean;
      push_allowed?: boolean;
      sms_allowed?: boolean;
      whatsapp_allowed?: boolean;
      version?: number;
    },
    @Headers('idempotency-key') _idempotencyKey?: string,
  ) {
    return this.marketingPrefs.updateForPerson(
      principal.personId,
      countryCode ?? '',
      {
        marketing_allowed: body?.marketing_allowed,
        email_allowed: body?.email_allowed,
        push_allowed: body?.push_allowed,
        sms_allowed: body?.sms_allowed,
        whatsapp_allowed: body?.whatsapp_allowed,
      },
      principal.personId,
      body?.version,
    );
  }
}
