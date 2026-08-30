import { Injectable } from '@nestjs/common';
import {
  DispenseEventKind,
  DispensingCaseStatus,
  InventoryLotStatus,
  OrganizationKind,
  PrescriptionStatus,
  Prisma,
} from '@prisma/client';
import { uuidv7 } from '@world-pharma/shared';
import { PrismaService } from '../app/prisma.service';
import { Errors } from '../common/problem';
import { OutboxService } from '../events/outbox.service';
import type { Principal } from '../identity/current-principal';
import { assertInventoryOwner, requireInventoryLocation } from '../inventory/access';
import { InventoryService } from '../inventory/inventory.service';
import { PolicyResolver } from '../policy/resolver';
import { workerTenantContext } from '../tenancy/build-tenant-context';
import { DispensingBoundaryPort, type DispensingBoundaryResult } from './dispensing-boundary.port';

/**
 * Explicit R5-C open-decision defaults (Book 115 — do not silently invent law):
 * OD-R5C-01 = full_line_only (no partial)
 * OD-R5C-02 = soft check before complete; hard consume on complete
 * OD-R5C-03 = supersede open cases on amend; enqueue for new version
 * OD-R5C-04 = enqueue_on_issue (QUEUED, location claimed later)
 * OD-PHARM-04 = still_verify (must AUTHORIZE before COMPLETE)
 */

const OPEN_CASE: DispensingCaseStatus[] = [
  DispensingCaseStatus.QUEUED,
  DispensingCaseStatus.VALIDATING,
  DispensingCaseStatus.AUTHORIZED_TO_DISPENSE,
  DispensingCaseStatus.DISPENSING,
  DispensingCaseStatus.FAILED,
];

type MapLineInput = {
  prescription_line_id: string;
  catalog_item_id: string;
  catalog_variant_id: string;
  inventory_lot_id: string;
  quantity_dispensed: string;
  confirm_substitution?: boolean;
};

