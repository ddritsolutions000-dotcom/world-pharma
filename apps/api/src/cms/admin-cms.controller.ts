import { Body, Controller, Get, Headers, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { PermissionsGuard } from '../identity/permissions.guard';
import { RequirePermissions } from '../identity/require-permissions';
import { CmsAssetService } from './cms-asset.service';
import { CmsContentService } from './cms-content.service';

@Controller('admin/cms')
@UseGuards(JwtAuthGuard, AudienceGuard, PermissionsGuard)
export class AdminCmsController {
  constructor(
    private readonly cms: CmsContentService,
    private readonly assets: CmsAssetService,
  ) {}

  @Get('content')
  @RequireAudiences('admin')
  @RequirePermissions('cms:read')
  list(
    @CurrentPrincipal() principal: Principal,
    @Query('country_code') countryCode?: string,
    @Query('status') status?: string,
    @Query('content_type') contentType?: string,
    @Query('slug') slug?: string,
  ) {
    return this.cms.listContent(principal, { country_code: countryCode, status, content_type: contentType, slug });
  }

  @Post('content')
  @RequireAudiences('admin')
  @RequirePermissions('cms:write')
  create(
    @CurrentPrincipal() principal: Principal,
    @Body()
    body: {
      country_code?: string;
      content_type?: string;
      slug?: string;
      locale?: string;
      title?: string;
      summary?: string;
      body?: string;
      category_slug?: string;
      idempotency_key?: string;
    },
    @Headers('idempotency-key') idempotencyHeader?: string,
  ) {
    return this.cms.createContent(principal, {
      ...body,
      idempotency_key: body.idempotency_key ?? idempotencyHeader,
    });
  }

  @Get('content/:id')
  @RequireAudiences('admin')
  @RequirePermissions('cms:read')
  get(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Query('country_code') countryCode?: string,
  ) {
    return this.cms.getContent(principal, id, countryCode);
  }

  @Patch('content/:id')
  @RequireAudiences('admin')
  @RequirePermissions('cms:write')
  update(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body()
    body: {
      country_code?: string;
      title?: string;
      summary?: string;
      body?: string;
      category_slug?: string;
      expected_version?: number;
    },
  ) {
    return this.cms.updateContent(principal, id, body);
  }

  @Post('content/:id/submit-review')
  @RequireAudiences('admin')
  @RequirePermissions('cms:write')
  submitReview(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: { country_code?: string },
  ) {
    return this.cms.submitReview(principal, id, body.country_code);
  }

  @Post('content/:id/publish')
  @RequireAudiences('admin')
  @RequirePermissions('cms:publish')
  publish(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: { country_code?: string; idempotency_key?: string },
    @Headers('idempotency-key') idempotencyHeader?: string,
  ) {
    return this.cms.publish(principal, id, {
      country_code: body.country_code,
      idempotency_key: body.idempotency_key ?? idempotencyHeader,
    });
  }

  @Post('content/:id/revise')
  @RequireAudiences('admin')
  @RequirePermissions('cms:write')
  revise(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: { country_code?: string },
  ) {
    return this.cms.revise(principal, id, body.country_code);
  }

  @Post('content/:id/archive')
  @RequireAudiences('admin')
  @RequirePermissions('cms:publish')
  archive(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: { country_code?: string },
  ) {
    return this.cms.archive(principal, id, body.country_code);
  }

  @Get('content/:id/versions')
  @RequireAudiences('admin')
  @RequirePermissions('cms:read')
  versions(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Query('country_code') countryCode?: string,
  ) {
    return this.cms.listVersions(principal, id, countryCode);
  }

  @Get('assets')
  @RequireAudiences('admin')
  @RequirePermissions('cms:read')
  listAssets(@CurrentPrincipal() principal: Principal, @Query('country_code') countryCode?: string, @Query('folder') folder?: string) {
    return this.assets.listAssets(principal, countryCode, folder);
  }

  @Post('assets')
  @RequireAudiences('admin')
  @RequirePermissions('cms:write')
  uploadAsset(
    @CurrentPrincipal() principal: Principal,
    @Body()
    body: {
      country_code?: string;
      content_item_id?: string;
      content_base64?: string;
      content_type?: string;
      original_name?: string;
      alt_text?: string;
      folder?: string;
      idempotency_key?: string;
    },
    @Headers('idempotency-key') idempotencyHeader?: string,
  ) {
    return this.assets.uploadAsset(principal, {
      ...body,
      idempotency_key: body.idempotency_key ?? idempotencyHeader,
    });
  }

  @Patch('assets/:id')
  @RequireAudiences('admin')
  @RequirePermissions('cms:write')
  updateAsset(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: { country_code?: string; alt_text?: string; folder?: string },
  ) {
    return this.assets.updateAsset(principal, id, body);
  }
}
