import { Body, Controller, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { AffiliateClickService } from './affiliate-click.service';

@Controller('public/affiliate')
export class PublicAffiliateController {
  constructor(private readonly clicks: AffiliateClickService) {}

  @Post('click')
  recordClick(
    @Body()
    body: {
      click_id?: string;
      country_code?: string;
      link_id?: string;
      referral_code?: string;
    },
    @Req() req: Request,
  ) {
    return this.clicks.recordClick({
      click_id: body.click_id ?? '',
      country_code: body.country_code ?? '',
      link_id: body.link_id,
      referral_code: body.referral_code,
      requestId: req.headers['x-request-id'] as string | undefined,
    });
  }
}