@Injectable()
export class DispensingService extends DispensingBoundaryPort {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PolicyResolver,
    private readonly inventory: InventoryService,
    private readonly outbox: OutboxService,
  ) {
    super();
  }

  /** OD-R5C-04: enqueue on ISSUE — case QUEUED without location until store claims. */
  /**
   * R5-E: enqueue a NEW DispensingCase for an approved refill.
   * Uses unique dispense-event idempotency per refillRequestId (never reuses enqueue:{versionId}).
   */
  async enqueueForRefill(input: {
    prescriptionVersionId: string;
    refillRequestId: string;
    actorPersonId: string;
  }): Promise<DispensingBoundaryResult> {
    const version = await this.prisma.prescriptionVersion.findUnique({
      where: { id: input.prescriptionVersionId },
      include: { prescription: true, lines: true },
    });
    if (!version || !version.sealedAt) {
      return { accepted: false, reason: 'version_not_sealed' };
    }
    const rx = version.prescription;
    if (rx.status !== PrescriptionStatus.ISSUED && rx.status !== PrescriptionStatus.FULLY_DISPENSED) {
      return { accepted: false, reason: 'prescription_not_issued' };
    }
    const country = await this.prisma.country.findUnique({ where: { id: rx.countryId } });
    if (!country) {
      return { accepted: false, reason: 'country_missing' };
    }
    const resolved = await this.policy.resolvePublished(country.isoAlpha2);
    if (!this.policy.isRxDispenseEnabled(resolved?.document ?? null)) {
      return { accepted: false, reason: 'rx_dispense_disabled' };
    }
    if (!this.policy.isRxRefillEnabled(resolved?.document ?? null)) {
      return { accepted: false, reason: 'rx_refill_disabled' };
    }
    const existingForRefill = await this.prisma.dispenseEvent.findUnique({
      where: { idempotencyKey: `enqueue:refill:${input.refillRequestId}` },
    });
    if (existingForRefill) {
      return { accepted: true, reason: 'already_queued', case_id: existingForRefill.caseId };
    }
    const open = await this.prisma.dispensingCase.findFirst({
      where: {
        prescriptionVersionId: version.id,
        status: { in: OPEN_CASE },
      },
    });
    if (open) {
      return { accepted: true, reason: 'already_queued', case_id: open.id };
    }
    const caseId = uuidv7();
    await this.prisma.$transaction(async (tx) => {
      await tx.dispensingCase.create({
        data: {
          id: caseId,
          prescriptionId: rx.id,
          prescriptionVersionId: version.id,
          countryId: rx.countryId,
          organizationId: rx.organizationId,
          status: DispensingCaseStatus.QUEUED,
        },
      });
      await tx.dispenseEvent.create({
        data: {
          id: uuidv7(),
          caseId,
          kind: DispenseEventKind.QUEUED,
          actorPersonId: input.actorPersonId,
          idempotencyKey: `enqueue:refill:${input.refillRequestId}`,
          metaJson: {
            refill_request_id: input.refillRequestId,
            ed_r5e_01: 'fail_closed_request_reauth',
          },
        },
      });
      await this.outbox.enqueue(tx, {
        type: 'DISPENSING_CASE_QUEUED',
        aggregateType: 'dispensing_case',
        aggregateId: caseId,
        producer: 'clinical',
        payload: {
          dispensing_case_id: caseId,
          prescription_id: rx.id,
          refill_request_id: input.refillRequestId,
        },
        occurrenceKey: `DISPENSING_CASE_QUEUED:refill:${input.refillRequestId}`,
      });
    });
    return { accepted: true, reason: 'queued_refill', case_id: caseId };
  }

  async enqueueForVersion(prescriptionVersionId: string): Promise<DispensingBoundaryResult> {
    const version = await this.prisma.prescriptionVersion.findUnique({
      where: { id: prescriptionVersionId },
      include: { prescription: true, lines: true },
    });
    if (!version || !version.sealedAt) {
      return { accepted: false, reason: 'version_not_sealed' };
    }
    const rx = version.prescription;
    if (rx.status !== PrescriptionStatus.ISSUED && rx.status !== PrescriptionStatus.FULLY_DISPENSED) {
      return { accepted: false, reason: 'prescription_not_issued' };
    }
    const country = await this.prisma.country.findUnique({ where: { id: rx.countryId } });
    if (!country) {
      return { accepted: false, reason: 'country_missing' };
    }
    const resolved = await this.policy.resolvePublished(country.isoAlpha2);
    if (!this.policy.isRxDispenseEnabled(resolved?.document ?? null)) {
      return { accepted: false, reason: 'rx_dispense_disabled' };
    }
    const existing = await this.prisma.dispensingCase.findFirst({
      where: {
        prescriptionVersionId,
        status: { in: OPEN_CASE },
      },
    });
    if (existing) {
      return { accepted: true, reason: 'already_queued', case_id: existing.id };
    }
    const caseId = uuidv7();
    await this.prisma.$transaction(async (tx) => {
      await tx.dispensingCase.create({
        data: {
          id: caseId,
          prescriptionId: rx.id,
          prescriptionVersionId: version.id,
          countryId: rx.countryId,
          organizationId: rx.organizationId,
          status: DispensingCaseStatus.QUEUED,
        },
      });
      await tx.dispenseEvent.create({
        data: {
          id: uuidv7(),
          caseId,
          kind: DispenseEventKind.QUEUED,
          actorPersonId: rx.createdByPersonId,
          idempotencyKey: `enqueue:${prescriptionVersionId}`,
          metaJson: { od_r5c_04: 'enqueue_on_issue' },
        },
      });
      await this.outbox.enqueue(tx, {
        type: 'DISPENSING_CASE_QUEUED',
        aggregateType: 'dispensing_case',
        aggregateId: caseId,
        producer: 'clinical',
        payload: { dispensing_case_id: caseId, prescription_id: rx.id },
        occurrenceKey: `DISPENSING_CASE_QUEUED:${caseId}`,
      });
    });
    return { accepted: true, reason: 'queued', case_id: caseId };
  }

  /** OD-R5C-03: close open cases for prior versions when Rx is amended. */
  async supersedeOpenCasesForPrescription(prescriptionId: string, actorPersonId: string, newVersionId: string) {
    const open = await this.prisma.dispensingCase.findMany({
      where: { prescriptionId, status: { in: OPEN_CASE } },
    });
    for (const row of open) {
      if (row.prescriptionVersionId === newVersionId) {
        continue;
      }
      await this.prisma.$transaction(async (tx) => {
        await tx.dispensingCase.update({
          where: { id: row.id },
          data: { status: DispensingCaseStatus.SUPERSEDED },
        });
        await tx.dispenseEvent.create({
          data: {
            id: uuidv7(),
            caseId: row.id,
            kind: DispenseEventKind.SUPERSEDE,
            actorPersonId,
            reasonCode: 'prescription_amended',
            idempotencyKey: `supersede:${row.id}:${newVersionId}`,
            metaJson: { new_version_id: newVersionId, od_r5c_03: 'supersede_on_amend' },
          },
        });
      });
    }
  }

  async listStoreQueue(principal: Principal, organizationId: string, locationId: string) {
    await this.assertStoreScope(principal, organizationId, locationId);
    await this.assertDispensePackForOrg(organizationId);
    const location = await this.prisma.location.findUniqueOrThrow({ where: { id: locationId } });
    const rows = await this.prisma.dispensingCase.findMany({
      where: {
        countryId: location.countryId,
        status: { in: [...OPEN_CASE, DispensingCaseStatus.REJECTED, DispensingCaseStatus.DISPENSED] },
        OR: [
          { locationId },
          { locationId: null, status: DispensingCaseStatus.QUEUED },
          { organizationId, locationId: null },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return {
      cases: rows.map((row) => this.presentCaseSummary(row)),
      od_defaults: this.odDefaults(),
      commerce: this.noCommerce({ r5dEligible: false }),
    };
  }

  async getStoreCase(principal: Principal, organizationId: string, locationId: string, caseId: string) {
    await this.assertStoreScope(principal, organizationId, locationId);
    const row = await this.loadCaseForStore(caseId, organizationId, locationId);
    return await this.presentCaseDetail(row, { includeClinicalLines: true });
  }

  async claim(
    principal: Principal,
    organizationId: string,
    locationId: string,
    caseId: string,
    idempotencyKey: string,
  ) {
    await this.assertStoreScope(principal, organizationId, locationId);
    await this.assertNotPackerOnly(principal, organizationId);
    await this.assertDispensePackForOrg(organizationId);
    return this.withIdempotency(idempotencyKey, async () => {
      const row = await this.prisma.dispensingCase.findUnique({ where: { id: caseId } });
      if (!row) {
        throw Errors.notFound('Dispensing case not found');
      }
      if (row.status !== DispensingCaseStatus.QUEUED && row.status !== DispensingCaseStatus.FAILED) {
        if (row.organizationId === organizationId && row.locationId === locationId) {
          return await this.presentCaseDetail(await this.loadCase(caseId), { includeClinicalLines: true });
        }
        throw Errors.problem(409, 'ILLEGAL_DISPENSE_TRANSITION', 'Illegal transition', `Cannot claim from ${row.status}`);
      }
      await this.prisma.$transaction(async (tx) => {
        await tx.dispensingCase.update({
          where: { id: caseId },
          data: {
            organizationId,
            locationId,
            claimedByPersonId: principal.personId,
            status: DispensingCaseStatus.VALIDATING,
          },
        });
        await tx.dispenseEvent.create({
          data: {
            id: uuidv7(),
            caseId,
            kind: DispenseEventKind.CLAIMED,
            actorPersonId: principal.personId,
            idempotencyKey: `claim:${idempotencyKey}`,
            metaJson: { organization_id: organizationId, location_id: locationId },
          },
        });
        await this.audit(tx, principal.personId, 'DISPENSING_CASE_CLAIMED', caseId);
      });
      return await this.presentCaseDetail(await this.loadCase(caseId), { includeClinicalLines: true });
    });
  }

  async startValidate(
    principal: Principal,
    organizationId: string,
    locationId: string,
    caseId: string,
    idempotencyKey: string,
  ) {
    await this.assertStoreScope(principal, organizationId, locationId);
    await this.assertNotPackerOnly(principal, organizationId);
    return this.withIdempotency(idempotencyKey, async () => {
      const row = await this.loadCaseForStore(caseId, organizationId, locationId);
      if (row.status !== DispensingCaseStatus.VALIDATING && row.status !== DispensingCaseStatus.AUTHORIZED_TO_DISPENSE) {
        if (row.status === DispensingCaseStatus.QUEUED) {
          throw Errors.problem(409, 'CLAIM_REQUIRED', 'Claim required', 'Claim the case to this location before validating.');
        }
        throw Errors.problem(409, 'ILLEGAL_DISPENSE_TRANSITION', 'Illegal transition', `Cannot validate from ${row.status}`);
      }
      await this.prisma.dispenseEvent.create({
        data: {
          id: uuidv7(),
          caseId,
          kind: DispenseEventKind.VALIDATE_START,
          actorPersonId: principal.personId,
          idempotencyKey: `validate:${idempotencyKey}`,
          metaJson: { od_pharm_04: 'still_verify' },
        },
      });
      if (row.status !== DispensingCaseStatus.VALIDATING) {
        await this.prisma.dispensingCase.update({
          where: { id: caseId },
          data: { status: DispensingCaseStatus.VALIDATING },
        });
      }
      return await this.presentCaseDetail(await this.loadCase(caseId), { includeClinicalLines: true });
    });
  }

  async reject(
    principal: Principal,
    organizationId: string,
    locationId: string,
    caseId: string,
    input: { reason_code: string; idempotency_key: string },
  ) {
    await this.assertStoreScope(principal, organizationId, locationId);
    await this.assertNotPackerOnly(principal, organizationId);
    return this.withIdempotency(input.idempotency_key, async () => {
      const row = await this.loadCaseForStore(caseId, organizationId, locationId);
      if (
        row.status === DispensingCaseStatus.DISPENSED ||
        row.status === DispensingCaseStatus.REJECTED ||
        row.status === DispensingCaseStatus.SUPERSEDED
      ) {
        throw Errors.problem(409, 'ILLEGAL_DISPENSE_TRANSITION', 'Illegal transition', `Cannot reject from ${row.status}`);
      }
      const reason = input.reason_code?.trim() || 'rejected';
      await this.prisma.$transaction(async (tx) => {
        await tx.dispensingCase.update({
          where: { id: caseId },
          data: { status: DispensingCaseStatus.REJECTED, rejectedReasonCode: reason },
        });
        await tx.dispenseEvent.create({
          data: {
            id: uuidv7(),
            caseId,
            kind: DispenseEventKind.REJECT,
            actorPersonId: principal.personId,
            reasonCode: reason,
            idempotencyKey: `reject:${input.idempotency_key}`,
          },
        });
        await this.outbox.enqueue(tx, {
          type: 'DISPENSING_REJECTED',
          aggregateType: 'dispensing_case',
          aggregateId: caseId,
          producer: 'clinical',
          payload: { dispensing_case_id: caseId, prescription_id: row.prescriptionId },
          occurrenceKey: `DISPENSING_REJECTED:${caseId}`,
        });
        await this.audit(tx, principal.personId, 'DISPENSING_REJECTED', caseId);
      });
      return await this.presentCaseDetail(await this.loadCase(caseId), { includeClinicalLines: true });
    });
  }

  async authorize(
    principal: Principal,
    organizationId: string,
    locationId: string,
    caseId: string,
    idempotencyKey: string,
  ) {
    await this.assertStoreScope(principal, organizationId, locationId);
    await this.assertNotPackerOnly(principal, organizationId);
    return this.withIdempotency(idempotencyKey, async () => {
      const row = await this.loadCaseForStore(caseId, organizationId, locationId);
      if (row.status !== DispensingCaseStatus.VALIDATING) {
        throw Errors.problem(409, 'ILLEGAL_DISPENSE_TRANSITION', 'Illegal transition', `Cannot authorize from ${row.status}`);
      }
      await this.assertEligibility(row);
      await this.prisma.$transaction(async (tx) => {
        await tx.dispensingCase.update({
          where: { id: caseId },
          data: { status: DispensingCaseStatus.AUTHORIZED_TO_DISPENSE },
        });
        await tx.dispenseEvent.create({
          data: {
            id: uuidv7(),
            caseId,
            kind: DispenseEventKind.AUTHORIZE,
            actorPersonId: principal.personId,
            idempotencyKey: `authorize:${idempotencyKey}`,
            metaJson: { od_pharm_04: 'still_verify_completed' },
          },
        });
        await this.audit(tx, principal.personId, 'DISPENSING_AUTHORIZED', caseId);
      });
      return await this.presentCaseDetail(await this.loadCase(caseId), { includeClinicalLines: true });
    });
  }

  async mapLines(
    principal: Principal,
    organizationId: string,
    locationId: string,
    caseId: string,
    input: { lines: MapLineInput[]; idempotency_key: string },
  ) {
    await this.assertStoreScope(principal, organizationId, locationId);
    await this.assertNotPackerOnly(principal, organizationId);
    return this.withIdempotency(input.idempotency_key, async () => {
      const row = await this.loadCaseForStore(caseId, organizationId, locationId);
      if (
        row.status !== DispensingCaseStatus.AUTHORIZED_TO_DISPENSE &&
        row.status !== DispensingCaseStatus.DISPENSING
      ) {
        throw Errors.problem(409, 'ILLEGAL_DISPENSE_TRANSITION', 'Illegal transition', `Cannot map lines from ${row.status}`);
      }
      const version = row.prescriptionVersion;
      await this.assertFullLineMappings(version.lines, input.lines);
      for (const line of input.lines) {
        await this.assertMappingAndLot(line, organizationId, locationId, version.lines);
      }
      await this.prisma.$transaction(async (tx) => {
        await tx.dispenseLineMapping.deleteMany({ where: { caseId } });
        for (const line of input.lines) {
          await tx.dispenseLineMapping.create({
            data: {
              id: uuidv7(),
              caseId,
              prescriptionLineId: line.prescription_line_id,
              catalogItemId: line.catalog_item_id,
              catalogVariantId: line.catalog_variant_id,
              inventoryLotId: line.inventory_lot_id,
              quantityDispensed: line.quantity_dispensed.trim(),
              confirmSubstitution: line.confirm_substitution === true,
            },
          });
        }
        await tx.dispensingCase.update({
          where: { id: caseId },
          data: { status: DispensingCaseStatus.DISPENSING },
        });
        await tx.dispenseEvent.create({
          data: {
            id: uuidv7(),
            caseId,
            kind: DispenseEventKind.MAP_LINES,
            actorPersonId: principal.personId,
            idempotencyKey: `map:${input.idempotency_key}`,
            metaJson: { line_count: input.lines.length, od_r5c_01: 'full_line_only' },
          },
        });
      });
      return await this.presentCaseDetail(await this.loadCase(caseId), { includeClinicalLines: true });
    });
  }

  async complete(
    principal: Principal,
    organizationId: string,
    locationId: string,
    caseId: string,
    idempotencyKey: string,
  ) {
    await this.assertStoreScope(principal, organizationId, locationId);
    await this.assertNotPackerOnly(principal, organizationId);
    return this.withIdempotency(idempotencyKey, async () => {
      const row = await this.loadCaseForStore(caseId, organizationId, locationId);
      if (row.status === DispensingCaseStatus.DISPENSED) {
        return await this.presentCaseDetail(await this.loadCase(caseId), { includeClinicalLines: true });
      }
      if (row.status !== DispensingCaseStatus.DISPENSING) {
        throw Errors.problem(
          409,
          'ILLEGAL_DISPENSE_TRANSITION',
          'Illegal transition',
          `Cannot complete from ${row.status}. Map all lines after authorize (OD-PHARM-04 still verify).`,
        );
      }
      await this.assertEligibility(row);
      const mappings = await this.prisma.dispenseLineMapping.findMany({ where: { caseId } });
      const version = row.prescriptionVersion;
      await this.assertFullLineMappings(
        version.lines,
        mappings.map((m) => ({
          prescription_line_id: m.prescriptionLineId,
          catalog_item_id: m.catalogItemId,
          catalog_variant_id: m.catalogVariantId,
          inventory_lot_id: m.inventoryLotId ?? '',
          quantity_dispensed: m.quantityDispensed,
          confirm_substitution: m.confirmSubstitution,
        })),
      );
      for (const m of mappings) {
        if (!m.inventoryLotId) {
          throw Errors.validation('inventory_lot_id is required on every mapped line before complete.');
        }
        await this.assertMappingAndLot(
          {
            prescription_line_id: m.prescriptionLineId,
            catalog_item_id: m.catalogItemId,
            catalog_variant_id: m.catalogVariantId,
            inventory_lot_id: m.inventoryLotId,
            quantity_dispensed: m.quantityDispensed,
            confirm_substitution: m.confirmSubstitution,
          },
          organizationId,
          locationId,
          version.lines,
        );
      }

      const eventId = uuidv7();
      const beforeOrders = await this.prisma.order.count();
      const beforePayments = await this.prisma.paymentIntent.count();
      const beforeShipments = await this.prisma.shipment.count();

      try {
        await this.prisma.$transaction(async (tx) => {
          for (const m of mappings) {
            const qty = this.parseQty(m.quantityDispensed);
            await this.inventory.consumeForDispense(tx, {
              lotId: m.inventoryLotId!,
              qty,
              actorPersonId: principal.personId,
              dispenseEventId: eventId,
              ownerOrgId: organizationId,
              locationId,
            });
          }
          await tx.dispenseEvent.create({
            data: {
              id: eventId,
              caseId,
              kind: DispenseEventKind.COMPLETE,
              actorPersonId: principal.personId,
              idempotencyKey: `complete:${idempotencyKey}`,
              metaJson: {
                od_r5c_01: 'full_line_only',
                od_r5c_02: 'hard_consume_on_complete',
                line_count: mappings.length,
              },
            },
          });
          await tx.dispensingCase.update({
            where: { id: caseId },
            data: { status: DispensingCaseStatus.DISPENSED },
          });
          // Prescription status is clinical; store actors lack prescription UPDATE RLS.
          // Elevate on the same tx only for this mutation after inventory consume succeeded.
          await this.prisma.runWithTenant(
            workerTenantContext({ countryId: row.countryId, personId: principal.personId }),
            async () => {
              await this.prisma.prescription.update({
                where: { id: row.prescriptionId },
                data: { status: PrescriptionStatus.FULLY_DISPENSED },
              });
              await this.prisma.prescriptionStatusHistory.create({
                data: {
                  id: uuidv7(),
                  prescriptionId: row.prescriptionId,
                  fromStatus: PrescriptionStatus.ISSUED,
                  toStatus: PrescriptionStatus.FULLY_DISPENSED,
                  actorPersonId: principal.personId,
                  reasonCode: 'dispensed',
                },
              });
            },
          );
          await this.outbox.enqueue(tx, {
            type: 'DISPENSING_COMPLETED',
            aggregateType: 'dispensing_case',
            aggregateId: caseId,
            producer: 'clinical',
            payload: { dispensing_case_id: caseId, prescription_id: row.prescriptionId },
            occurrenceKey: `DISPENSING_COMPLETED:${caseId}`,
          });
          await this.audit(tx, principal.personId, 'DISPENSING_COMPLETED', caseId);
        });
      } catch (err) {
        await this.prisma.dispensingCase.update({
          where: { id: caseId },
          data: { status: DispensingCaseStatus.FAILED },
        });
        await this.prisma.dispenseEvent.create({
          data: {
            id: uuidv7(),
            caseId,
            kind: DispenseEventKind.FAIL,
            actorPersonId: principal.personId,
            reasonCode: 'complete_failed',
            idempotencyKey: `fail:${idempotencyKey}:${Date.now()}`,
          },
        });
        throw err;
      }

      if (
        (await this.prisma.order.count()) !== beforeOrders ||
        (await this.prisma.paymentIntent.count()) !== beforePayments ||
        (await this.prisma.shipment.count()) !== beforeShipments
      ) {
        throw Errors.problem(500, 'COMMERCE_SIDE_EFFECT', 'Commerce side effect', 'R5-C must not create Order/Payment/Shipment.');
      }

      return await this.presentCaseDetail(await this.loadCase(caseId), { includeClinicalLines: true });
    });
  }

  async listEligibleLots(
    principal: Principal,
    organizationId: string,
    locationId: string,
    variantId: string,
  ) {
    await this.assertStoreScope(principal, organizationId, locationId);
    const lots = await this.prisma.inventoryLot.findMany({
      where: {
        ownerOrgId: organizationId,
        locationId,
        variantId,
        status: InventoryLotStatus.ACTIVE,
        OR: [{ expiresOn: null }, { expiresOn: { gte: new Date() } }],
        balance: { available: { gt: 0 } },
      },
      include: { balance: true },
      orderBy: [{ expiresOn: 'asc' }, { createdAt: 'asc' }],
      take: 50,
    });
    return {
      lots: lots.map((lot) => ({
        id: lot.id,
        lot_code: lot.lotCode,
        variant_id: lot.variantId,
        expires_on: lot.expiresOn?.toISOString().slice(0, 10) ?? null,
        available: lot.balance
          ? lot.balance.onHand -
            lot.balance.reserved -
            lot.balance.damaged -
            lot.balance.expired -
            lot.balance.quarantined -
            lot.balance.returned
          : 0,
        status: lot.status,
        fefo_hint: true,
      })),
      note: 'FEFO is a pack hint when inventory.fefo_required; not a legal claim.',
    };
  }

  async statusForPrescription(prescriptionId: string) {
    const cases = await this.prisma.dispensingCase.findMany({
      where: { prescriptionId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        status: true,
        prescriptionVersionId: true,
        rejectedReasonCode: true,
        updatedAt: true,
        createdAt: true,
      },
    });
    const current = cases[0] ?? null;
    return {
      dispensing_status: current?.status ?? null,
      dispensing_case_id: current?.id ?? null,
      cases: cases.map((c) => ({
        id: c.id,
        status: c.status,
        prescription_version_id: c.prescriptionVersionId,
        rejected_reason_code: c.rejectedReasonCode,
        updated_at: c.updatedAt.toISOString(),
        created_at: c.createdAt.toISOString(),
      })),
    };
  }

  async listAdmin(principal: Principal) {
    if (principal.audience !== 'admin') {
      throw Errors.forbidden('Admin session required');
    }
    const rows = await this.prisma.dispensingCase.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        status: true,
        prescriptionId: true,
        prescriptionVersionId: true,
        countryId: true,
        organizationId: true,
        locationId: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    const orders = await this.prisma.order.findMany({
      where: { dispensingCaseId: { in: rows.map((r) => r.id) } },
      select: { id: true, dispensingCaseId: true },
    });
    const orderByCase = new Map(orders.map((o) => [o.dispensingCaseId, o.id]));
    return {
      cases: rows.map((r) => ({
        id: r.id,
        status: r.status,
        prescription_id: r.prescriptionId,
        prescription_version_id: r.prescriptionVersionId,
        country_id: r.countryId,
        organization_id: r.organizationId,
        location_id: r.locationId,
        order_id: orderByCase.get(r.id) ?? null,
        created_at: r.createdAt.toISOString(),
        updated_at: r.updatedAt.toISOString(),
        note: 'Operational metadata only. Medication lines are not exposed.',
      })),
    };
  }

  private async assertEligibility(row: {
    prescriptionId: string;
    prescriptionVersionId: string;
    countryId: string;
    prescription?: { status: PrescriptionStatus; currentVersionId: string | null };
    prescriptionVersion?: {
      sealedAt: Date | null;
      validFrom: Date | null;
      validUntil: Date | null;
    };
  }) {
    const rx =
      row.prescription ??
      (await this.prisma.runWithTenant(workerTenantContext({ countryId: row.countryId }), () =>
        this.prisma.prescription.findUniqueOrThrow({ where: { id: row.prescriptionId } }),
      ));
    if (rx.status === PrescriptionStatus.CANCELLED || rx.status === PrescriptionStatus.EXPIRED) {
      throw Errors.problem(409, 'PRESCRIPTION_NOT_DISPENSABLE', 'Not dispensable', `Prescription is ${rx.status}`);
    }
    if (rx.status === PrescriptionStatus.DRAFT) {
      throw Errors.problem(409, 'PRESCRIPTION_NOT_DISPENSABLE', 'Not dispensable', 'Draft prescriptions cannot be dispensed.');
    }
    if (rx.currentVersionId && rx.currentVersionId !== row.prescriptionVersionId) {
      throw Errors.problem(409, 'VERSION_SUPERSEDED', 'Version superseded', 'Case targets a non-current prescription version.');
    }
    const version =
      row.prescriptionVersion ??
      (await this.prisma.runWithTenant(workerTenantContext({ countryId: row.countryId }), () =>
        this.prisma.prescriptionVersion.findUniqueOrThrow({ where: { id: row.prescriptionVersionId } }),
      ));
    if (!version.sealedAt) {
      throw Errors.problem(409, 'VERSION_NOT_SEALED', 'Not sealed', 'Unsigned drafts are not dispensable.');
    }
    const now = new Date();
    if (!version.validFrom && !version.validUntil) {
      throw Errors.problem(
        409,
        'VALIDITY_UNRESOLVED',
        'Validity unresolved',
        'Dispense fail-closed when validity window is not set by pack/policy.',
      );
    }
    if (version.validFrom && now < version.validFrom) {
      throw Errors.problem(409, 'PRESCRIPTION_NOT_YET_VALID', 'Not yet valid', 'Prescription validity has not started.');
    }
    if (version.validUntil && now > version.validUntil) {
      throw Errors.problem(409, 'PRESCRIPTION_EXPIRED', 'Expired', 'Prescription validity window has ended.');
    }
    const country = await this.prisma.country.findUniqueOrThrow({ where: { id: row.countryId } });
    const resolved = await this.policy.resolvePublished(country.isoAlpha2);
    if (!this.policy.isRxDispenseEnabled(resolved?.document ?? null)) {
      throw Errors.serviceDisabled('Prescription dispensing is disabled for this country pack.');
    }
  }

  private async assertFullLineMappings(
    clinicalLines: Array<{ id: string; quantityAuthorized: string }>,
    mapped: MapLineInput[],
  ) {
    if (mapped.length !== clinicalLines.length) {
      throw Errors.problem(
        409,
        'PARTIAL_DISPENSE_NOT_ENABLED',
        'Partial dispense not enabled',
        'OD-R5C-01: full-line-only until legal/product decides otherwise.',
      );
    }
    const ids = new Set(clinicalLines.map((l) => l.id));
    for (const m of mapped) {
      if (!ids.has(m.prescription_line_id)) {
        throw Errors.validation('Unknown prescription_line_id in mapping.');
      }
    }
  }

  private async assertMappingAndLot(
    line: MapLineInput,
    organizationId: string,
    locationId: string,
    clinicalLines: Array<{
      id: string;
      quantityAuthorized: string;
      substitutionAllowed: boolean;
      suggestedCatalogItemId: string | null;
    }>,
  ) {
    const clinical = clinicalLines.find((l) => l.id === line.prescription_line_id);
    if (!clinical) {
      throw Errors.validation('prescription_line_id does not belong to this version.');
    }
    const qtyAuth = this.parseQty(clinical.quantityAuthorized);
    const qtyDisp = this.parseQty(line.quantity_dispensed);
    if (qtyDisp !== qtyAuth) {
      throw Errors.problem(
        409,
        'PARTIAL_DISPENSE_NOT_ENABLED',
        'Partial dispense not enabled',
        'OD-R5C-01: dispensed quantity must equal authorized quantity for each line.',
      );
    }
    const variant = await this.prisma.catalogVariant.findUnique({
      where: { id: line.catalog_variant_id },
    });
    if (!variant || variant.itemId !== line.catalog_item_id) {
      throw Errors.validation('catalog_variant_id must belong to catalog_item_id.');
    }
    if (
      clinical.suggestedCatalogItemId &&
      clinical.suggestedCatalogItemId !== line.catalog_item_id &&
      !clinical.substitutionAllowed &&
      line.confirm_substitution !== true
    ) {
      throw Errors.problem(
        409,
        'SILENT_SUBSTITUTION_FORBIDDEN',
        'Substitution blocked',
        'No silent substitution. Line disallows substitution without explicit confirm (OD-PHARM-09).',
      );
    }
    if (
      clinical.suggestedCatalogItemId &&
      clinical.suggestedCatalogItemId !== line.catalog_item_id &&
      !clinical.substitutionAllowed
    ) {
      throw Errors.problem(
        409,
        'SUBSTITUTION_NOT_ALLOWED',
        'Substitution not allowed',
        'Prescription line substitution_allowed=false; fail closed.',
      );
    }
    const lot = await this.prisma.inventoryLot.findUnique({
      where: { id: line.inventory_lot_id },
      include: { balance: true },
    });
    if (!lot || lot.ownerOrgId !== organizationId || lot.locationId !== locationId) {
      throw Errors.notFound('Inventory lot not found at this location.');
    }
    if (lot.variantId !== line.catalog_variant_id) {
      throw Errors.validation('inventory_lot_id variant must match catalog_variant_id.');
    }
    if (lot.status !== InventoryLotStatus.ACTIVE) {
      throw Errors.problem(409, 'LOT_UNAVAILABLE', 'Lot unavailable', 'Lot is not active.');
    }
    if (lot.expiresOn && lot.expiresOn < new Date()) {
      throw Errors.problem(409, 'LOT_EXPIRED', 'Lot expired', 'Expired lots cannot be selected.');
    }
    const available = lot.balance
      ? lot.balance.onHand -
        lot.balance.reserved -
        lot.balance.damaged -
        lot.balance.expired -
        lot.balance.quarantined -
        lot.balance.returned
      : 0;
    if (available < qtyDisp) {
      throw Errors.conflict('Insufficient available quantity on selected lot.');
    }
  }

  private parseQty(raw: string): number {
    const n = Number(String(raw).trim());
    if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) {
      throw Errors.validation('quantity must be a positive integer string for inventory consume.');
    }
    return n;
  }

  private async assertStoreScope(principal: Principal, organizationId: string, locationId: string) {
    await assertInventoryOwner(this.prisma, principal, organizationId, locationId);
    await requireInventoryLocation(this.prisma, locationId, organizationId);
    const org = await this.prisma.organization.findUnique({ where: { id: organizationId } });
    if (!org || org.kind !== OrganizationKind.PHARMACY_OWNED) {
      throw Errors.forbidden('Dispensing is limited to owned pharmacy organizations.');
    }
  }

  private async assertDispensePackForOrg(organizationId: string) {
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
    const country = await this.prisma.country.findUniqueOrThrow({ where: { id: org.countryId } });
    const resolved = await this.policy.resolvePublished(country.isoAlpha2);
    if (!this.policy.isRxDispenseEnabled(resolved?.document ?? null)) {
      throw Errors.serviceDisabled('Prescription dispensing is disabled for this country pack.');
    }
  }

  private async assertNotPackerOnly(principal: Principal, organizationId: string) {
    const memberships = await this.prisma.membership.findMany({
      where: {
        personId: principal.personId,
        organizationId,
        status: 'ACTIVE',
        deletedAt: null,
      },
      include: { role: true },
    });
    if (!memberships.length) {
      return;
    }
    const codes = memberships.map((m) => m.role?.code).filter(Boolean) as string[];
    if (codes.length && codes.every((c) => c === 'pharmacy_packer')) {
      throw Errors.forbidden('Packer role cannot verify or dispense prescriptions (SoD).');
    }
  }

  private async loadCase(caseId: string) {
    const bare = await this.prisma.dispensingCase.findUnique({
      where: { id: caseId },
      include: {
        events: { orderBy: { createdAt: 'asc' }, take: 50 },
        lineMappings: true,
      },
    });
    if (!bare) {
      throw Errors.notFound('Dispensing case not found');
    }
    // Prescription/version RLS is patient/doctor-centric. After case ACL, load
    // minimum-necessary clinical rows under worker GUCs on the same request tx
    // (not fresh) so uncommitted claim updates remain visible.
    const clinical = await this.prisma.runWithTenant(
      workerTenantContext({ countryId: bare.countryId }),
      async () => {
        const [prescription, prescriptionVersion] = await Promise.all([
          this.prisma.prescription.findUnique({ where: { id: bare.prescriptionId } }),
          this.prisma.prescriptionVersion.findUnique({
            where: { id: bare.prescriptionVersionId },
            include: { lines: { orderBy: { lineNumber: 'asc' } } },
          }),
        ]);
        return { prescription, prescriptionVersion };
      },
    );
    if (!clinical.prescription || !clinical.prescriptionVersion) {
      throw Errors.notFound('Dispensing case clinical payload unavailable');
    }
    return {
      ...bare,
      prescription: clinical.prescription,
      prescriptionVersion: clinical.prescriptionVersion,
    };
  }

  private async loadCaseForStore(caseId: string, organizationId: string, locationId: string) {
    const row = await this.loadCase(caseId);
    // Claimed cases: hard store/org isolation. Unclaimed QUEUED: no clinical detail
    // until claimed (queue list remains visible via listStoreQueue).
    if (!row.organizationId || row.organizationId !== organizationId) {
      throw Errors.notFound('Dispensing case not found');
    }
    if (row.locationId && row.locationId !== locationId) {
      throw Errors.notFound('Dispensing case not found');
    }
    return row;
  }

  private presentCaseSummary(row: {
    id: string;
    status: DispensingCaseStatus;
    prescriptionId: string;
    prescriptionVersionId: string;
    organizationId: string | null;
    locationId: string | null;
    createdAt: Date;
    updatedAt: Date;
    prescription?: { status: PrescriptionStatus; patientPersonId: string; encounterId: string };
    prescriptionVersion?: { versionNumber: number };
  }) {
    return {
      id: row.id,
      status: row.status,
      prescription_id: row.prescriptionId,
      prescription_status: row.prescription?.status ?? null,
      prescription_version_id: row.prescriptionVersionId,
      version_number: row.prescriptionVersion?.versionNumber ?? null,
      patient_person_id: row.prescription?.patientPersonId ?? null,
      encounter_id: row.prescription?.encounterId ?? null,
      organization_id: row.organizationId,
      location_id: row.locationId,
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
    };
  }

  private async presentCaseDetail(
    row: Awaited<ReturnType<DispensingService['loadCase']>>,
    opts: { includeClinicalLines: boolean },
  ) {
    const lines = row.prescriptionVersion.lines ?? [];
    const linkedOrder = await this.prisma.order.findFirst({
      where: { dispensingCaseId: row.id },
      select: { id: true },
      orderBy: { createdAt: 'desc' },
    });
    const refillEvent = row.events.find((event) => {
      const meta = event.metaJson as { refill_request_id?: string } | null | undefined;
      return Boolean(meta?.refill_request_id);
    });
    const refillRequestId = refillEvent
      ? ((refillEvent.metaJson as { refill_request_id?: string }).refill_request_id ?? null)
      : null;
    return {
      ...this.presentCaseSummary(row),
      order_id: linkedOrder?.id ?? null,
      refill_request_id: refillRequestId,
      rejected_reason_code: row.rejectedReasonCode,
      lines: opts.includeClinicalLines
        ? lines.map((l) => ({
            id: l.id,
            line_number: l.lineNumber,
            clinical_concept_code: l.clinicalConceptCode,
            clinical_concept_label: l.clinicalConceptLabel,
            dosage_instructions: l.dosageInstructions,
            quantity_authorized: l.quantityAuthorized,
            quantity_unit: l.quantityUnit,
            substitution_allowed: l.substitutionAllowed,
            restriction_category_code: l.restrictionCategoryCode,
            suggested_catalog_item_id: l.suggestedCatalogItemId,
          }))
        : undefined,
      mappings: row.lineMappings.map((m) => ({
        prescription_line_id: m.prescriptionLineId,
        catalog_item_id: m.catalogItemId,
        catalog_variant_id: m.catalogVariantId,
        inventory_lot_id: m.inventoryLotId,
        quantity_dispensed: m.quantityDispensed,
        confirm_substitution: m.confirmSubstitution,
      })),
      events: row.events.map((e) => ({
        id: e.id,
        kind: e.kind,
        reason_code: e.reasonCode,
        created_at: e.createdAt.toISOString(),
        meta: (e.metaJson as { refill_request_id?: string } | null) ?? undefined,
      })),
      od_defaults: this.odDefaults(),
      commerce: this.noCommerce({ r5dEligible: row.status === DispensingCaseStatus.DISPENSED }),
      note: 'Minimum necessary pharmacy desk projection. OD-PHARM-04 still verify. R5-D patient-driven handoff when DISPENSED.',
    };
  }

  private odDefaults() {
    return {
      'OD-R5C-01': 'full_line_only',
      'OD-R5C-02': 'hard_consume_on_complete',
      'OD-R5C-03': 'supersede_on_amend',
      'OD-R5C-04': 'enqueue_on_issue',
      'OD-PHARM-04': 'still_verify',
      'OD-DOC-10': 'patient_driven',
      'ED-R5D-01': 'option_b_skip_order_pick',
      'OD-RX-REFILL': 'unresolved',
    };
  }

  private noCommerce(opts?: { r5dEligible?: boolean }) {
    return {
      order: false,
      payment: false,
      shipment: false,
      r5d_handoff: opts?.r5dEligible === true,
      ed_r5d_01: 'option_b_skip_order_pick',
    };
  }

  private async withIdempotency<T>(key: string, fn: () => Promise<T>): Promise<T> {
    if (!key?.trim()) {
      throw Errors.validation('Idempotency-Key is required.');
    }
    return fn();
  }

  private async audit(tx: Prisma.TransactionClient, personId: string, type: string, resourceId: string) {
    await tx.securityEvent.create({
      data: {
        id: uuidv7(),
        type,
        outcome: 'success',
        personId,
        metadata: { resource_type: 'dispensing_case', resource_id: resourceId },
      },
    });
  }
}
