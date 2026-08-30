import { Body, Controller, Get, Headers, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Errors } from '../common/problem';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { StoreService } from './store.service';

@Controller('store')
@UseGuards(JwtAuthGuard, AudienceGuard)
@RequireAudiences('customer', 'partner_applicant')
export class StoreController {
  constructor(private readonly store: StoreService) {}

  @Get('dashboard')
  dashboard(
    @CurrentPrincipal() principal: Principal,
    @Query('organization_id') organizationId: string,
    @Query('location_id') locationId: string,
  ) {
    this.requireScope(organizationId, locationId);
    return this.store.dashboard(principal, organizationId, locationId);
  }

  @Get('lots')
  lots(
    @CurrentPrincipal() principal: Principal,
    @Query('organization_id') organizationId: string,
    @Query('location_id') locationId: string,
    @Query('cursor') cursor?: string,
  ) {
    this.requireScope(organizationId, locationId);
    return this.store.lots(principal, organizationId, locationId, cursor);
  }

  @Post('grn')
  grn(
    @CurrentPrincipal() principal: Principal,
    @Query('organization_id') organizationId: string,
    @Query('location_id') locationId: string,
    @Body() body: Record<string, unknown>,
  ) {
    this.requireScope(organizationId, locationId);
    return this.store.createGrn(principal, organizationId, locationId, body);
  }

  @Post('adjustments')
  adjust(
    @CurrentPrincipal() principal: Principal,
    @Query('organization_id') organizationId: string,
    @Query('location_id') locationId: string,
    @Body() body: Record<string, unknown>,
  ) {
    this.requireScope(organizationId, locationId);
    return this.store.adjust(principal, organizationId, locationId, body);
  }

  @Get('orders')
  orders(
    @CurrentPrincipal() principal: Principal,
    @Query('organization_id') organizationId: string,
    @Query('location_id') locationId: string,
  ) {
    this.requireScope(organizationId, locationId);
    return this.store.queue(principal, organizationId, locationId);
  }

  @Post('orders/:id/pick/start')
  startPick(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Query('organization_id') organizationId: string,
    @Query('location_id') locationId: string,
  ) {
    this.requireScope(organizationId, locationId);
    return this.store.startPick(principal, organizationId, locationId, id);
  }

  @Post('orders/:id/pick/complete')
  completePick(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Query('organization_id') organizationId: string,
    @Query('location_id') locationId: string,
  ) {
    this.requireScope(organizationId, locationId);
    return this.store.completePick(principal, organizationId, locationId, id);
  }

  @Post('orders/:id/pack/complete')
  completePack(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Query('organization_id') organizationId: string,
    @Query('location_id') locationId: string,
  ) {
    this.requireScope(organizationId, locationId);
    return this.store.completePack(principal, organizationId, locationId, id);
  }

  @Post('orders/:id/ready')
  ready(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Query('organization_id') organizationId: string,
    @Query('location_id') locationId: string,
  ) {
    this.requireScope(organizationId, locationId);
    return this.store.readyToShip(principal, organizationId, locationId, id);
  }

  @Get('organizations')
  organizations(@CurrentPrincipal() principal: Principal) {
    return this.store.organizations(principal);
  }

  @Get('locations')
  locations(
    @CurrentPrincipal() principal: Principal,
    @Query('organization_id') organizationId: string,
  ) {
    if (!organizationId) {
      throw Errors.validation('organization_id is required.');
    }
    return this.store.locations(principal, organizationId);
  }

  @Post('grn/:id/receive')
  receiveGrn(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Query('organization_id') organizationId: string,
    @Query('location_id') locationId: string,
  ) {
    this.requireScope(organizationId, locationId);
    return this.store.markGrnReceived(principal, organizationId, locationId, id);
  }

  @Post('grn/:id/post')
  postGrn(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Query('organization_id') organizationId: string,
    @Query('location_id') locationId: string,
  ) {
    this.requireScope(organizationId, locationId);
    return this.store.postGrn(principal, organizationId, locationId, id);
  }

  @Get('exceptions')
  exceptions(
    @CurrentPrincipal() principal: Principal,
    @Query('organization_id') organizationId: string,
    @Query('location_id') locationId: string,
  ) {
    this.requireScope(organizationId, locationId);
    return this.store.exceptions(principal, organizationId, locationId);
  }

