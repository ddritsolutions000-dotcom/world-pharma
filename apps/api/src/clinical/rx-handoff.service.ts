import { Injectable } from '@nestjs/common';
import {
  DispenseEventKind,
  DispensingCaseStatus,
  OfferStatus,
  PrescriptionStatus,
  CatalogLifecycle,
} from '@prisma/client';
import { uuidv7 } from '@world-pharma/shared';
import { PrismaService } from '../app/prisma.service';
import { Errors } from '../common/problem';
import { OutboxService } from '../events/outbox.service';
import type { Principal } from '../identity/current-principal';
import { CartService } from '../cart/cart.service';
import { PolicyResolver } from '../policy/resolver';

/**
 * R5-D patient-driven Order-from-Rx handoff (Book 117).
 * ED-R5D-01 Option B: R5-C owns inventory consume; this path sets skipInventoryHold.
 */
@Injectable()
export class RxHandoffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly carts: CartService,
    private readonly policy: PolicyResolver,
    private readonly outbox: OutboxService,
  ) {}

  async eligibilityForPrescription(principal: Principal, prescriptionId: string) {
    const rx = await this.prisma.prescription.findFirst({
      where: { id: prescriptionId, patientPersonId: principal.personId },
    });
    if (!rx) {
      throw Errors.notFound('Prescription not found');
    }
    const dispensed = await this.prisma.dispensingCase.findFirst({
      where: {
        prescriptionId,
        status: DispensingCaseStatus.DISPENSED,
      },
      orderBy: { updatedAt: 'desc' },
      include: {
        lineMappings: true,
        events: { where: { kind: DispenseEventKind.COMPLETE }, orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
    const complete = dispensed?.events[0] ?? null;
    const blocked =
      rx.status === PrescriptionStatus.DRAFT ||
      rx.status === PrescriptionStatus.CANCELLED ||
      rx.status === PrescriptionStatus.EXPIRED;
    const eligible =
      !blocked &&
      !!dispensed &&
      dispensed.status === DispensingCaseStatus.DISPENSED &&
      !!complete &&
      (dispensed.lineMappings?.length ?? 0) > 0;

    let existingOrderId: string | null = null;
    if (complete) {
      const order = await this.prisma.order.findUnique({
        where: { dispenseEventId: complete.id },
        select: { id: true },
      });
      existingOrderId = order?.id ?? null;
    }

    return {
      prescription_id: prescriptionId,
      prescription_status: rx.status,
      eligible: eligible && !existingOrderId,
      reason: existingOrderId
        ? 'order_already_exists'
        : blocked
          ? 'prescription_not_dispensable'
          : !dispensed
            ? 'not_dispensed'
            : !complete
              ? 'missing_complete_event'
              : 'ok',
      dispensing_case_id: dispensed?.id ?? null,
      dispense_event_id: complete?.id ?? null,
      dispensing_status: dispensed?.status ?? null,
      order_id: existingOrderId,
      commerce_items: eligible
        ? dispensed!.lineMappings.map((m) => ({
            catalog_item_id: m.catalogItemId,
            catalog_variant_id: m.catalogVariantId,
            inventory_lot_id: m.inventoryLotId,
            quantity_dispensed: m.quantityDispensed,
            prescription_line_id: m.prescriptionLineId,
          }))
        : [],
      od_doc_10: 'patient_driven',
      ed_r5d_01: 'option_b_skip_order_pick',
    };
  }

  async startHandoff(
    principal: Principal,
    input: { dispensing_case_id: string },
    idempotencyKey: string,
  ) {
    if (!idempotencyKey?.trim()) {
      throw Errors.validation('Idempotency-Key is required.');
    }
    const caseRow = await this.prisma.dispensingCase.findUnique({
      where: { id: input.dispensing_case_id },
      include: {
        prescription: true,
        lineMappings: true,
        events: { where: { kind: DispenseEventKind.COMPLETE }, orderBy: { createdAt: 'desc' }, take: 1 },
        organization: true,
        location: true,
        country: true,
      },
    });
    if (!caseRow || caseRow.prescription.patientPersonId !== principal.personId) {
      throw Errors.notFound('Dispensing case not found');
    }
    if (caseRow.status !== DispensingCaseStatus.DISPENSED) {
      throw Errors.problem(409, 'HANDOFF_NOT_ELIGIBLE', 'Not eligible', 'Only DISPENSED cases can start commercial handoff.');
    }
    const rx = caseRow.prescription;
    if (
      rx.status === PrescriptionStatus.DRAFT ||
      rx.status === PrescriptionStatus.CANCELLED ||
      rx.status === PrescriptionStatus.EXPIRED
    ) {
      throw Errors.problem(409, 'PRESCRIPTION_NOT_DISPENSABLE', 'Not dispensable', `Prescription is ${rx.status}`);
    }
    const complete = caseRow.events[0];
    if (!complete) {
      throw Errors.problem(409, 'HANDOFF_NOT_ELIGIBLE', 'Not eligible', 'Missing COMPLETE dispense event.');
    }
    if (!caseRow.organizationId || !caseRow.locationId) {
      throw Errors.problem(409, 'HANDOFF_NOT_ELIGIBLE', 'Not eligible', 'Dispense location/organization required.');
    }
    if (!caseRow.lineMappings.length) {
      throw Errors.problem(409, 'HANDOFF_NOT_ELIGIBLE', 'Not eligible', 'No commercial line mappings.');
    }

    const existingOrder = await this.prisma.order.findUnique({
      where: { dispenseEventId: complete.id },
    });
    if (existingOrder) {
      return {
        handoff_key: `rx_handoff:${caseRow.id}:${complete.id}`,
        dispensing_case_id: caseRow.id,
        dispense_event_id: complete.id,
        order_id: existingOrder.id,
        cart_id: null,
        already_ordered: true,
        skip_inventory_hold: true,
        ed_r5d_01: 'option_b_skip_order_pick',
      };
    }

    const handoffKey = `rx_handoff:${caseRow.id}:${complete.id}`;
    const prior = await this.prisma.rxCommerceHandoff.findUnique({ where: { handoffKey } });
    if (prior?.orderId) {
      return {
        handoff_key: handoffKey,
        dispensing_case_id: caseRow.id,
        dispense_event_id: complete.id,
        order_id: prior.orderId,
        cart_id: prior.cartId,
        already_ordered: true,
        skip_inventory_hold: true,
        ed_r5d_01: 'option_b_skip_order_pick',
      };
    }
    if (prior?.cartId) {
      const cart = await this.carts.presentCart(prior.cartId);
      return {
        handoff_key: handoffKey,
        dispensing_case_id: caseRow.id,
        dispense_event_id: complete.id,
        prescription_id: caseRow.prescriptionId,
        cart_id: prior.cartId,
        cart,
        order_id: null,
        already_ordered: false,
        skip_inventory_hold: true,
        ed_r5d_01: 'option_b_skip_order_pick',
        od_doc_10: 'patient_driven',
        next: 'Attach address, quote, pay via existing /me/checkout APIs',
      };
    }

    const country = caseRow.country;
    const resolved = await this.policy.resolvePublished(country.isoAlpha2);
    if (!this.policy.canUseService(resolved?.document ?? null, 'pharmacy')) {
      throw Errors.serviceDisabled('Pharmacy storefront is disabled for this country pack.');
    }

    // Resolve commercial offers for dispensed variants (same pharmacy org).
    const commercialLines: Array<{
      offer_id: string;
      variant_id: string;
      qty: number;
      lot_id: string | null;
      catalog_item_id: string;
    }> = [];
    for (const mapping of caseRow.lineMappings) {
      const qty = Math.max(1, Number.parseInt(mapping.quantityDispensed, 10) || 0);
      if (!qty) {
        throw Errors.validation('Invalid quantity_dispensed on mapping.');
      }
      const offer = await this.prisma.catalogOffer.findFirst({
        where: {
          variantId: mapping.catalogVariantId,
          sellerOrgId: caseRow.organizationId,
          countryId: caseRow.countryId,
          status: OfferStatus.PUBLISHED,
        },
        include: { variant: { include: { item: { include: { countries: true } } } } },
      });
      if (!offer || offer.variant.item.status !== CatalogLifecycle.PUBLISHED) {
        throw Errors.problem(
          409,
          'OFFER_UNAVAILABLE',
          'Offer unavailable',
          'Dispensed catalog variant has no published commercial offer for this pharmacy.',
        );
      }
      const assortment = offer.variant.item.countries.find((c) => c.countryId === caseRow.countryId);
      if (!assortment?.available) {
        throw Errors.serviceDisabled('Product is not available in this country.');
      }
      commercialLines.push({
        offer_id: offer.id,
        variant_id: offer.variantId,
        qty,
        lot_id: mapping.inventoryLotId,
        catalog_item_id: mapping.catalogItemId,
      });
    }

    const cart = await this.carts.seedRxHandoffCart(principal, {
      countryCode: country.isoAlpha2,
      sellerOrgId: caseRow.organizationId,
      dispensingCaseId: caseRow.id,
      dispenseEventId: complete.id,
      lines: commercialLines.map((l) => ({
        offerId: l.offer_id,
        qty: l.qty,
        prescriptionCaseId: caseRow.id,
      })),
      idempotencyKey: `${idempotencyKey}:seed`,
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.rxCommerceHandoff.upsert({
        where: { handoffKey },
        create: {
          id: uuidv7(),
          handoffKey,
          customerPersonId: principal.personId,
          countryId: caseRow.countryId,
          dispensingCaseId: caseRow.id,
          dispenseEventId: complete.id,
          prescriptionId: caseRow.prescriptionId,
          prescriptionVersionId: caseRow.prescriptionVersionId,
          cartId: cart.id as string,
        },
        update: {
          cartId: cart.id as string,
          updatedAt: new Date(),
        },
      });
      await this.outbox.enqueue(tx, {
        type: 'RX_CHECKOUT_STARTED',
        aggregateType: 'rx_commerce_handoff',
        aggregateId: caseRow.id,
        producer: 'clinical',
        payload: {
          dispensing_case_id: caseRow.id,
          dispense_event_id: complete.id,
          prescription_id: caseRow.prescriptionId,
          cart_id: cart.id,
        },
        occurrenceKey: `RX_CHECKOUT_STARTED:${handoffKey}`,
      });
    });

    return {
      handoff_key: handoffKey,
      dispensing_case_id: caseRow.id,
      dispense_event_id: complete.id,
      prescription_id: caseRow.prescriptionId,
      cart_id: cart.id,
      cart,
      order_id: null,
      already_ordered: false,
      skip_inventory_hold: true,
      commercial_lines: commercialLines,
      ed_r5d_01: 'option_b_skip_order_pick',
      od_doc_10: 'patient_driven',
      next: 'Attach address, quote, pay via existing /me/checkout APIs',
    };
  }
}
