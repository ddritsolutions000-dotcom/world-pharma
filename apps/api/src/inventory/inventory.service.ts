import { Injectable } from '@nestjs/common';
import {
  GoodsReceiptStatus,
  InventoryLotStatus,
  InventoryMovementType,
  InventoryRejectDisposition,
  InventoryReservationPurpose,
  InventoryReservationStatus,
  LocationKind,
  Prisma,
  RegulatedClass,
  StockTransferStatus,
} from '@prisma/client';
import { uuidv7 } from '@world-pharma/shared';
import { PrismaService } from '../app/prisma.service';
import { Errors } from '../common/problem';
import { OutboxService } from '../events/outbox.service';
import type { Principal } from '../identity/current-principal';
import { SecurityEventsService } from '../identity/security-events.service';
import { PolicyResolver } from '../policy/resolver';
import { workerTenantContext } from '../tenancy/build-tenant-context';
import {
  assertInventoryOwner,
  INVENTORY_LOCATION_KINDS,
  isPlatformOperator,
  locationScopeIds,
  requireInventoryLocation,
} from './access';
import {
  releaseCheckoutReservationsForPaymentFailure,
  type CheckoutReservationReleaseResult,
} from './checkout-reservation-release';

type Tx = Prisma.TransactionClient;

const REGULATED = new Set<RegulatedClass>([RegulatedClass.RX, RegulatedClass.CONTROLLED]);