  @Get('dispensing-cases')
  listDispensingCases(
    @CurrentPrincipal() principal: Principal,
    @Query('organization_id') organizationId: string,
    @Query('location_id') locationId: string,
  ) {
    this.requireScope(organizationId, locationId);
    return this.store.listDispensingCases(principal, organizationId, locationId);
  }

  @Get('dispensing-cases/:id')
  getDispensingCase(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Query('organization_id') organizationId: string,
    @Query('location_id') locationId: string,
  ) {
    this.requireScope(organizationId, locationId);
    return this.store.getDispensingCase(principal, organizationId, locationId, id);
  }

  @Post('dispensing-cases/:id/claim')
  @HttpCode(200)
  claimDispensingCase(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Query('organization_id') organizationId: string,
    @Query('location_id') locationId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: { idempotency_key?: string },
  ) {
    this.requireScope(organizationId, locationId);
    return this.store.claimDispensingCase(
      principal,
      organizationId,
      locationId,
      id,
      idempotencyKey ?? body?.idempotency_key ?? '',
    );
  }

  @Post('dispensing-cases/:id/validate')
  @HttpCode(200)
  validateDispensingCase(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Query('organization_id') organizationId: string,
    @Query('location_id') locationId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: { idempotency_key?: string },
  ) {
    this.requireScope(organizationId, locationId);
    return this.store.validateDispensingCase(
      principal,
      organizationId,
      locationId,
      id,
      idempotencyKey ?? body?.idempotency_key ?? '',
    );
  }

  @Post('dispensing-cases/:id/reject')
  @HttpCode(200)
  rejectDispensingCase(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Query('organization_id') organizationId: string,
    @Query('location_id') locationId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: { reason_code?: string; idempotency_key?: string },
  ) {
    this.requireScope(organizationId, locationId);
    return this.store.rejectDispensingCase(principal, organizationId, locationId, id, {
      reason_code: body?.reason_code ?? '',
      idempotency_key: idempotencyKey ?? body?.idempotency_key ?? '',
    });
  }

  @Post('dispensing-cases/:id/authorize')
  @HttpCode(200)
  authorizeDispensingCase(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Query('organization_id') organizationId: string,
    @Query('location_id') locationId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: { idempotency_key?: string },
  ) {
    this.requireScope(organizationId, locationId);
    return this.store.authorizeDispensingCase(
      principal,
      organizationId,
      locationId,
      id,
      idempotencyKey ?? body?.idempotency_key ?? '',
    );
  }

  @Post('dispensing-cases/:id/map-lines')
  @HttpCode(200)
  mapDispensingLines(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Query('organization_id') organizationId: string,
    @Query('location_id') locationId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body()
    body: {
      lines?: Array<{
        prescription_line_id: string;
        catalog_item_id: string;
        catalog_variant_id: string;
        inventory_lot_id: string;
        quantity_dispensed: string;
        confirm_substitution?: boolean;
      }>;
      idempotency_key?: string;
    },
  ) {
    this.requireScope(organizationId, locationId);
    return this.store.mapDispensingLines(principal, organizationId, locationId, id, {
      lines: body?.lines ?? [],
      idempotency_key: idempotencyKey ?? body?.idempotency_key ?? '',
    });
  }

  @Post('dispensing-cases/:id/complete')
  @HttpCode(200)
  completeDispensingCase(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Query('organization_id') organizationId: string,
    @Query('location_id') locationId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: { idempotency_key?: string },
  ) {
    this.requireScope(organizationId, locationId);
    return this.store.completeDispensingCase(
      principal,
      organizationId,
      locationId,
      id,
      idempotencyKey ?? body?.idempotency_key ?? '',
    );
  }

  @Get('dispensing-lots')
  listDispensingLots(
    @CurrentPrincipal() principal: Principal,
    @Query('organization_id') organizationId: string,
    @Query('location_id') locationId: string,
    @Query('variant_id') variantId: string,
  ) {
    this.requireScope(organizationId, locationId);
    if (!variantId) {
      throw Errors.validation('variant_id is required.');
    }
    return this.store.listDispensingLots(principal, organizationId, locationId, variantId);
  }

  private requireScope(organizationId: string, locationId: string) {
    if (!organizationId || !locationId) {
      throw Errors.validation('organization_id and location_id are required.');
    }
  }
}
