import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { InventoryRejectDisposition, LocationKind } from '@prisma/client';
import { Errors } from '../common/problem';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { PermissionsGuard } from '../identity/permissions.guard';
import { RequirePermissions } from '../identity/require-permissions';
import { InventoryService } from './inventory.service';

@Controller('admin/inventory')
@UseGuards(JwtAuthGuard, AudienceGuard, PermissionsGuard)
@RequireAudiences('admin')
export class InventoryAdminController {
  constructor(private readonly inventory: InventoryService) {}

  @Get('locations')
  @RequirePermissions('inventory:read')
  locations(@CurrentPrincipal() principal: Principal, @Query('organization_id') organizationId: string) {
    if (!organizationId) {
      throw Errors.validation('organization_id is required.');
    }
    return this.inventory.listLocations(principal, organizationId);
  }

  @Post('locations')
  @RequirePermissions('inventory:admin')
  createLocation(@CurrentPrincipal() principal: Principal, @Body() body: Record<string, unknown>) {
    if (!body['organization_id'] || !body['kind'] || !body['name']) {
      throw Errors.validation('organization_id, kind and name are required.');
    }
    return this.inventory.createLocation(principal, {
      organizationId: String(body['organization_id']),
      kind: body['kind'] as LocationKind,
      name: String(body['name']),
      timezone: body['timezone'] as string | undefined,
      fulfillmentCapable: Boolean(body['fulfillment_capable']),
      region: body['region'] as string | undefined,
      city: body['city'] as string | undefined,
      postalCode: body['postal_code'] as string | undefined,
      addressLine: body['address_line'] as string | undefined,
    });
  }

  @Get('lots')
  @RequirePermissions('inventory:read')
  lots(
    @CurrentPrincipal() principal: Principal,
    @Query('owner_org_id') ownerOrgId: string,
    @Query('location_id') locationId?: string,
    @Query('variant_id') variantId?: string,
    @Query('cursor') cursor?: string,
  ) {
    if (!ownerOrgId) {
      throw Errors.validation('owner_org_id is required.');
    }
    return this.inventory.listLots(principal, { ownerOrgId, locationId, variantId, cursor });
  }

  @Get('lots/:id')
  @RequirePermissions('inventory:read')
  lot(@CurrentPrincipal() principal: Principal, @Param('id') id: string) {
    return this.inventory.getLot(principal, id);
  }

  @Get('movements')
  @RequirePermissions('inventory:read')
  movements(
    @CurrentPrincipal() principal: Principal,
    @Query('owner_org_id') ownerOrgId: string,
    @Query('lot_id') lotId?: string,
    @Query('cursor') cursor?: string,
  ) {
    if (!ownerOrgId) {
      throw Errors.validation('owner_org_id is required.');
    }
    return this.inventory.listMovements(principal, { ownerOrgId, lotId, cursor });
  }

  @Post('grn')
  @RequirePermissions('inventory:receive')
  createGrn(@CurrentPrincipal() principal: Principal, @Body() body: Record<string, unknown>) {
    if (!body['location_id'] || !body['owner_org_id'] || !body['idempotency_key']) {
      throw Errors.validation('location_id, owner_org_id and idempotency_key are required.');
    }
    return this.inventory.createGoodsReceipt(principal, {
      locationId: String(body['location_id']),
      ownerOrgId: String(body['owner_org_id']),
      idempotencyKey: String(body['idempotency_key']),
      lines: ((body['lines'] as Record<string, unknown>[]) ?? []).map((line) => ({
        variantId: String(line['variant_id']),
        lotCode: line['lot_code'] as string | undefined,
        expiresOn: line['expires_on'] as string | undefined,
        manufacturedOn: line['manufactured_on'] as string | undefined,
        qty: Number(line['qty']),
        qtyAccepted: line['qty_accepted'] as number | undefined,
        qtyRejected: line['qty_rejected'] as number | undefined,
        rejectDisposition: line['reject_disposition'] as InventoryRejectDisposition | undefined,
      })),
    });
  }

  @Get('grn')
  @RequirePermissions('inventory:read')
  grns(@CurrentPrincipal() principal: Principal, @Query('owner_org_id') ownerOrgId: string) {
    if (!ownerOrgId) {
      throw Errors.validation('owner_org_id is required.');
    }
    return this.inventory.listReceipts(principal, ownerOrgId);
  }

  @Post('grn/:id/receive')
  @RequirePermissions('inventory:receive')
  receive(@CurrentPrincipal() principal: Principal, @Param('id') id: string) {
    return this.inventory.receiveGoodsReceipt(principal, id);
  }

  @Post('grn/:id/post')
  @RequirePermissions('inventory:receive')
  post(@CurrentPrincipal() principal: Principal, @Param('id') id: string) {
    return this.inventory.postGoodsReceipt(principal, id);
  }

