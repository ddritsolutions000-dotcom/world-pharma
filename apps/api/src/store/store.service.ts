import { Injectable } from '@nestjs/common';
import { InventoryLotStatus, OrderStatus, PackTaskStatus, PickTaskStatus } from '@prisma/client';
import { PrismaService } from '../app/prisma.service';
import { DispensingService } from '../clinical/dispensing.service';
import { Errors } from '../common/problem';
import type { Principal } from '../identity/current-principal';
import { assertInventoryOwner, requireInventoryLocation } from '../inventory/access';
import { InventoryService } from '../inventory/inventory.service';
import { OrderService } from '../orders/order.service';

const QUEUE_STATUSES: OrderStatus[] = [
  OrderStatus.CONFIRMED,
  OrderStatus.ALLOCATED,
  OrderStatus.PICKING,
  OrderStatus.PICKED,
  OrderStatus.PACKING,
  OrderStatus.PACKED,
  OrderStatus.READY_TO_SHIP,
];

@Injectable()
export class StoreService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly orders: OrderService,
    private readonly dispensing: DispensingService,
  ) {}

  async dashboard(principal: Principal, organizationId: string, locationId: string) {
    await this.assertScope(principal, organizationId, locationId);
    const now = new Date();
    const expiringBefore = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const [queueCount, expiringLots, exceptionPick, exceptionPack] = await Promise.all([
      this.prisma.order.count({
        where: {
          sellerOrgId: organizationId,
          fulfillingLocationId: locationId,
          status: { in: QUEUE_STATUSES },
        },
      }),
      this.prisma.inventoryLot.count({
        where: {
          ownerOrgId: organizationId,
          locationId,
          status: InventoryLotStatus.ACTIVE,
          expiresOn: { lte: expiringBefore },
        },
      }),
      this.prisma.pickTask.count({
        where: {
          status: PickTaskStatus.OPEN,
          group: { locationId, order: { sellerOrgId: organizationId } },
        },
      }),
      this.prisma.packTask.count({
        where: {
          status: { in: [PackTaskStatus.OPEN, PackTaskStatus.IN_PROGRESS] },
          group: { locationId, order: { sellerOrgId: organizationId } },
        },
      }),
    ]);
    return {
      location_id: locationId,
      organization_id: organizationId,
      queue_count: queueCount,
      expiring_lots: expiringLots,
      open_pick_tasks: exceptionPick,
      open_pack_tasks: exceptionPack,
      sandbox: true,
    };
  }

  async lots(principal: Principal, organizationId: string, locationId: string, cursor?: string) {
    await this.assertScope(principal, organizationId, locationId);
    return this.inventory.listLots(principal, { ownerOrgId: organizationId, locationId, cursor });
  }

  async createGrn(
    principal: Principal,
    organizationId: string,
    locationId: string,
    body: Record<string, unknown>,
  ) {
    await this.assertScope(principal, organizationId, locationId);
    if (!body['idempotency_key']) {
      throw Errors.validation('idempotency_key is required.');
    }
    return this.inventory.createGoodsReceipt(principal, {
      locationId,
      ownerOrgId: organizationId,
      idempotencyKey: String(body['idempotency_key']),
      lines: ((body['lines'] as Record<string, unknown>[]) ?? []).map((line) => ({
        variantId: String(line['variant_id']),
        lotCode: line['lot_code'] as string | undefined,
        expiresOn: line['expires_on'] as string | undefined,
        qty: Number(line['qty'] ?? 0),
      })),
    });
  }

  async adjust(
    principal: Principal,
    organizationId: string,
    locationId: string,
    body: Record<string, unknown>,
  ) {
    await this.assertScope(principal, organizationId, locationId);
    return this.inventory.adjust(principal, {
      lotId: String(body['lot_id']),
      qtyDelta: Number(body['qty_delta'] ?? body['delta'] ?? 0),
      reasonCode: String(body['reason_code'] ?? 'store_adjust'),
      idempotencyKey: String(body['idempotency_key']),
    });
  }

  async queue(principal: Principal, organizationId: string, locationId: string) {
    await this.assertScope(principal, organizationId, locationId);
    const rows = await this.prisma.order.findMany({
      where: {
        sellerOrgId: organizationId,
        fulfillingLocationId: locationId,
        status: { in: QUEUE_STATUSES },
      },
      orderBy: { createdAt: 'asc' },
      take: 50,
      include: {
        items: true,
        shipments: true,
      },
    });
    return {
      data: rows.map((row) => ({
        id: row.id,
        order_number: row.orderNumber,
        status: row.status,
        item_count: row.items.length,
        shipment_status: row.shipments[0]?.status ?? null,
        dispensing_case_id: row.dispensingCaseId,
        created_at: row.createdAt,
      })),
    };
  }

  async startPick(principal: Principal, organizationId: string, locationId: string, orderId: string) {
    await this.assertOrderScope(principal, organizationId, locationId, orderId);
    return this.orders.startPick(principal, orderId);
  }

  async completePick(principal: Principal, organizationId: string, locationId: string, orderId: string) {
    await this.assertOrderScope(principal, organizationId, locationId, orderId);
    return this.orders.completePick(principal, orderId);
  }

  async completePack(principal: Principal, organizationId: string, locationId: string, orderId: string) {
    await this.assertOrderScope(principal, organizationId, locationId, orderId);
    return this.orders.completePack(principal, orderId);
  }

  async readyToShip(principal: Principal, organizationId: string, locationId: string, orderId: string) {
    await this.assertOrderScope(principal, organizationId, locationId, orderId);
    return this.orders.markReadyToShip(principal, orderId);
  }

  async exceptions(principal: Principal, organizationId: string, locationId: string) {
    await this.assertScope(principal, organizationId, locationId);
    const picks = await this.prisma.pickTask.findMany({
      where: {
        status: { in: [PickTaskStatus.OPEN, PickTaskStatus.IN_PROGRESS] },
        group: { locationId, order: { sellerOrgId: organizationId } },
      },
      take: 50,
      include: { group: { include: { order: true } } },
    });
    const packs = await this.prisma.packTask.findMany({
      where: {
        status: { in: [PackTaskStatus.OPEN, PackTaskStatus.IN_PROGRESS] },
        group: { locationId, order: { sellerOrgId: organizationId } },
      },
      take: 50,
      include: { group: { include: { order: true } } },
    });
    return {
      pick_tasks: picks.map((row) => ({
        id: row.id,
        order_id: row.group.orderId,
        order_number: row.group.order.orderNumber,
        status: row.status,
        required_qty: row.requiredQty,
        picked_qty: row.pickedQty,
      })),
      pack_tasks: packs.map((row) => ({
        id: row.id,
        order_id: row.group.orderId,
        order_number: row.group.order.orderNumber,
        status: row.status,
        exception: row.exception,
      })),
    };
  }

  async locations(principal: Principal, organizationId: string) {
    await assertInventoryOwner(this.prisma, principal, organizationId);
    const rows = await this.inventory.listLocations(principal, organizationId);
    return {
      data: rows.map((row) => ({
        id: row.id,
        name: row.name,
        kind: row.kind,
        organization_id: row.organizationId,
      })),
    };
  }

  async organizations(principal: Principal) {
    const memberships = await this.prisma.membership.findMany({
      where: {
        personId: principal.personId,
        status: 'ACTIVE',
        deletedAt: null,
        organizationId: { not: null },
      },
      include: {
        organization: { select: { id: true, displayName: true, legalName: true } },
      },
    });
    const seen = new Map<string, { id: string; display_name: string; legal_name: string }>();
    for (const row of memberships) {
      if (row.organization && !seen.has(row.organization.id)) {
        seen.set(row.organization.id, {
          id: row.organization.id,
          display_name: row.organization.displayName,
          legal_name: row.organization.legalName,
        });
      }
    }
    return { data: [...seen.values()] };
  }

  async markGrnReceived(principal: Principal, organizationId: string, locationId: string, receiptId: string) {
    await this.assertScope(principal, organizationId, locationId);
    const receipt = await this.prisma.goodsReceipt.findUnique({ where: { id: receiptId } });
    if (!receipt || receipt.ownerOrgId !== organizationId || receipt.locationId !== locationId) {
      throw Errors.forbidden('You cannot receive goods receipts for another location.');
    }
    return this.inventory.receiveGoodsReceipt(principal, receiptId);
  }

  async postGrn(principal: Principal, organizationId: string, locationId: string, receiptId: string) {
    await this.assertScope(principal, organizationId, locationId);
    const receipt = await this.prisma.goodsReceipt.findUnique({ where: { id: receiptId } });
    if (!receipt || receipt.ownerOrgId !== organizationId || receipt.locationId !== locationId) {
      throw Errors.forbidden('You cannot post goods receipts for another location.');
    }
    return this.inventory.postGoodsReceipt(principal, receiptId);
  }

  async listDispensingCases(principal: Principal, organizationId: string, locationId: string) {
    await this.assertScope(principal, organizationId, locationId);
    return this.dispensing.listStoreQueue(principal, organizationId, locationId);
  }

  async getDispensingCase(
    principal: Principal,
    organizationId: string,
    locationId: string,
    caseId: string,
  ) {
    await this.assertScope(principal, organizationId, locationId);
    return this.dispensing.getStoreCase(principal, organizationId, locationId, caseId);
  }

  async claimDispensingCase(
    principal: Principal,
    organizationId: string,
    locationId: string,
    caseId: string,
    idempotencyKey: string,
  ) {
    await this.assertScope(principal, organizationId, locationId);
    return this.dispensing.claim(principal, organizationId, locationId, caseId, idempotencyKey);
  }

  async validateDispensingCase(
    principal: Principal,
    organizationId: string,
    locationId: string,
    caseId: string,
    idempotencyKey: string,
  ) {
    await this.assertScope(principal, organizationId, locationId);
    return this.dispensing.startValidate(principal, organizationId, locationId, caseId, idempotencyKey);
  }

  async rejectDispensingCase(
    principal: Principal,
    organizationId: string,
    locationId: string,
    caseId: string,
    input: { reason_code: string; idempotency_key: string },
  ) {
    await this.assertScope(principal, organizationId, locationId);
    return this.dispensing.reject(principal, organizationId, locationId, caseId, input);
  }

  async authorizeDispensingCase(
    principal: Principal,
    organizationId: string,
    locationId: string,
    caseId: string,
    idempotencyKey: string,
  ) {
    await this.assertScope(principal, organizationId, locationId);
    return this.dispensing.authorize(principal, organizationId, locationId, caseId, idempotencyKey);
  }

  async mapDispensingLines(
    principal: Principal,
    organizationId: string,
    locationId: string,
    caseId: string,
    input: {
      lines: Array<{
        prescription_line_id: string;
        catalog_item_id: string;
        catalog_variant_id: string;
        inventory_lot_id: string;
        quantity_dispensed: string;
        confirm_substitution?: boolean;
      }>;
      idempotency_key: string;
    },
  ) {
    await this.assertScope(principal, organizationId, locationId);
    return this.dispensing.mapLines(principal, organizationId, locationId, caseId, input);
  }

  async completeDispensingCase(
    principal: Principal,
    organizationId: string,
    locationId: string,
    caseId: string,
    idempotencyKey: string,
  ) {
    await this.assertScope(principal, organizationId, locationId);
    return this.dispensing.complete(principal, organizationId, locationId, caseId, idempotencyKey);
  }

  async listDispensingLots(
    principal: Principal,
    organizationId: string,
    locationId: string,
    variantId: string,
  ) {
    await this.assertScope(principal, organizationId, locationId);
    return this.dispensing.listEligibleLots(principal, organizationId, locationId, variantId);
  }

  private async assertScope(principal: Principal, organizationId: string, locationId: string) {
    await assertInventoryOwner(this.prisma, principal, organizationId, locationId);
    await requireInventoryLocation(this.prisma, locationId, organizationId);
  }

  private async assertOrderScope(
    principal: Principal,
    organizationId: string,
    locationId: string,
    orderId: string,
  ) {
    await this.assertScope(principal, organizationId, locationId);
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (
      !order ||
      order.sellerOrgId !== organizationId ||
      order.fulfillingLocationId !== locationId
    ) {
      throw Errors.forbidden('You cannot fulfill orders for another location.');
    }
  }
}
