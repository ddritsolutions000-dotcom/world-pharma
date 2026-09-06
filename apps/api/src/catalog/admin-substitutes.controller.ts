import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Errors } from '../common/problem';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { PermissionsGuard } from '../identity/permissions.guard';
import { RequirePermissions } from '../identity/require-permissions';
import { MedicineSubstituteService } from './medicine-substitute.service';
import { MedicineSubstituteEdgeService } from './medicine-substitute-edge.service';

@Controller('admin/substitutes')
@UseGuards(JwtAuthGuard, AudienceGuard, PermissionsGuard)
@RequireAudiences('admin')
export class AdminSubstitutesController {
  constructor(
    private readonly substitutes: MedicineSubstituteService,
    private readonly edges: MedicineSubstituteEdgeService,
  ) {}

  @Get()
  @RequirePermissions('catalog:admin')
  lookup(@Query('item_id') itemId?: string, @Query('country_code') countryCode?: string) {
    if (!itemId?.trim()) {
      throw Errors.validation('item_id is required.');
    }
    if (!countryCode?.trim()) {
      throw Errors.validation('country_code is required.');
    }
    return this.substitutes.getSubstitutes(null, itemId.trim(), countryCode);
  }

  @Get('edges')
  @RequirePermissions('catalog:admin')
  listEdges(@Query('country_code') countryCode?: string, @Query('from_item_id') fromItemId?: string) {
    if (!countryCode?.trim()) {
      throw Errors.validation('country_code is required.');
    }
    return this.edges.list(countryCode, fromItemId?.trim());
  }

  @Post('edges')
  @HttpCode(200)
  @RequirePermissions('catalog:admin')
  createEdge(
    @Query('country_code') countryCode: string | undefined,
    @Body() body: Record<string, unknown>,
    @CurrentPrincipal() principal: Principal,
  ) {
    if (!countryCode?.trim()) {
      throw Errors.validation('country_code is required.');
    }
    return this.edges.create(principal.personId, countryCode, body);
  }

  @Patch('edges/:edgeId')
  @RequirePermissions('catalog:admin')
  updateEdge(
    @Param('edgeId') edgeId: string,
    @Body() body: Record<string, unknown>,
    @CurrentPrincipal() principal: Principal,
  ) {
    return this.edges.update(principal.personId, edgeId, body);
  }

  @Post('edges/:edgeId/remove')
  @HttpCode(200)
  @RequirePermissions('catalog:admin')
  removeEdge(@Param('edgeId') edgeId: string, @CurrentPrincipal() principal: Principal) {
    return this.edges.remove(principal.personId, edgeId);
  }
}