  @Post('adjustments')
  @RequirePermissions('inventory:adjust')
  adjust(@CurrentPrincipal() principal: Principal, @Body() body: Record<string, unknown>) {
    if (!body['lot_id'] || body['qty_delta'] === undefined || !body['reason_code'] || !body['idempotency_key']) {
      throw Errors.validation('lot_id, qty_delta, reason_code and idempotency_key are required.');
    }
    return this.inventory.adjust(principal, {
      lotId: String(body['lot_id']),
      qtyDelta: Number(body['qty_delta']),
      reasonCode: String(body['reason_code']),
      idempotencyKey: String(body['idempotency_key']),
    });
  }

  @Post('lots/:id/damage')
  @RequirePermissions('inventory:adjust')
  damage(@CurrentPrincipal() principal: Principal, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.bucket(principal, id, 'DAMAGE', body);
  }

  @Post('lots/:id/expire')
  @RequirePermissions('inventory:adjust')
  expire(@CurrentPrincipal() principal: Principal, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.bucket(principal, id, 'EXPIRY', body);
  }

  @Post('lots/:id/quarantine')
  @RequirePermissions('inventory:adjust')
  quarantine(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.bucket(principal, id, 'QUARANTINE', body);
  }

  @Post('lots/:id/unquarantine')
  @RequirePermissions('inventory:adjust')
  unquarantine(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.bucket(principal, id, 'UNQUARANTINE', body);
  }

  @Post('reservations')
  @RequirePermissions('inventory:adjust')
  reserve(@CurrentPrincipal() principal: Principal, @Body() body: Record<string, unknown>) {
    if (!body['variant_id'] || !body['location_id'] || !body['owner_org_id'] || !body['qty'] || !body['idempotency_key']) {
      throw Errors.validation('variant_id, location_id, owner_org_id, qty and idempotency_key are required.');
    }
    return this.inventory.reserve(principal, {
      variantId: String(body['variant_id']),
      locationId: String(body['location_id']),
      ownerOrgId: String(body['owner_org_id']),
      qty: Number(body['qty']),
      ttlSeconds: body['ttl_seconds'] as number | undefined,
      idempotencyKey: String(body['idempotency_key']),
    });
  }

  @Post('reservations/:id/release')
  @RequirePermissions('inventory:adjust')
  release(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.inventory.release(principal, id, String(body['idempotency_key'] ?? `release:${id}`));
  }

  @Get('transfers')
  @RequirePermissions('inventory:read')
  transfers(@CurrentPrincipal() principal: Principal, @Query('owner_org_id') ownerOrgId: string) {
    if (!ownerOrgId) {
      throw Errors.validation('owner_org_id is required.');
    }
    return this.inventory.listTransfers(principal, ownerOrgId);
  }

  @Post('transfers')
  @RequirePermissions('inventory:transfer')
  createTransfer(@CurrentPrincipal() principal: Principal, @Body() body: Record<string, unknown>) {
    if (!body['from_location_id'] || !body['to_location_id'] || !body['owner_org_id'] || !body['idempotency_key']) {
      throw Errors.validation('from_location_id, to_location_id, owner_org_id and idempotency_key are required.');
    }
    return this.inventory.createTransfer(principal, {
      fromLocationId: String(body['from_location_id']),
      toLocationId: String(body['to_location_id']),
      ownerOrgId: String(body['owner_org_id']),
      idempotencyKey: String(body['idempotency_key']),
      lines: ((body['lines'] as Record<string, unknown>[]) ?? []).map((line) => ({
        variantId: String(line['variant_id']),
        sourceLotId: String(line['source_lot_id']),
        qty: Number(line['qty']),
      })),
    });
  }

  @Post('transfers/:id/reserve')
  @RequirePermissions('inventory:transfer')
  reserveTransfer(@CurrentPrincipal() principal: Principal, @Param('id') id: string) {
    return this.inventory.reserveTransfer(principal, id);
  }

  @Post('transfers/:id/dispatch')
  @RequirePermissions('inventory:transfer')
  dispatch(@CurrentPrincipal() principal: Principal, @Param('id') id: string) {
    return this.inventory.dispatchTransfer(principal, id);
  }

  @Post('transfers/:id/receive')
  @RequirePermissions('inventory:transfer')
  receiveTransfer(@CurrentPrincipal() principal: Principal, @Param('id') id: string) {
    return this.inventory.receiveTransfer(principal, id);
  }

  private bucket(
    principal: Principal,
    lotId: string,
    type: 'DAMAGE' | 'EXPIRY' | 'QUARANTINE' | 'UNQUARANTINE',
    body: Record<string, unknown>,
  ) {
    if (!body['qty'] || !body['reason_code'] || !body['idempotency_key']) {
      throw Errors.validation('qty, reason_code and idempotency_key are required.');
    }
    return this.inventory.moveBucket(principal, {
      lotId,
      qty: Number(body['qty']),
      type,
      reasonCode: String(body['reason_code']),
      idempotencyKey: String(body['idempotency_key']),
    });
  }
}
