import { Injectable } from '@nestjs/common';
import {
  DispenseEventKind,
  DispensingCaseStatus,
  PrescriptionStatus,
  RxSubscriptionStatus,
} from '@prisma/client';
import { PrismaService } from '../app/prisma.service';
import { PolicyResolver } from '../policy/resolver';
import { OutboxService } from '../events/outbox.service';
import { uuidv7 } from '@world-pharma/shared';

/**
 * S156 — Provider-neutral Rx fulfillment / auto-execute safety gate.
 * Fail-closed. Does not invent medical rules beyond existing domain fields.
 * Never logs clinical line content.
 */

export type RxFulfillmentDecision = 'ELIGIBLE' | 'AUTO_EXECUTE' | 'REVIEW_REQUIRED' | 'BLOCKED';

export type RxFulfillmentGateResult = {
  decision: RxFulfillmentDecision;
  reason_code: string;
  customer_message: string;
  dispensing_case_id?: string;
  prescription_id?: string;
  dispense_event_id?: string;
  already_ordered?: boolean;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

@Injectable()
export class RxFulfillmentSafetyGate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PolicyResolver,
    private readonly outbox: OutboxService,
  ) {}

  /**
   * Evaluate whether a marketplace/cart prescription_case_id may authorize Rx checkout.
   * ELIGIBLE only when the case is a real patient-owned DISPENSED case with COMPLETE + mappings.
   */
  async evaluateCommerceAttach(input: {
    customerPersonId: string;
    countryId: string;
    prescriptionCaseId: string | null | undefined;
    catalogVariantId?: string;
    qty?: number;
  }): Promise<RxFulfillmentGateResult> {
    if (!input.prescriptionCaseId) {
      return this.blocked('RX_REQUIRED', 'Attach a verified prescription case before checkout.');
    }
    if (!isUuid(input.prescriptionCaseId)) {
      return this.blocked('RX_CASE_INVALID', 'Prescription case reference is invalid.');
    }

    const caseRow = await this.prisma.dispensingCase.findUnique({
      where: { id: input.prescriptionCaseId },
      include: {
        prescription: {
          select: {
            id: true,
            status: true,
            patientPersonId: true,
            countryId: true,
            currentVersionId: true,
          },
        },
        prescriptionVersion: {
          select: {
            id: true,
            sealedAt: true,
            validFrom: true,
            validUntil: true,
          },
        },
        lineMappings: {
          select: {
            catalogVariantId: true,
            catalogItemId: true,
            quantityDispensed: true,
          },
        },
        events: {
          where: { kind: DispenseEventKind.COMPLETE },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { id: true },
        },
      },
    });

    if (!caseRow) {
      return this.blocked('RX_CASE_NOT_FOUND', 'Prescription case was not found.');
    }

    if (caseRow.prescription.patientPersonId !== input.customerPersonId) {
      return this.blocked('RX_PATIENT_MISMATCH', 'Prescription does not belong to this customer.');
    }

    if (caseRow.countryId !== input.countryId || caseRow.prescription.countryId !== input.countryId) {
      return this.blocked('RX_COUNTRY_MISMATCH', 'Prescription country does not match the cart market.');
    }

    const rxStatus = caseRow.prescription.status;
    if (rxStatus === PrescriptionStatus.CANCELLED) {
      return this.blocked('RX_REVOKED', 'Prescription was cancelled and cannot be fulfilled.');
    }
    if (rxStatus === PrescriptionStatus.EXPIRED) {
      return this.blocked('RX_EXPIRED', 'Prescription has expired.');
    }
    if (rxStatus === PrescriptionStatus.DRAFT) {
      return this.blocked('RX_DRAFT', 'Draft prescriptions cannot authorize fulfillment.');
    }

    if (
      caseRow.prescription.currentVersionId &&
      caseRow.prescription.currentVersionId !== caseRow.prescriptionVersionId
    ) {
      return this.blocked('RX_VERSION_SUPERSEDED', 'Prescription version is no longer current.');
    }

    if (!caseRow.prescriptionVersion.sealedAt) {
      return this.blocked('RX_VERSION_NOT_SEALED', 'Prescription is not sealed for dispense.');
    }

    const now = new Date();
    const { validFrom, validUntil } = caseRow.prescriptionVersion;
    if (!validFrom && !validUntil) {
      return this.blocked('RX_VALIDITY_UNRESOLVED', 'Prescription validity window is unresolved.');
    }
    if (validFrom && now < validFrom) {
      return this.blocked('RX_NOT_YET_VALID', 'Prescription is not yet valid.');
    }
    if (validUntil && now > validUntil) {
      return this.blocked('RX_EXPIRED', 'Prescription validity window has ended.');
    }

    const country = await this.prisma.country.findUniqueOrThrow({ where: { id: input.countryId } });
    const resolved = await this.policy.resolvePublished(country.isoAlpha2);
    if (!this.policy.isRxDispenseEnabled(resolved?.document ?? null)) {
      return this.blocked('RX_POLICY_DISABLED', 'Prescription fulfillment is disabled for this country pack.');
    }

    if (caseRow.status === DispensingCaseStatus.QUEUED || caseRow.status === DispensingCaseStatus.VALIDATING) {
      return this.review('RX_REVIEW_REQUIRED', 'Pharmacy review is still required before fulfillment.');
    }
    if (caseRow.status === DispensingCaseStatus.AUTHORIZED_TO_DISPENSE || caseRow.status === DispensingCaseStatus.DISPENSING) {
      return this.review('RX_REVIEW_REQUIRED', 'Pharmacy must complete dispense before commerce fulfillment.');
    }
    if (
      caseRow.status === DispensingCaseStatus.REJECTED ||
      caseRow.status === DispensingCaseStatus.FAILED ||
      caseRow.status === DispensingCaseStatus.CANCELLED_CASE ||
      caseRow.status === DispensingCaseStatus.SUPERSEDED
    ) {
      return this.blocked('RX_CASE_NOT_DISPENSABLE', `Dispensing case is ${caseRow.status}.`);
    }
    if (caseRow.status !== DispensingCaseStatus.DISPENSED) {
      return this.review('RX_REVIEW_REQUIRED', 'Prescription case is not ready for fulfillment.');
    }

    const complete = caseRow.events[0] ?? null;
    if (!complete) {
      return this.blocked('RX_MISSING_COMPLETE', 'Dispense completion event is missing.');
    }
    if (!caseRow.lineMappings.length) {
      return this.blocked('RX_MISSING_MAPPINGS', 'Dispense line mappings are missing.');
    }

    if (input.catalogVariantId) {
      const mapped = caseRow.lineMappings.find((m) => m.catalogVariantId === input.catalogVariantId);
      if (!mapped) {
        return this.blocked('RX_SKU_MISMATCH', 'Cart medicine does not match the dispensed prescription mapping.');
      }
      if (input.qty != null) {
        const authorized = Number(mapped.quantityDispensed);
        if (Number.isFinite(authorized) && input.qty > authorized) {
          return this.blocked('RX_QTY_EXCEEDED', 'Quantity exceeds the dispensed prescription quantity.');
        }
      }
    }

    const existingOrder = await this.prisma.order.findUnique({
      where: { dispenseEventId: complete.id },
      select: { id: true },
    });
    if (existingOrder) {
      return {
        decision: 'BLOCKED',
        reason_code: 'RX_ALREADY_EXECUTED',
        customer_message: 'This dispensed prescription already has an order.',
        dispensing_case_id: caseRow.id,
        prescription_id: caseRow.prescriptionId,
        dispense_event_id: complete.id,
        already_ordered: true,
      };
    }

    return {
      decision: 'ELIGIBLE',
      reason_code: 'RX_ELIGIBLE',
      customer_message: 'Prescription case is eligible for fulfillment.',
      dispensing_case_id: caseRow.id,
      prescription_id: caseRow.prescriptionId,
      dispense_event_id: complete.id,
      already_ordered: false,
    };
  }

  /**
   * Evaluate subscription auto-execute without performing execution.
   * Remains fail-closed: never returns AUTO_EXECUTE unless pack+row+eligibility all pass,
   * and even then callers must not execute until a dedicated worker is authorized.
   */
  async evaluateSubscriptionAutoExecute(input: {
    subscriptionId: string;
  }): Promise<RxFulfillmentGateResult & { execution_authorized: boolean }> {
    const row = await this.prisma.rxSubscription.findUnique({
      where: { id: input.subscriptionId },
      include: {
        // prescription relation may not exist on schema — load separately
      },
    });
    if (!row) {
      return { ...this.blocked('SUBSCRIPTION_NOT_FOUND', 'Subscription not found.'), execution_authorized: false };
    }
    if (row.status === RxSubscriptionStatus.CANCELLED || row.status === RxSubscriptionStatus.PAUSED) {
      return {
        ...this.blocked('SUBSCRIPTION_INACTIVE', `Subscription is ${row.status}.`),
        execution_authorized: false,
      };
    }
    if (!row.autoExecuteEnabled) {
      return {
        decision: 'BLOCKED',
        reason_code: 'AUTO_EXECUTE_FLAG_OFF',
        customer_message: 'Automatic refill is off for this subscription.',
        execution_authorized: false,
      };
    }

    const rx = await this.prisma.prescription.findUnique({
      where: { id: row.prescriptionId },
      select: { id: true, status: true, patientPersonId: true, countryId: true },
    });
    if (!rx) {
      return { ...this.blocked('RX_NOT_FOUND', 'Prescription not found.'), execution_authorized: false };
    }
    if (rx.patientPersonId !== row.customerPersonId) {
      return { ...this.blocked('RX_PATIENT_MISMATCH', 'Subscription patient mismatch.'), execution_authorized: false };
    }
    if (rx.status === PrescriptionStatus.CANCELLED || rx.status === PrescriptionStatus.EXPIRED) {
      return {
        ...this.blocked(
          rx.status === PrescriptionStatus.EXPIRED ? 'RX_EXPIRED' : 'RX_REVOKED',
          'Prescription cannot auto-execute.',
        ),
        execution_authorized: false,
      };
    }

    const country = await this.prisma.country.findUniqueOrThrow({ where: { id: rx.countryId } });
    const resolved = await this.policy.resolvePublished(country.isoAlpha2);
    if (!this.policy.isRxSubscriptionAutoExecuteEnabled(resolved?.document ?? null)) {
      return {
        decision: 'BLOCKED',
        reason_code: 'AUTO_EXECUTE_POLICY_OFF',
        customer_message: 'Country pack keeps auto-execute disabled.',
        prescription_id: rx.id,
        execution_authorized: false,
      };
    }

    // Pack+row enabled, but production worker/legal path is not authorized in software.
    return {
      decision: 'REVIEW_REQUIRED',
      reason_code: 'AUTO_EXECUTE_WORKER_NOT_AUTHORIZED',
      customer_message:
        'Auto-execute flags are present but the scheduler remains inert until legal/worker authorization.',
      prescription_id: rx.id,
      execution_authorized: false,
    };
  }

  async auditGateDecision(input: {
    actorPersonId?: string;
    countryId?: string;
    decision: RxFulfillmentGateResult;
    context: 'commerce_attach' | 'auto_execute' | 'fulfillment';
  }): Promise<void> {
    const aggregateId =
      input.decision.dispensing_case_id ?? input.decision.prescription_id ?? uuidv7();
    await this.outbox.enqueue(this.prisma, {
      type: 'RX_FULFILLMENT_SAFETY_GATE',
      aggregateType: 'rx_fulfillment_safety',
      aggregateId,
      producer: 'clinical.rx_fulfillment_safety_gate',
      countryId: input.countryId ?? null,
      actorId: input.actorPersonId ?? null,
      payload: {
        context: input.context,
        decision: input.decision.decision,
        reason_code: input.decision.reason_code,
        dispensing_case_id: input.decision.dispensing_case_id ?? null,
        prescription_id: input.decision.prescription_id ?? null,
        // Explicitly omit clinical content / line text / dosages
      },
      occurrenceKey: `RX_FULFILLMENT_SAFETY_GATE:${input.context}:${aggregateId}:${input.decision.reason_code}:${Date.now()}`,
    });
  }

  private blocked(reason_code: string, customer_message: string): RxFulfillmentGateResult {
    return { decision: 'BLOCKED', reason_code, customer_message };
  }

  private review(reason_code: string, customer_message: string): RxFulfillmentGateResult {
    return { decision: 'REVIEW_REQUIRED', reason_code, customer_message };
  }
}

/** Customer/vendor-safe status labels — no clinical payload. */
export function rxFulfillmentStatusLabel(decision: RxFulfillmentDecision, reasonCode?: string): string {
  if (decision === 'ELIGIBLE' || decision === 'AUTO_EXECUTE') return 'Ready for fulfillment';
  if (decision === 'REVIEW_REQUIRED') return 'Review required';
  switch (reasonCode) {
    case 'RX_REQUIRED':
      return 'Prescription required';
    case 'RX_EXPIRED':
      return 'Expired';
    case 'RX_REVOKED':
      return 'Revoked';
    case 'RX_ALREADY_EXECUTED':
      return 'Already fulfilled';
    case 'RX_SKU_MISMATCH':
    case 'RX_QTY_EXCEEDED':
      return 'Blocked';
    default:
      return 'Blocked';
  }
}
