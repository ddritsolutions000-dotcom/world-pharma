import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { InventoryRejectDisposition, LocationKind } from '@prisma/client';
import { PrismaService } from '../app/prisma.service';
import { Errors } from '../common/problem';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { assertVendorSellerAccess } from '../catalog/access';
import { InventoryService } from './inventory.service';

@Controller('vendor/inventory')
@UseGuards(JwtAuthGuard, AudienceGuard)
@RequireAudiences('customer', 'partner_applicant')
export class InventoryVendorController {
  constructor(
    private readonly inventory: InventoryService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('locations')
  async locations(@CurrentPrincipal() principal: Principal, @Query('organization_id') organizationId: string) {
    if (!organizationId) {
      throw Errors.validation('organization_id is required.');
    }
    await assertVendorSellerAccess(this.prisma, principal, organizationId);
    const rows = await this.inventory.listLocations(principal, organizationId);
    return {
      data: rows.map((row) => ({
        id: row.id,
        name: row.name,
        kind: row.kind,
        organization_id: row.organizationId,
        is_active: row.isActive,
      })),
    };
  }

  @Post('locations')
  async createLocation(@CurrentPrincipal() principal: Principal, @Body() body: Record<string, unknown>) {
    if (!body['organization_id'] || !body['name']) {
      throw Errors.validation('organization_id and name are required.');
    }
    const organizationId = String(body['organization_id']);
    await assertVendorSellerAccess(this.prisma, principal, organizationId);
    // Vendor path creates seller warehouses only — never Store/pharmacy locations.
    if (body['kind'] && String(body['kind']) !== LocationKind.VENDOR_WAREHOUSE) {
      throw Errors.validation('Vendor inventory locations must be VENDOR_WAREHOUSE.');
    }
    const created = await this.inventory.createLocation(principal, {
      organizationId,
      kind: LocationKind.VENDOR_WAREHOUSE,
      name: String(body['name']),
      timezone: body['timezone'] as string | undefined,
      fulfillmentCapable: Boolean(body['fulfillment_capable']),
      region: body['region'] as string | undefined,
      city: body['city'] as string | undefined,
      postalCode: body['postal_code'] as string | undefined,
      addressLine: body['address_line'] as string | undefined,
    });
    return {
      id: created.id,
      name: created.name,
      kind: created.kind,
      organization_id: created.organizationId,
      is_active: created.isActive,
    };
  }

  @Get('lots')
  async lots(
    @CurrentPrincipal() principal: Principal,
    @Query('owner_org_id') ownerOrgId: string,
    @Query('location_id') locationId?: string,
    @Query('cursor') cursor?: string,
  ) {
    if (!ownerOrgId) {
      throw Errors.validation('owner_org_id is required.');
    }
    await assertVendorSellerAccess(this.prisma, principal, ownerOrgId);
    return this.inventory.listLots(principal, { ownerOrgId, locationId, cursor });
  }

  @Get('lots/:id')
  async lot(@CurrentPrincipal() principal: Principal, @Param('id') id: string) {
    const lot = await this.inventory.getLot(principal, id);
    await assertVendorSellerAccess(this.prisma, principal, String((lot as { owner_org_id: string }).owner_org_id));
    return lot;
  }

  @Get('movements')
  async movements(
    @CurrentPrincipal() principal: Principal,
    @Query('owner_org_id') ownerOrgId: string,
    @Query('lot_id') lotId?: string,
  ) {
    if (!ownerOrgId) {
      throw Errors.validation('owner_org_id is required.');
    }
    await assertVendorSellerAccess(this.prisma, principal, ownerOrgId);
    const result = await this.inventory.listMovements(principal, { ownerOrgId, lotId });
    return {
      data: result.data.map((row) => ({
        id: row.id,
        lot_id: row.lotId,
        type: row.type,
        qty: row.qty,
        reason_code: row.reasonCode,
        occurred_at: row.occurredAt,
        lot_code: row.lot?.lotCode ?? null,
        variant_id: row.lot?.variantId ?? null,
        location_id: row.lot?.locationId ?? null,
      })),
      next_cursor: result.next_cursor,
    };
  }

  @Get('grn')
  async receipts(@CurrentPrincipal() principal: Principal, @Query('owner_org_id') ownerOrgId: string) {
    if (!ownerOrgId) {
      throw Errors.validation('owner_org_id is required.');
    }
    await assertVendorSellerAccess(this.prisma, principal, ownerOrgId);
    const rows = await this.inventory.listReceipts(principal, ownerOrgId);
    return {
      data: rows.map((row) => ({
        id: row.id,
        status: row.status,
        location_id: row.locationId,
        owner_org_id: row.ownerOrgId,
        created_at: row.createdAt,
        received_at: row.receivedAt,
        posted_at: row.postedAt,
      })),
    };
  }

  @Post('grn')
  async createGrn(@CurrentPrincipal() principal: Principal, @Body() body: Record<string, unknown>) {
    if (!body['location_id'] || !body['owner_org_id'] || !body['idempotency_key']) {
      throw Errors.validation('location_id, owner_org_id and idempotency_key are required.');
    }
    const ownerOrgId = String(body['owner_org_id']);
    await assertVendorSellerAccess(this.prisma, principal, ownerOrgId);
    const locationId = String(body['location_id']);
    const location = await this.prisma.location.findUnique({ where: { id: locationId } });
    if (!location || location.organizationId !== ownerOrgId) {
      throw Errors.validation('Location does not belong to the owning organization.');
    }
    if (location.kind === LocationKind.STORE) {
      throw Errors.validation('Vendor goods receipts cannot target Store locations. Use a VENDOR_WAREHOUSE.');
    }
    return this.inventory.createGoodsReceipt(principal, {
      locationId,
      ownerOrgId,
      idempotencyKey: String(body['idempotency_key']),
      lines: ((body['lines'] as Record<string, unknown>[]) ?? []).map((line) => ({
        variantId: String(line['variant_id']),
        lotCode: line['lot_code'] as string | undefined,
        expiresOn: line['expires_on'] as string | undefined,
        qty: Number(line['qty']),
        qtyAccepted: line['qty_accepted'] as number | undefined,
        qtyRejected: line['qty_rejected'] as number | undefined,
        rejectDisposition: line['reject_disposition'] as InventoryRejectDisposition | undefined,
      })),
    });
  }

  @Post('grn/:id/receive')
  async receive(@CurrentPrincipal() principal: Principal, @Param('id') id: string) {
    const receipt = await this.prisma.goodsReceipt.findUnique({
      where: { id },
      select: { ownerOrgId: true },
    });
    if (!receipt) {
      throw Errors.notFound('Goods receipt not found.');
    }
    await assertVendorSellerAccess(this.prisma, principal, receipt.ownerOrgId);
    return this.inventory.receiveGoodsReceipt(principal, id);
  }

  @Post('grn/:id/post')
  async post(@CurrentPrincipal() principal: Principal, @Param('id') id: string) {
    const receipt = await this.prisma.goodsReceipt.findUnique({
      where: { id },
      select: { ownerOrgId: true },
    });
    if (!receipt) {
      throw Errors.notFound('Goods receipt not found.');
    }
    await assertVendorSellerAccess(this.prisma, principal, receipt.ownerOrgId);
    return this.inventory.postGoodsReceipt(principal, id);
  }

  @Post('adjustments')
  async adjust(@CurrentPrincipal() principal: Principal, @Body() body: Record<string, unknown>) {
    if (!body['lot_id'] || body['qty_delta'] === undefined || !body['reason_code'] || !body['idempotency_key']) {
      throw Errors.validation('lot_id, qty_delta, reason_code and idempotency_key are required.');
    }
    const lotId = String(body['lot_id']);
    const lot = await this.prisma.inventoryLot.findUnique({
      where: { id: lotId },
      select: { ownerOrgId: true },
    });
    if (!lot) {
      throw Errors.notFound('Lot not found.');
    }
    await assertVendorSellerAccess(this.prisma, principal, lot.ownerOrgId);
    return this.inventory.adjust(principal, {
      lotId,
      qtyDelta: Number(body['qty_delta']),
      reasonCode: String(body['reason_code']),
      idempotencyKey: String(body['idempotency_key']),
    });
  }

  @Get('transfers')
  async transfers(@CurrentPrincipal() principal: Principal, @Query('owner_org_id') ownerOrgId: string) {
    if (!ownerOrgId) {
      throw Errors.validation('owner_org_id is required.');
    }
    await assertVendorSellerAccess(this.prisma, principal, ownerOrgId);
    const rows = await this.inventory.listTransfers(principal, ownerOrgId);
    return {
      data: rows.map((row) => ({
        id: row.id,
        status: row.status,
        from_location_id: row.fromLocationId,
        to_location_id: row.toLocationId,
        owner_org_id: row.ownerOrgId,
        created_at: row.createdAt,
      })),
    };
  }

  @Post('transfers')
  async createTransfer(@CurrentPrincipal() principal: Principal, @Body() body: Record<string, unknown>) {
    if (!body['from_location_id'] || !body['to_location_id'] || !body['owner_org_id'] || !body['idempotency_key']) {
      throw Errors.validation('from_location_id, to_location_id, owner_org_id and idempotency_key are required.');
    }
    const ownerOrgId = String(body['owner_org_id']);
    await assertVendorSellerAccess(this.prisma, principal, ownerOrgId);
    return this.inventory.createTransfer(principal, {
      fromLocationId: String(body['from_location_id']),
      toLocationId: String(body['to_location_id']),
      ownerOrgId,
      idempotencyKey: String(body['idempotency_key']),
      lines: ((body['lines'] as Record<string, unknown>[]) ?? []).map((line) => ({
        variantId: String(line['variant_id']),
        sourceLotId: String(line['source_lot_id']),
        qty: Number(line['qty']),
      })),
    });
  }

  @Post('transfers/:id/reserve')
  async reserveTransfer(@CurrentPrincipal() principal: Principal, @Param('id') id: string) {
    await this.assertVendorTransferAccess(principal, id);
    return this.inventory.reserveTransfer(principal, id);
  }

  @Post('transfers/:id/dispatch')
  async dispatch(@CurrentPrincipal() principal: Principal, @Param('id') id: string) {
    await this.assertVendorTransferAccess(principal, id);
    return this.inventory.dispatchTransfer(principal, id);
  }

  @Post('transfers/:id/receive')
  async receiveTransfer(@CurrentPrincipal() principal: Principal, @Param('id') id: string) {
    await this.assertVendorTransferAccess(principal, id);
    return this.inventory.receiveTransfer(principal, id);
  }

  private async assertVendorTransferAccess(principal: Principal, transferId: string): Promise<void> {
    const transfer = await this.prisma.stockTransfer.findUnique({
      where: { id: transferId },
      select: { ownerOrgId: true },
    });
    if (!transfer) {
      throw Errors.notFound('Transfer not found.');
    }
    await assertVendorSellerAccess(this.prisma, principal, transfer.ownerOrgId);
  }
}
