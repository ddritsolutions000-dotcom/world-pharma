import { Body, Controller, Get, Headers, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentPrincipal, type Principal } from '../../identity/current-principal';
import { JwtAuthGuard } from '../../identity/jwt.guard';
import { AudienceGuard } from '../../identity/audience.guard';
import { RequireAudiences } from '../../identity/require-audiences';
import { PermissionsGuard } from '../../identity/permissions.guard';
import { RequirePermissions } from '../../identity/require-permissions';
import { CampaignService } from './campaign.service';
import { SegmentService } from './segment.service';
import { SendPipelineService } from './send-pipeline.service';

@Controller('admin/marketing')
@UseGuards(JwtAuthGuard, AudienceGuard, PermissionsGuard)
export class AdminMarketingController {
  constructor(
    private readonly segments: SegmentService,
    private readonly campaigns: CampaignService,
    private readonly sendPipeline: SendPipelineService,
  ) {}

  @Get('segments')
  @RequireAudiences('admin')
  @RequirePermissions('campaign:read')
  listSegments(@CurrentPrincipal() principal: Principal, @Query('country_code') countryCode?: string) {
    return this.segments.list(principal, countryCode ?? '');
  }

  @Get('segments/:id')
  @RequireAudiences('admin')
  @RequirePermissions('campaign:read')
  getSegment(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Query('country_code') countryCode?: string,
  ) {
    return this.segments.get(principal, id, countryCode ?? '');
  }

  @Post('segments')
  @RequireAudiences('admin')
  @RequirePermissions('campaign:send')
  createSegment(
    @CurrentPrincipal() principal: Principal,
    @Body()
    body: {
      country_code?: string;
      code?: string;
      name?: string;
      rules?: unknown;
      status?: string;
    },
    @Headers('idempotency-key') _idempotencyHeader?: string,
  ) {
    return this.segments.create(principal, {
      country_code: body.country_code ?? '',
      code: body.code ?? '',
      name: body.name ?? '',
      rules: body.rules,
      status: body.status,
    });
  }

  @Patch('segments/:id')
  @RequireAudiences('admin')
  @RequirePermissions('campaign:send')
  updateSegment(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body()
    body: {
      country_code?: string;
      name?: string;
      rules?: unknown;
      status?: string;
      version?: number;
    },
  ) {
    return this.segments.update(principal, id, {
      country_code: body.country_code ?? '',
      name: body.name,
      rules: body.rules,
      status: body.status,
      version: body.version,
    });
  }

  @Get('campaigns')
  @RequireAudiences('admin')
  @RequirePermissions('campaign:read')
  listCampaigns(@CurrentPrincipal() principal: Principal, @Query('country_code') countryCode?: string) {
    return this.campaigns.list(principal, countryCode ?? '');
  }

  @Get('campaigns/:id')
  @RequireAudiences('admin')
  @RequirePermissions('campaign:read')
  getCampaign(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Query('country_code') countryCode?: string,
  ) {
    return this.campaigns.get(principal, id, countryCode ?? '');
  }

  @Post('campaigns')
  @RequireAudiences('admin')
  @RequirePermissions('campaign:send')
  createCampaign(
    @CurrentPrincipal() principal: Principal,
    @Body()
    body: {
      country_code?: string;
      code?: string;
      name?: string;
      segment_id?: string;
      channel?: string;
      locale?: string;
      title?: string;
      body?: string;
      cms_content_id?: string;
    },
    @Headers('idempotency-key') _idempotencyHeader?: string,
  ) {
    return this.campaigns.create(principal, {
      country_code: body.country_code ?? '',
      code: body.code ?? '',
      name: body.name ?? '',
      segment_id: body.segment_id ?? '',
      channel: body.channel,
      locale: body.locale,
      title: body.title ?? '',
      body: body.body ?? '',
      cms_content_id: body.cms_content_id,
    });
  }

  @Patch('campaigns/:id')
  @RequireAudiences('admin')
  @RequirePermissions('campaign:send')
  updateCampaign(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body()
    body: {
      country_code?: string;
      name?: string;
      segment_id?: string;
      channel?: string;
      locale?: string;
      title?: string;
      body?: string;
      cms_content_id?: string | null;
      version?: number;
    },
  ) {
    return this.campaigns.update(principal, id, {
      country_code: body.country_code ?? '',
      name: body.name,
      segment_id: body.segment_id,
      channel: body.channel,
      locale: body.locale,
      title: body.title,
      body: body.body,
      cms_content_id: body.cms_content_id,
      version: body.version,
    });
  }

  @Post('campaigns/:id/schedule')
  @RequireAudiences('admin')
  @RequirePermissions('campaign:send')
  scheduleCampaign(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: { country_code?: string; scheduled_at?: string; version?: number },
    @Headers('idempotency-key') _idempotencyHeader?: string,
  ) {
    return this.campaigns.schedule(principal, id, {
      country_code: body.country_code ?? '',
      scheduled_at: body.scheduled_at,
      version: body.version,
    });
  }

  @Post('campaigns/:id/send')
  @RequireAudiences('admin')
  @RequirePermissions('campaign:send')
  sendCampaign(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: { country_code?: string; variant?: string },
    @Headers('idempotency-key') idempotencyHeader?: string,
  ) {
    return this.sendPipeline.sendCampaign(principal, id, {
      country_code: body.country_code ?? '',
      idempotency_key: idempotencyHeader,
      variant: body.variant,
    });
  }

  @Get('campaigns/:id/sends')
  @RequireAudiences('admin')
  @RequirePermissions('campaign:read')
  listSends(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Query('country_code') countryCode?: string,
  ) {
    return this.campaigns.listSends(principal, id, countryCode ?? '');
  }
}