function availableOf(row: {
  onHand: number;
  reserved: number;
  damaged: number;
  expired: number;
  quarantined: number;
  returned: number;
}): number {
  return row.onHand - row.reserved - row.damaged - row.expired - row.quarantined - row.returned;
}

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly events: SecurityEventsService,
    private readonly policy: PolicyResolver,
  ) {}

  async createLocation(
    principal: Principal,
    input: {
      organizationId: string;
      kind: LocationKind;
      name: string;
      timezone?: string;
      fulfillmentCapable?: boolean;
      region?: string;
      city?: string;
      postalCode?: string;
      addressLine?: string;
    },
  ) {
    await assertInventoryOwner(this.prisma, principal, input.organizationId);
    if (!INVENTORY_LOCATION_KINDS.includes(input.kind)) {
      throw Errors.validation('kind must be STORE, WAREHOUSE, or VENDOR_WAREHOUSE.');
    }
    const org = await this.prisma.organization.findUnique({ where: { id: input.organizationId } });
    if (!org) {
      throw Errors.notFound('Organization not found.');
    }
    const country = await this.prisma.country.findUnique({ where: { id: org.countryId } });
    const timezone = input.timezone?.trim() || country?.defaultTimezone || 'UTC';
    return this.prisma.$transaction(async (tx) => {
      const location = await tx.location.create({
        data: {
          id: uuidv7(),
          organizationId: org.id,
          countryId: org.countryId,
          kind: input.kind,
          name: input.name,
          region: input.region,
          city: input.city,
          postalCode: input.postalCode,
          addressLine: input.addressLine,
          timezone,
        },
      });
      if (input.kind === LocationKind.WAREHOUSE || input.kind === LocationKind.VENDOR_WAREHOUSE) {
        await tx.warehouseProfile.create({
          data: {
            id: uuidv7(),
            locationId: location.id,
            organizationId: org.id,
            timezone,
            fulfillmentCapable: input.fulfillmentCapable ?? false,
          },
        });
      }
      return tx.location.findUniqueOrThrow({
        where: { id: location.id },
        include: { warehouseProfile: true },
      });
    });
  }

  async listLocations(principal: Principal, organizationId: string) {
    await assertInventoryOwner(this.prisma, principal, organizationId);
    const scoped = await locationScopeIds(this.prisma, principal.personId);
    const operator = await isPlatformOperator(this.prisma, principal.personId);
    return this.prisma.location.findMany({
      where: {
        organizationId,
        kind: { in: INVENTORY_LOCATION_KINDS },
        ...(scoped && !operator ? { id: { in: scoped } } : {}),
      },
      include: { warehouseProfile: true },
      orderBy: { name: 'asc' },
    });
  }

  async listLots(
    principal: Principal,
    query: { ownerOrgId: string; locationId?: string; variantId?: string; cursor?: string },
  ) {
    await assertInventoryOwner(this.prisma, principal, query.ownerOrgId, query.locationId);
    const scoped = await locationScopeIds(this.prisma, principal.personId);
    const operator = await isPlatformOperator(this.prisma, principal.personId);
    const rows = await this.prisma.inventoryLot.findMany({
      where: {
        ownerOrgId: query.ownerOrgId,
        ...(query.locationId ? { locationId: query.locationId } : {}),
        ...(query.variantId ? { variantId: query.variantId } : {}),
        ...(scoped && !operator ? { locationId: { in: scoped } } : {}),
        ...(query.cursor ? { id: { gt: query.cursor } } : {}),
      },
      include: { balance: true, variant: true, location: true },
      take: 51,
      orderBy: { id: 'asc' },
    });
    const page = rows.slice(0, 50);
    return {
      data: page.map((row) => this.serializeLot(row)),
      next_cursor: rows.length > 50 ? page[page.length - 1]?.id : null,
    };
  }

  async getLot(principal: Principal, lotId: string) {
    const lot = await this.prisma.inventoryLot.findUnique({
      where: { id: lotId },
      include: { balance: true, variant: true, location: true },
    });
    if (!lot) {
      throw Errors.notFound('Lot not found.');
    }
    await assertInventoryOwner(this.prisma, principal, lot.ownerOrgId, lot.locationId);
    return this.serializeLot(lot);
  }

  async listMovements(principal: Principal, query: { ownerOrgId: string; lotId?: string; cursor?: string }) {
    await assertInventoryOwner(this.prisma, principal, query.ownerOrgId);
    const scoped = await locationScopeIds(this.prisma, principal.personId);
    const operator = await isPlatformOperator(this.prisma, principal.personId);
    const rows = await this.prisma.inventoryMovement.findMany({
      where: {
        lot: {
          ownerOrgId: query.ownerOrgId,
          ...(query.lotId ? { id: query.lotId } : {}),
          ...(scoped && !operator ? { locationId: { in: scoped } } : {}),
        },
        ...(query.cursor ? { id: { lt: query.cursor } } : {}),
      },
      include: { lot: { select: { ownerOrgId: true, locationId: true, variantId: true, lotCode: true } } },
      take: 51,
      orderBy: { id: 'desc' },
    });
    const page = rows.slice(0, 50);
    return { data: page, next_cursor: rows.length > 50 ? page[page.length - 1]?.id : null };
  }

  async createGoodsReceipt(
    principal: Principal,
    input: {
      locationId: string;
      ownerOrgId: string;
      idempotencyKey: string;
      lines: {
        variantId: string;
        lotCode?: string;
        expiresOn?: string;
        manufacturedOn?: string;
        qty: number;
        qtyAccepted?: number;
        qtyRejected?: number;
        rejectDisposition?: InventoryRejectDisposition;
      }[];
    },
  ) {
    await assertInventoryOwner(this.prisma, principal, input.ownerOrgId, input.locationId);
    const existing = await this.prisma.goodsReceipt.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      include: { lines: true },
    });
    if (existing) {
      return existing;
    }
    const location = await requireInventoryLocation(this.prisma, input.locationId, input.ownerOrgId);
    if (!input.lines.length) {
      throw Errors.validation('At least one receipt line is required.');
    }
    return this.prisma.goodsReceipt.create({
      data: {
        id: uuidv7(),
        locationId: location.id,
        ownerOrgId: input.ownerOrgId,
        countryId: location.countryId,
        actorPersonId: principal.personId,
        idempotencyKey: input.idempotencyKey,
        lines: {
          create: input.lines.map((line) => ({
            id: uuidv7(),
            variantId: line.variantId,
            lotCode: line.lotCode ?? '',
            expiresOn: line.expiresOn ? new Date(line.expiresOn) : null,
            manufacturedOn: line.manufacturedOn ? new Date(line.manufacturedOn) : null,
            qty: line.qty,
            qtyAccepted: line.qtyAccepted ?? line.qty,
            qtyRejected: line.qtyRejected ?? 0,
            rejectDisposition: line.rejectDisposition,
          })),
        },
      },
      include: { lines: true },
    });
  }

  async receiveGoodsReceipt(principal: Principal, receiptId: string) {
    const receipt = await this.prisma.goodsReceipt.findUnique({ where: { id: receiptId } });
    if (!receipt) {
      throw Errors.notFound('Goods receipt not found.');
    }
    await assertInventoryOwner(this.prisma, principal, receipt.ownerOrgId, receipt.locationId);
    if (receipt.status !== GoodsReceiptStatus.DRAFT) {
      throw Errors.conflict('Only DRAFT receipts can be marked received.');
    }
    return this.prisma.goodsReceipt.update({
      where: { id: receiptId },
      data: { status: GoodsReceiptStatus.RECEIVED, receivedAt: new Date(), actorPersonId: principal.personId },
      include: { lines: true },
    });
  }

  async postGoodsReceipt(principal: Principal, receiptId: string) {
    const receipt = await this.prisma.goodsReceipt.findUnique({
      where: { id: receiptId },
      include: { lines: true },
    });
    if (!receipt) {
      throw Errors.notFound('Goods receipt not found.');
    }
    await assertInventoryOwner(this.prisma, principal, receipt.ownerOrgId, receipt.locationId);
    if (receipt.status === GoodsReceiptStatus.POSTED) {
      return receipt;
    }
    if (receipt.status !== GoodsReceiptStatus.DRAFT && receipt.status !== GoodsReceiptStatus.RECEIVED) {
      throw Errors.conflict('Receipt cannot be posted from this status.');
    }
    const posted = await this.prisma.$transaction(async (tx) => {
      for (const line of receipt.lines) {
        await this.assertLotRules(tx, line.variantId, receipt.countryId, line.lotCode, line.expiresOn);
        if (line.qtyAccepted > 0) {
          const lot = await this.ensureLot(tx, {
            variantId: line.variantId,
            locationId: receipt.locationId,
            ownerOrgId: receipt.ownerOrgId,
            countryId: receipt.countryId,
            lotCode: line.lotCode,
            expiresOn: line.expiresOn,
            manufacturedOn: line.manufacturedOn,
          });
          await this.apply(tx, {
            lotId: lot.id,
            type: InventoryMovementType.RECEIPT,
            qty: line.qtyAccepted,
            reasonCode: 'grn_post',
            actorPersonId: principal.personId,
            idempotencyKey: `grn:${receipt.id}:${line.id}:accept`,
            refType: 'GoodsReceipt',
            refId: receipt.id,
            delta: { onHand: line.qtyAccepted },
          });
          await tx.goodsReceiptLine.update({ where: { id: line.id }, data: { lotId: lot.id } });
        }
        if (line.qtyRejected > 0) {
          const lot = await this.ensureLot(tx, {
            variantId: line.variantId,
            locationId: receipt.locationId,
            ownerOrgId: receipt.ownerOrgId,
            countryId: receipt.countryId,
            lotCode: line.lotCode,
            expiresOn: line.expiresOn,
            manufacturedOn: line.manufacturedOn,
          });
          const disposition = line.rejectDisposition ?? InventoryRejectDisposition.QUARANTINE;
          await this.apply(tx, {
            lotId: lot.id,
            type: InventoryMovementType.RECEIPT,
            qty: line.qtyRejected,
            reasonCode: 'grn_reject',
            actorPersonId: principal.personId,
            idempotencyKey: `grn:${receipt.id}:${line.id}:reject-in`,
            refType: 'GoodsReceipt',
            refId: receipt.id,
            delta: { onHand: line.qtyRejected },
          });
          await this.apply(tx, {
            lotId: lot.id,
            type:
              disposition === InventoryRejectDisposition.DAMAGE
                ? InventoryMovementType.DAMAGE
                : InventoryMovementType.QUARANTINE,
            qty: line.qtyRejected,
            reasonCode: 'grn_reject',
            actorPersonId: principal.personId,
            idempotencyKey: `grn:${receipt.id}:${line.id}:reject-move`,
            refType: 'GoodsReceipt',
            refId: receipt.id,
            delta:
              disposition === InventoryRejectDisposition.DAMAGE
                ? { damaged: line.qtyRejected }
                : { quarantined: line.qtyRejected },
          });
        }
      }
      const updated = await tx.goodsReceipt.update({
        where: { id: receipt.id },
        data: {
          status: GoodsReceiptStatus.POSTED,
          postedAt: new Date(),
          receivedAt: receipt.receivedAt ?? new Date(),
          actorPersonId: principal.personId,
        },
        include: { lines: true },
      });
      await this.outbox.enqueue(tx, {
        type: 'INVENTORY_RECEIVED',
        aggregateType: 'GoodsReceipt',
        aggregateId: receipt.id,
        producer: 'inventory',
        countryId: receipt.countryId,
        actorId: principal.personId,
        payload: { location_id: receipt.locationId, owner_org_id: receipt.ownerOrgId },
        occurrenceKey: `post:${receipt.id}`,
      });
      return updated;
    });
    await this.events.emit({
      type: 'INVENTORY_RECEIVED',
      outcome: 'success',
      personId: principal.personId,
      metadata: { goods_receipt_id: receipt.id },
    });
    return posted;
  }

  async adjust(
    principal: Principal,
    input: { lotId: string; qtyDelta: number; reasonCode: string; idempotencyKey: string },
  ) {
    if (!input.reasonCode?.trim()) {
      throw Errors.validation('reason_code is required.');
    }
    if (input.qtyDelta === 0) {
      throw Errors.validation('qty_delta cannot be zero.');
    }
    const lot = await this.prisma.inventoryLot.findUnique({ where: { id: input.lotId } });
    if (!lot) {
      throw Errors.notFound('Lot not found.');
    }
    await assertInventoryOwner(this.prisma, principal, lot.ownerOrgId, lot.locationId);
    const existing = await this.prisma.inventoryMovement.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) {
      return this.getLot(principal, lot.id);
    }
    await this.prisma.$transaction(async (tx) => {
      await this.apply(tx, {
        lotId: lot.id,
        type: InventoryMovementType.ADJUSTMENT,
        qty: Math.abs(input.qtyDelta),
        reasonCode: input.reasonCode,
        actorPersonId: principal.personId,
        idempotencyKey: input.idempotencyKey,
        refType: 'Adjustment',
        refId: lot.id,
        delta: { onHand: input.qtyDelta },
      });
      await this.outbox.enqueue(tx, {
        type: 'INVENTORY_ADJUSTED',
        aggregateType: 'InventoryLot',
        aggregateId: lot.id,
        producer: 'inventory',
        countryId: lot.countryId,
        actorId: principal.personId,
        payload: { qty_delta: input.qtyDelta, reason_code: input.reasonCode },
        occurrenceKey: input.idempotencyKey,
      });
    });
    await this.events.emit({
      type: 'INVENTORY_ADJUSTED',
      outcome: 'success',
      personId: principal.personId,
      metadata: { lot_id: lot.id, reason_code: input.reasonCode },
    });
    return this.getLot(principal, lot.id);
  }

  async moveBucket(
    principal: Principal,
    input: {
      lotId: string;
      qty: number;
      type: 'DAMAGE' | 'EXPIRY' | 'QUARANTINE' | 'UNQUARANTINE';
      reasonCode: string;
      idempotencyKey: string;
    },
  ) {
    const lot = await this.prisma.inventoryLot.findUnique({ where: { id: input.lotId } });
    if (!lot) {
      throw Errors.notFound('Lot not found.');
    }
    await assertInventoryOwner(this.prisma, principal, lot.ownerOrgId, lot.locationId);
    const existing = await this.prisma.inventoryMovement.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) {
      return this.getLot(principal, lot.id);
    }
    const spec = {
      DAMAGE: { type: InventoryMovementType.DAMAGE, delta: { damaged: input.qty }, event: 'INVENTORY_ADJUSTED' as const },
      EXPIRY: { type: InventoryMovementType.EXPIRY, delta: { expired: input.qty }, event: 'INVENTORY_EXPIRED' as const },
      QUARANTINE: {
        type: InventoryMovementType.QUARANTINE,
        delta: { quarantined: input.qty },
        event: 'INVENTORY_QUARANTINED' as const,
      },
      UNQUARANTINE: {
        type: InventoryMovementType.UNQUARANTINE,
        delta: { quarantined: -input.qty },
        event: 'INVENTORY_QUARANTINED' as const,
      },
    }[input.type];
    await this.prisma.$transaction(async (tx) => {
      await this.apply(tx, {
        lotId: lot.id,
        type: spec.type,
        qty: input.qty,
        reasonCode: input.reasonCode,
        actorPersonId: principal.personId,
        idempotencyKey: input.idempotencyKey,
        delta: spec.delta,
      });
      if (input.type === 'QUARANTINE') {
        await tx.inventoryLot.update({ where: { id: lot.id }, data: { status: InventoryLotStatus.QUARANTINE } });
      }
      if (input.type === 'UNQUARANTINE') {
        await tx.inventoryLot.update({ where: { id: lot.id }, data: { status: InventoryLotStatus.ACTIVE } });
      }
      if (input.type === 'EXPIRY') {
        await tx.inventoryLot.update({ where: { id: lot.id }, data: { status: InventoryLotStatus.EXPIRED } });
      }
      await this.outbox.enqueue(tx, {
        type: spec.event,
        aggregateType: 'InventoryLot',
        aggregateId: lot.id,
        producer: 'inventory',
        countryId: lot.countryId,
        actorId: principal.personId,
        payload: { type: input.type, qty: input.qty },
        occurrenceKey: input.idempotencyKey,
      });
    });
    return this.getLot(principal, lot.id);
  }

  async reserve(
    principal: Principal,
    input: {
      variantId: string;
      locationId: string;
      ownerOrgId: string;
      qty: number;
      ttlSeconds?: number;
      purpose?: InventoryReservationPurpose;
      idempotencyKey: string;
      preferredLotId?: string;
    },
  ) {
    if (input.purpose !== InventoryReservationPurpose.CHECKOUT) {
      await assertInventoryOwner(this.prisma, principal, input.ownerOrgId, input.locationId);
    }
    const existing = await this.prisma.inventoryReservation.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) {
      return existing;
    }
    await requireInventoryLocation(this.prisma, input.locationId, input.ownerOrgId);
    const location = await this.prisma.location.findUniqueOrThrow({ where: { id: input.locationId } });
    const ttlMs = (input.ttlSeconds ?? 900) * 1000;
    return this.serializable(async (tx) => {
        const existingInTx = await tx.inventoryReservation.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
        });
        if (existingInTx) {
          return existingInTx;
        }
        await this.expireDue(tx);
        const lotRows = input.preferredLotId
          ? await tx.$queryRaw<{ lot_id: string; available: number }[]>`
              SELECT lot_id, available
              FROM app.reservable_lots(
                ${input.variantId}::uuid,
                ${input.locationId}::uuid,
                ${input.ownerOrgId}::uuid,
                ${location.countryId}::uuid
              )
              WHERE lot_id = ${input.preferredLotId}::uuid
            `
          : await tx.$queryRaw<{ lot_id: string; available: number }[]>`
              SELECT lot_id, available
              FROM app.reservable_lots(
                ${input.variantId}::uuid,
                ${input.locationId}::uuid,
                ${input.ownerOrgId}::uuid,
                ${location.countryId}::uuid
              )
            `;
        if (lotRows.length === 0) {
          throw Errors.conflict('Insufficient available quantity.');
        }
        let remaining = input.qty;
        const allocated: { lotId: string; qty: number }[] = [];
        for (const lot of lotRows) {
          if (remaining <= 0) {
            break;
          }
          await tx.$executeRaw`SELECT id FROM inventory_lots WHERE id = ${lot.lot_id}::uuid FOR UPDATE`;
          const take = Math.min(remaining, Math.max(0, Number(lot.available)));
          if (take <= 0) {
            continue;
          }
          await this.apply(tx, {
            lotId: lot.lot_id,
            type: InventoryMovementType.RESERVATION,
            qty: take,
            reasonCode: 'reserve',
            actorPersonId: principal.personId,
            idempotencyKey: `${input.idempotencyKey}:${lot.lot_id}`,
            delta: { reserved: take },
          });
          allocated.push({ lotId: lot.lot_id, qty: take });
          remaining -= take;
        }
        if (remaining > 0) {
          throw Errors.conflict('Insufficient available quantity.');
        }
        const reservation = await tx.inventoryReservation.create({
          data: {
            id: uuidv7(),
            variantId: input.variantId,
            lotId: allocated.length === 1 ? allocated[0]?.lotId : null,
            locationId: input.locationId,
            ownerOrgId: input.ownerOrgId,
            qty: input.qty,
            status: InventoryReservationStatus.OPEN,
            purpose: input.purpose ?? InventoryReservationPurpose.MANUAL,
            expiresAt: new Date(Date.now() + ttlMs),
            idempotencyKey: input.idempotencyKey,
          },
        });
        await this.outbox.enqueue(tx, {
          type: 'INVENTORY_RESERVED',
          aggregateType: 'InventoryReservation',
          aggregateId: reservation.id,
          producer: 'inventory',
          actorId: principal.personId,
          payload: { qty: input.qty, lots: allocated },
          occurrenceKey: input.idempotencyKey,
        });
        return reservation;
    });
  }

  private async serializable<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    let last: unknown;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      try {
        return await this.prisma.$transaction(fn, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        last = error;
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw Errors.conflict('Concurrent stock update conflict.');
        }
        const retryable =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          (error.code === 'P2034' ||
            error.code === 'P2037' ||
            /deadlock|could not serialize/i.test(error.message));
        if (!retryable) {
          throw error;
        }
      }
    }
    throw Errors.conflict('Concurrent stock update conflict.');
  }

  async release(principal: Principal, reservationId: string, idempotencyKey: string) {
    const reservation = await this.prisma.inventoryReservation.findUnique({ where: { id: reservationId } });
    if (!reservation) {
      throw Errors.notFound('Reservation not found.');
    }
    await assertInventoryOwner(this.prisma, principal, reservation.ownerOrgId, reservation.locationId);
    if (reservation.status !== InventoryReservationStatus.OPEN) {
      return reservation;
    }
    return this.prisma.$transaction(async (tx) =>
      this.releaseReservation(tx, reservation, idempotencyKey, principal.personId, InventoryReservationStatus.RELEASED),
    );
  }

  async expireDueReservations(): Promise<number> {
    return this.prisma.$transaction((tx) => this.expireDue(tx));
  }

  async availableUnits(variantId: string, ownerOrgId: string, countryId: string): Promise<number> {
    const rows = await this.prisma.$queryRaw<{ qty: number }[]>`
      SELECT app.available_qty(${variantId}::uuid, ${ownerOrgId}::uuid, ${countryId}::uuid) AS qty
    `;
    return Number(rows[0]?.qty ?? 0);
  }

  async reserveForCheckout(input: {
    variantId: string;
    ownerOrgId: string;
    countryId: string;
    qty: number;
    actorPersonId: string;
    idempotencyKey: string;
    ttlSeconds?: number;
  }) {
    return this.prisma.runWithTenant(
      workerTenantContext({
        organizationId: input.ownerOrgId,
        countryId: input.countryId,
        personId: input.actorPersonId,
      }),
      () => this.reserveForCheckoutInner(input),
      { fresh: true },
    );
  }

  private async reserveForCheckoutInner(input: {
    variantId: string;
    ownerOrgId: string;
    countryId: string;
    qty: number;
    actorPersonId: string;
    idempotencyKey: string;
    ttlSeconds?: number;
  }) {
    const existing = await this.prisma.inventoryReservation.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (
      existing &&
      (existing.status === InventoryReservationStatus.OPEN ||
        existing.status === InventoryReservationStatus.CONSUMED)
    ) {
      return existing;
    }
    const picked = await this.prisma.$queryRaw<{ lot_id: string; location_id: string; available: number }[]>`
      SELECT lot_id, location_id, available
      FROM app.reservable_lot_for_checkout(
        ${input.variantId}::uuid,
        ${input.ownerOrgId}::uuid,
        ${input.countryId}::uuid
      )
    `;
    const lot = picked[0];
    if (!lot?.lot_id || !lot.location_id || Number(lot.available) < input.qty) {
      throw Errors.conflict('Insufficient available quantity.');
    }
    return this.commitCheckoutReservation(
      {
        personId: input.actorPersonId,
        sessionId: input.actorPersonId,
        audience: 'customer',
        roles: [],
        tokenVersion: 0,
      },
      {
        lotId: lot.lot_id,
        variantId: input.variantId,
        locationId: lot.location_id,
        ownerOrgId: input.ownerOrgId,
        qty: input.qty,
        available: Number(lot.available),
        ttlSeconds: input.ttlSeconds ?? 900,
        idempotencyKey: input.idempotencyKey,
      },
    );
  }

  private commitCheckoutReservation(
    principal: Principal,
    input: {
      lotId: string;
      variantId: string;
      locationId: string;
      ownerOrgId: string;
      qty: number;
      available: number;
      ttlSeconds: number;
      idempotencyKey: string;
    },
  ) {
    const ttlMs = input.ttlSeconds * 1000;
    return this.serializable(async (tx) => {
      const existingInTx = await tx.inventoryReservation.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (
        existingInTx &&
        (existingInTx.status === InventoryReservationStatus.OPEN ||
          existingInTx.status === InventoryReservationStatus.CONSUMED)
      ) {
        return existingInTx;
      }
      await this.expireDue(tx);
      if (input.available < input.qty) {
        throw Errors.conflict('Insufficient available quantity.');
      }
      await tx.$executeRaw`SELECT id FROM inventory_lots WHERE id = ${input.lotId}::uuid FOR UPDATE`;
      const reserveMovementKey = existingInTx
        ? `${input.idempotencyKey}:reopen:${input.lotId}`
        : `${input.idempotencyKey}:${input.lotId}`;
      await this.apply(tx, {
        lotId: input.lotId,
        type: InventoryMovementType.RESERVATION,
        qty: input.qty,
        reasonCode: existingInTx ? 'checkout_requote' : 'checkout_reserve',
        actorPersonId: principal.personId,
        idempotencyKey: reserveMovementKey,
        delta: { reserved: input.qty },
      });
      if (existingInTx) {
        const reopened = await tx.inventoryReservation.update({
          where: { id: existingInTx.id },
          data: {
            lotId: input.lotId,
            locationId: input.locationId,
            qty: input.qty,
            status: InventoryReservationStatus.OPEN,
            expiresAt: new Date(Date.now() + ttlMs),
          },
        });
        await this.outbox.enqueue(tx, {
          type: 'INVENTORY_RESERVED',
          aggregateType: 'InventoryReservation',
          aggregateId: reopened.id,
          producer: 'inventory',
          actorId: principal.personId,
          payload: { qty: input.qty, lots: [{ lotId: input.lotId, qty: input.qty }], reopened: true },
          occurrenceKey: `${input.idempotencyKey}:reopen`,
        });
        return reopened;
      }
      const reservation = await tx.inventoryReservation.create({
        data: {
          id: uuidv7(),
          variantId: input.variantId,
          lotId: input.lotId,
          locationId: input.locationId,
          ownerOrgId: input.ownerOrgId,
          qty: input.qty,
          status: InventoryReservationStatus.OPEN,
          purpose: InventoryReservationPurpose.CHECKOUT,
          expiresAt: new Date(Date.now() + ttlMs),
          idempotencyKey: input.idempotencyKey,
        },
      });
      await this.outbox.enqueue(tx, {
        type: 'INVENTORY_RESERVED',
        aggregateType: 'InventoryReservation',
        aggregateId: reservation.id,
        producer: 'inventory',
        actorId: principal.personId,
        payload: { qty: input.qty, lots: [{ lotId: input.lotId, qty: input.qty }] },
        occurrenceKey: input.idempotencyKey,
      });
      return reservation;
    });
  }

  async releaseByIds(ids: string[], actorPersonId: string): Promise<void> {
    for (const id of ids) {
      const reservation = await this.prisma.inventoryReservation.findUnique({ where: { id } });
      if (!reservation || reservation.status !== InventoryReservationStatus.OPEN) {
        continue;
      }
      await this.prisma.$transaction(async (tx) =>
        this.releaseReservation(
          tx,
          reservation,
          `checkout-release:${id}`,
          actorPersonId,
          InventoryReservationStatus.RELEASED,
        ),
      );
    }
  }

  releaseCheckoutReservationsForPaymentFailure(
    tx: Tx,
    input: {
      checkoutSessionId: string;
      customerPersonId: string;
      countryId: string;
      paymentIntentId: string;
    },
  ): Promise<CheckoutReservationReleaseResult> {
    return releaseCheckoutReservationsForPaymentFailure(
      tx,
      this.outbox,
      (innerTx, reservation, idempotencyKey, actorPersonId, status) =>
        this.releaseReservation(innerTx, reservation, idempotencyKey, actorPersonId, status),
      input,
    );
  }

  async consumeCheckoutReservations(
    tx: Tx,
    ids: string[],
    actorPersonId: string,
    orderId: string,
  ): Promise<Array<{ id: string; variantId: string; locationId: string; lotId: string | null; qty: number }>> {
    const consumed: Array<{ id: string; variantId: string; locationId: string; lotId: string | null; qty: number }> = [];
    for (const id of ids) {
      const reservation = await tx.inventoryReservation.findUnique({ where: { id } });
      if (!reservation) {
        throw Errors.problem(409, 'RESERVATION_MISSING', 'Reservation missing', 'Checkout reservation was not found.');
      }
      if (reservation.status === InventoryReservationStatus.CONSUMED) {
        consumed.push({
          id: reservation.id,
          variantId: reservation.variantId,
          locationId: reservation.locationId,
          lotId: reservation.lotId,
          qty: reservation.qty,
        });
        continue;
      }
      if (reservation.status !== InventoryReservationStatus.OPEN || reservation.purpose !== InventoryReservationPurpose.CHECKOUT) {
        throw Errors.problem(409, 'RESERVATION_UNAVAILABLE', 'Reservation unavailable', 'Checkout hold is not open.');
      }
      if (reservation.expiresAt <= new Date()) {
        throw Errors.problem(409, 'RESERVATION_EXPIRED', 'Reservation expired', 'Checkout inventory hold expired.');
      }
      if (!reservation.lotId) {
        throw Errors.problem(409, 'STOCK_UNAVAILABLE', 'Stock unavailable', 'Reservation has no lot to allocate.');
      }
      const lot = await tx.inventoryLot.findUnique({ where: { id: reservation.lotId } });
      if (
        !lot ||
        lot.status !== InventoryLotStatus.ACTIVE ||
        (lot.expiresOn && lot.expiresOn < new Date())
      ) {
        throw Errors.problem(409, 'LOT_UNAVAILABLE', 'Lot unavailable', 'Lot is expired, quarantined, or inactive. LEGAL/COMPLIANCE REVIEW REQUIRED for FEFO policy.');
      }
      await this.apply(tx, {
        lotId: reservation.lotId,
        type: InventoryMovementType.PICK,
        qty: reservation.qty,
        reasonCode: 'order_allocate',
        actorPersonId,
        idempotencyKey: `order-consume:${orderId}:${reservation.id}`,
        refType: 'Order',
        refId: orderId,
        delta: { reserved: -reservation.qty, onHand: -reservation.qty },
      });
      await tx.inventoryReservation.update({
        where: { id: reservation.id },
        data: { status: InventoryReservationStatus.CONSUMED },
      });
      consumed.push({
        id: reservation.id,
        variantId: reservation.variantId,
        locationId: reservation.locationId,
        lotId: reservation.lotId,
        qty: reservation.qty,
      });
    }
    return consumed;
  }

  /**
   * R5-C: hard consume sellable units for an authorized dispense (OD-R5C-02).
   * No Order / PaymentIntent. Locks lot; rejects expired/inactive; no negative stock.
   */
  async consumeForDispense(
    tx: Tx,
    input: {
      lotId: string;
      qty: number;
      actorPersonId: string;
      dispenseEventId: string;
      ownerOrgId: string;
      locationId: string;
    },
  ): Promise<void> {
    if (input.qty <= 0 || !Number.isFinite(input.qty)) {
      throw Errors.validation('Dispense quantity must be a positive number.');
    }
    await tx.$executeRaw`SELECT id FROM inventory_lots WHERE id = ${input.lotId}::uuid FOR UPDATE`;
    const lot = await tx.inventoryLot.findUnique({
      where: { id: input.lotId },
      include: { balance: true },
    });
    if (!lot || lot.ownerOrgId !== input.ownerOrgId || lot.locationId !== input.locationId) {
      throw Errors.problem(404, 'LOT_NOT_FOUND', 'Lot not found', 'Inventory lot is not available at this location.');
    }
    if (lot.status !== InventoryLotStatus.ACTIVE) {
      throw Errors.problem(409, 'LOT_UNAVAILABLE', 'Lot unavailable', 'Lot is not active.');
    }
    if (lot.expiresOn && lot.expiresOn < new Date()) {
      throw Errors.problem(409, 'LOT_EXPIRED', 'Lot expired', 'Expired lots cannot be dispensed.');
    }
    const balance = lot.balance;
    if (!balance) {
      throw Errors.notFound('Balance not found.');
    }
    const available =
      balance.onHand - balance.reserved - balance.damaged - balance.expired - balance.quarantined - balance.returned;
    if (available < input.qty) {
      throw Errors.conflict('Insufficient available quantity for dispense.');
    }
    await this.apply(tx, {
      lotId: input.lotId,
      type: InventoryMovementType.PICK,
      qty: input.qty,
      reasonCode: 'rx_dispense',
      actorPersonId: input.actorPersonId,
      idempotencyKey: `dispense-consume:${input.dispenseEventId}:${input.lotId}`,
      refType: 'DispenseEvent',
      refId: input.dispenseEventId,
      delta: { onHand: -input.qty },
    });
  }

  async createTransfer(
    principal: Principal,
    input: {
      fromLocationId: string;
      toLocationId: string;
      ownerOrgId: string;
      idempotencyKey: string;
      lines: { variantId: string; sourceLotId: string; qty: number }[];
    },
  ) {
    await assertInventoryOwner(this.prisma, principal, input.ownerOrgId, input.fromLocationId);
    const existing = await this.prisma.stockTransfer.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      include: { lines: true },
    });
    if (existing) {
      return existing;
    }
    const from = await requireInventoryLocation(this.prisma, input.fromLocationId, input.ownerOrgId);
    const to = await requireInventoryLocation(this.prisma, input.toLocationId, input.ownerOrgId);
    if (from.countryId !== to.countryId) {
      throw Errors.validation('Cross-border transfers are not enabled in this phase.');
    }
    if (from.id === to.id) {
      throw Errors.validation('Source and destination must differ.');
    }
    if (!input.lines.length) {
      throw Errors.validation('At least one transfer line is required.');
    }
    return this.prisma.stockTransfer.create({
      data: {
        id: uuidv7(),
        fromLocationId: from.id,
        toLocationId: to.id,
        ownerOrgId: input.ownerOrgId,
        countryId: from.countryId,
        actorPersonId: principal.personId,
        idempotencyKey: input.idempotencyKey,
        lines: {
          create: input.lines.map((line) => ({
            id: uuidv7(),
            variantId: line.variantId,
            sourceLotId: line.sourceLotId,
            qty: line.qty,
          })),
        },
      },
      include: { lines: true },
    });
  }

  async reserveTransfer(principal: Principal, transferId: string) {
    const transfer = await this.prisma.stockTransfer.findUnique({
      where: { id: transferId },
      include: { lines: true },
    });
    if (!transfer) {
      throw Errors.notFound('Transfer not found.');
    }
    await assertInventoryOwner(this.prisma, principal, transfer.ownerOrgId, transfer.fromLocationId);
    if (transfer.status !== StockTransferStatus.DRAFT) {
      return transfer;
    }
    return this.prisma.$transaction(async (tx) => {
      for (const line of transfer.lines) {
        await this.apply(tx, {
          lotId: line.sourceLotId,
          type: InventoryMovementType.RESERVATION,
          qty: line.qty,
          reasonCode: 'transfer_reserve',
          actorPersonId: principal.personId,
          idempotencyKey: `xfer-res:${transfer.id}:${line.id}`,
          refType: 'StockTransfer',
          refId: transfer.id,
          delta: { reserved: line.qty },
        });
        await tx.inventoryReservation.create({
          data: {
            id: uuidv7(),
            variantId: line.variantId,
            lotId: line.sourceLotId,
            locationId: transfer.fromLocationId,
            ownerOrgId: transfer.ownerOrgId,
            qty: line.qty,
            status: InventoryReservationStatus.OPEN,
            purpose: InventoryReservationPurpose.MANUAL,
            expiresAt: new Date(Date.now() + 86_400_000),
            idempotencyKey: `xfer-res:${transfer.id}:${line.id}`,
            transferId: transfer.id,
          },
        });
      }
      return tx.stockTransfer.update({
        where: { id: transfer.id },
        data: { status: StockTransferStatus.RESERVED, actorPersonId: principal.personId },
        include: { lines: true },
      });
    });
  }

  async dispatchTransfer(principal: Principal, transferId: string) {
    const transfer = await this.prisma.stockTransfer.findUnique({
      where: { id: transferId },
      include: { lines: true },
    });
    if (!transfer) {
      throw Errors.notFound('Transfer not found.');
    }
    await assertInventoryOwner(this.prisma, principal, transfer.ownerOrgId, transfer.fromLocationId);
    if (transfer.status === StockTransferStatus.IN_TRANSIT || transfer.status === StockTransferStatus.DISPATCHED) {
      return this.prisma.stockTransfer.findUniqueOrThrow({ where: { id: transferId }, include: { lines: true } });
    }
    if (transfer.status !== StockTransferStatus.RESERVED) {
      throw Errors.conflict('Transfer must be reserved before dispatch.');
    }
    return this.prisma.$transaction(async (tx) => {
      for (const line of transfer.lines) {
        await this.apply(tx, {
          lotId: line.sourceLotId,
          type: InventoryMovementType.RELEASE,
          qty: line.qty,
          reasonCode: 'transfer_dispatch_release',
          actorPersonId: principal.personId,
          idempotencyKey: `xfer-rel:${transfer.id}:${line.id}`,
          refType: 'StockTransfer',
          refId: transfer.id,
          delta: { reserved: -line.qty },
        });
        await this.apply(tx, {
          lotId: line.sourceLotId,
          type: InventoryMovementType.TRANSFER_OUT,
          qty: line.qty,
          reasonCode: 'transfer_out',
          actorPersonId: principal.personId,
          idempotencyKey: `xfer-out:${transfer.id}:${line.id}`,
          refType: 'StockTransfer',
          refId: transfer.id,
          delta: { onHand: -line.qty, inTransit: line.qty },
        });
        await tx.stockTransferLine.update({ where: { id: line.id }, data: { qtyInTransit: line.qty } });
      }
      await tx.inventoryReservation.updateMany({
        where: { transferId: transfer.id, status: InventoryReservationStatus.OPEN },
        data: { status: InventoryReservationStatus.CONSUMED },
      });
      const updated = await tx.stockTransfer.update({
        where: { id: transfer.id },
        data: { status: StockTransferStatus.IN_TRANSIT, actorPersonId: principal.personId },
        include: { lines: true },
      });
      await this.outbox.enqueue(tx, {
        type: 'INVENTORY_TRANSFERRED',
        aggregateType: 'StockTransfer',
        aggregateId: transfer.id,
        producer: 'inventory',
        countryId: transfer.countryId,
        actorId: principal.personId,
        payload: { status: 'IN_TRANSIT' },
        occurrenceKey: `dispatch:${transfer.id}`,
      });
      return updated;
    });
  }

  async receiveTransfer(principal: Principal, transferId: string) {
    const transfer = await this.prisma.stockTransfer.findUnique({
      where: { id: transferId },
      include: { lines: { include: { sourceLot: true } } },
    });
    if (!transfer) {
      throw Errors.notFound('Transfer not found.');
    }
    await assertInventoryOwner(this.prisma, principal, transfer.ownerOrgId, transfer.toLocationId);
    if (transfer.status === StockTransferStatus.RECEIVED) {
      return transfer;
    }
    if (transfer.status !== StockTransferStatus.IN_TRANSIT && transfer.status !== StockTransferStatus.DISPATCHED) {
      throw Errors.conflict('Transfer is not in transit.');
    }
    const received = await this.prisma.$transaction(async (tx) => {
      for (const line of transfer.lines) {
        const dest = await this.ensureLot(tx, {
          variantId: line.variantId,
          locationId: transfer.toLocationId,
          ownerOrgId: transfer.ownerOrgId,
          countryId: transfer.countryId,
          lotCode: line.sourceLot.lotCode,
          expiresOn: line.sourceLot.expiresOn,
          manufacturedOn: line.sourceLot.manufacturedOn,
        });
        await this.apply(tx, {
          lotId: line.sourceLotId,
          type: InventoryMovementType.TRANSFER_IN,
          qty: line.qty,
          reasonCode: 'transfer_source_clear',
          actorPersonId: principal.personId,
          idempotencyKey: `xfer-src-clear:${transfer.id}:${line.id}`,
          refType: 'StockTransfer',
          refId: transfer.id,
          delta: { inTransit: -line.qty },
        });
        await this.apply(tx, {
          lotId: dest.id,
          type: InventoryMovementType.TRANSFER_IN,
          qty: line.qty,
          reasonCode: 'transfer_in',
          actorPersonId: principal.personId,
          idempotencyKey: `xfer-in:${transfer.id}:${line.id}`,
          refType: 'StockTransfer',
          refId: transfer.id,
          delta: { onHand: line.qty },
        });
        await tx.stockTransferLine.update({
          where: { id: line.id },
          data: { destLotId: dest.id, qtyInTransit: 0, qtyReceived: line.qty },
        });
      }
      const updated = await tx.stockTransfer.update({
        where: { id: transfer.id },
        data: { status: StockTransferStatus.RECEIVED, actorPersonId: principal.personId },
        include: { lines: true },
      });
      await this.outbox.enqueue(tx, {
        type: 'INVENTORY_TRANSFERRED',
        aggregateType: 'StockTransfer',
        aggregateId: transfer.id,
        producer: 'inventory',
        countryId: transfer.countryId,
        actorId: principal.personId,
        payload: { status: 'RECEIVED' },
        occurrenceKey: `receive:${transfer.id}`,
      });
      return updated;
    });
    await this.events.emit({
      type: 'INVENTORY_TRANSFERRED',
      outcome: 'success',
      personId: principal.personId,
      metadata: { transfer_id: transfer.id },
    });
    return received;
  }

  async listTransfers(principal: Principal, ownerOrgId: string) {
    await assertInventoryOwner(this.prisma, principal, ownerOrgId);
    return this.prisma.stockTransfer.findMany({
      where: { ownerOrgId },
      include: { lines: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async listReceipts(principal: Principal, ownerOrgId: string) {
    await assertInventoryOwner(this.prisma, principal, ownerOrgId);
    return this.prisma.goodsReceipt.findMany({
      where: { ownerOrgId },
      include: { lines: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async availabilityForOffers(countryId: string, offers: { variantId: string; sellerOrgId: string }[]) {
    const inStock = new Set<string>();
    for (const offer of offers) {
      const qty = await this.availableUnits(offer.variantId, offer.sellerOrgId, countryId);
      if (qty > 0) {
        inStock.add(offer.variantId);
      }
    }
    return inStock;
  }

  private async apply(
    tx: Tx,
    input: {
      lotId: string;
      type: InventoryMovementType;
      qty: number;
      reasonCode: string;
      actorPersonId: string;
      idempotencyKey: string;
      refType?: string;
      refId?: string;
      correlationId?: string;
      delta: Partial<{
        onHand: number;
        reserved: number;
        damaged: number;
        expired: number;
        quarantined: number;
        returned: number;
        inTransit: number;
      }>;
    },
  ) {
    if (input.qty <= 0) {
      throw Errors.validation('Movement quantity must be positive.');
    }
    const dup = await tx.inventoryMovement.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (dup) {
      return;
    }
    await tx.$executeRaw`SELECT id FROM inventory_lots WHERE id = ${input.lotId}::uuid FOR UPDATE`;
    const balanceRows = await tx.$queryRaw<
      Array<{
        on_hand: number;
        reserved: number;
        damaged: number;
        expired: number;
        quarantined: number;
        returned: number;
        in_transit: number;
        available: number;
      }>
    >`SELECT * FROM app.get_balance_for_update(${input.lotId}::uuid)`;
    const row = balanceRows[0];
    if (!row) {
      throw Errors.notFound('Balance not found.');
    }
    const balance = {
      onHand: row.on_hand,
      reserved: row.reserved,
      damaged: row.damaged,
      expired: row.expired,
      quarantined: row.quarantined,
      returned: row.returned,
      inTransit: row.in_transit,
      available: row.available,
    };
    const next = {
      onHand: balance.onHand + (input.delta.onHand ?? 0),
      reserved: balance.reserved + (input.delta.reserved ?? 0),
      damaged: balance.damaged + (input.delta.damaged ?? 0),
      expired: balance.expired + (input.delta.expired ?? 0),
      quarantined: balance.quarantined + (input.delta.quarantined ?? 0),
      returned: balance.returned + (input.delta.returned ?? 0),
      inTransit: balance.inTransit + (input.delta.inTransit ?? 0),
    };
    const available = availableOf(next);
    if (
      next.onHand < 0 ||
      next.reserved < 0 ||
      next.damaged < 0 ||
      next.expired < 0 ||
      next.quarantined < 0 ||
      next.returned < 0 ||
      next.inTransit < 0 ||
      available < 0
    ) {
      throw Errors.conflict('Insufficient available quantity.');
    }
    await tx.inventoryBalance.update({
      where: { lotId: input.lotId },
      data: { ...next, available },
    });
    await tx.inventoryMovement.create({
      data: {
        id: uuidv7(),
        lotId: input.lotId,
        type: input.type,
        qty: input.qty,
        reasonCode: input.reasonCode,
        actorPersonId: input.actorPersonId,
        idempotencyKey: input.idempotencyKey,
        correlationId: input.correlationId,
        refType: input.refType,
        refId: input.refId,
      },
    });
  }

  private async ensureLot(
    tx: Tx,
    input: {
      variantId: string;
      locationId: string;
      ownerOrgId: string;
      countryId: string;
      lotCode: string;
      expiresOn: Date | null;
      manufacturedOn: Date | null;
    },
  ) {
    const found = await tx.inventoryLot.findUnique({
      where: {
        locationId_variantId_lotCode: {
          locationId: input.locationId,
          variantId: input.variantId,
          lotCode: input.lotCode,
        },
      },
    });
    if (found) {
      return found;
    }
    const lot = await tx.inventoryLot.create({
      data: {
        id: uuidv7(),
        variantId: input.variantId,
        locationId: input.locationId,
        ownerOrgId: input.ownerOrgId,
        countryId: input.countryId,
        lotCode: input.lotCode,
        expiresOn: input.expiresOn,
        manufacturedOn: input.manufacturedOn,
        status: InventoryLotStatus.ACTIVE,
      },
    });
    await tx.inventoryBalance.create({
      data: { id: uuidv7(), lotId: lot.id },
    });
    return lot;
  }

  private async assertLotRules(
    tx: Tx,
    variantId: string,
    countryId: string,
    lotCode: string,
    expiresOn: Date | null,
  ) {
    const variant = await tx.catalogVariant.findUnique({
      where: { id: variantId },
      include: { item: { include: { countries: true } } },
    });
    if (!variant) {
      throw Errors.notFound('Variant not found.');
    }
    const assortment = variant.item.countries.find((row) => row.countryId === countryId);
    const regulated = assortment ? REGULATED.has(assortment.regulatedClass) : false;
    if (regulated && !lotCode) {
      throw Errors.validation('Lot code is required for this regulated item.');
    }
    if (regulated && !expiresOn) {
      throw Errors.validation('Expiry date is required for this regulated item.');
    }
  }

  private async fefoRequired(countryId: string): Promise<boolean> {
    const country = await this.prisma.country.findUnique({ where: { id: countryId } });
    if (!country) {
      return false;
    }
    const resolved = await this.policy.resolvePublished(country.isoAlpha2);
    const inventory = (resolved?.document as { inventory?: { fefo_required?: boolean } } | undefined)?.inventory;
    return inventory?.fefo_required === true;
  }

  private async expireDue(tx: Tx): Promise<number> {
    const due = await tx.inventoryReservation.findMany({
      where: { status: InventoryReservationStatus.OPEN, expiresAt: { lte: new Date() } },
    });
    for (const row of due) {
      await this.releaseReservation(tx, row, `ttl:${row.id}`, row.ownerOrgId, InventoryReservationStatus.EXPIRED);
    }
    return due.length;
  }

  private async releaseReservation(
    tx: Tx,
    reservation: {
      id: string;
      lotId: string | null;
      qty: number;
      ownerOrgId: string;
      locationId: string;
      variantId: string;
    },
    idempotencyKey: string,
    actorPersonId: string,
    status: InventoryReservationStatus,
  ) {
    if (reservation.lotId) {
      const balanceRows = await tx.$queryRaw<
        Array<{ reserved: number }>
      >`SELECT reserved FROM app.get_balance_for_update(${reservation.lotId}::uuid)`;
      const releaseQty = Math.min(reservation.qty, Math.max(0, Number(balanceRows[0]?.reserved ?? 0)));
      if (releaseQty > 0) {
        await this.apply(tx, {
          lotId: reservation.lotId,
          type: InventoryMovementType.RELEASE,
          qty: releaseQty,
          reasonCode: status === InventoryReservationStatus.EXPIRED ? 'ttl' : 'release',
          actorPersonId,
          idempotencyKey,
          refType: 'InventoryReservation',
          refId: reservation.id,
          delta: { reserved: -releaseQty },
        });
      }
    } else {
      const lots = await tx.inventoryLot.findMany({
        where: {
          variantId: reservation.variantId,
          locationId: reservation.locationId,
          ownerOrgId: reservation.ownerOrgId,
          balance: { reserved: { gt: 0 } },
        },
        include: { balance: true },
      });
      let remaining = reservation.qty;
      for (const lot of lots) {
        if (remaining <= 0 || !lot.balance) {
          break;
        }
        const take = Math.min(remaining, lot.balance.reserved);
        await this.apply(tx, {
          lotId: lot.id,
          type: InventoryMovementType.RELEASE,
          qty: take,
          reasonCode: status === InventoryReservationStatus.EXPIRED ? 'ttl' : 'release',
          actorPersonId,
          idempotencyKey: `${idempotencyKey}:${lot.id}`,
          refType: 'InventoryReservation',
          refId: reservation.id,
          delta: { reserved: -take },
        });
        remaining -= take;
      }
    }
    const updated = await tx.inventoryReservation.update({
      where: { id: reservation.id },
      data: { status },
    });
    await this.outbox.enqueue(tx, {
      type: 'INVENTORY_RELEASED',
      aggregateType: 'InventoryReservation',
      aggregateId: reservation.id,
      producer: 'inventory',
      actorId: actorPersonId,
      payload: { status },
      occurrenceKey: idempotencyKey,
    });
    return updated;
  }

  private serializeLot(lot: {
    id: string;
    variantId: string;
    locationId: string;
    ownerOrgId: string;
    countryId: string;
    lotCode: string;
    expiresOn: Date | null;
    manufacturedOn: Date | null;
    status: InventoryLotStatus;
    balance: {
      onHand: number;
      reserved: number;
      damaged: number;
      expired: number;
      quarantined: number;
      returned: number;
      inTransit: number;
      available: number;
    } | null;
    variant?: { skuCode: string };
    location?: { name: string; kind: LocationKind };
  }) {
    const balance = lot.balance;
    return {
      id: lot.id,
      variant_id: lot.variantId,
      location_id: lot.locationId,
      owner_org_id: lot.ownerOrgId,
      country_id: lot.countryId,
      lot_code: lot.lotCode,
      expires_on: lot.expiresOn,
      manufactured_on: lot.manufacturedOn,
      status: lot.status,
      sku: lot.variant?.skuCode,
      location_name: lot.location?.name,
      location_kind: lot.location?.kind,
      on_hand: balance?.onHand ?? 0,
      reserved: balance?.reserved ?? 0,
      damaged: balance?.damaged ?? 0,
      expired: balance?.expired ?? 0,
      quarantined: balance?.quarantined ?? 0,
      returned: balance?.returned ?? 0,
      in_transit: balance?.inTransit ?? 0,
      available: balance?.available ?? 0,
    };
  }
}
