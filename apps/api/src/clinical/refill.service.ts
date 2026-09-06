import { Injectable } from '@nestjs/common';
import {
  ClinicalRelationshipStatus,
  ConsentGrantStatus,
  DispenseEventKind,
  DispensingCaseStatus,
  PrescriptionStatus,
  RefillRequestStatus,
  RxSubscriptionStatus,
} from '@prisma/client';
import { uuidv7 } from '@world-pharma/shared';
import { PrismaService } from '../app/prisma.service';
import { Errors } from '../common/problem';
import { OutboxService } from '../events/outbox.service';
import type { Principal } from '../identity/current-principal';
import { PolicyResolver } from '../policy/resolver';
import { DispensingService } from './dispensing.service';
import { RxFulfillmentSafetyGate } from './rx-fulfillment-safety-gate';

const OPEN_REFILL: RefillRequestStatus[] = [
  RefillRequestStatus.REQUESTED,
  RefillRequestStatus.PENDING_REAUTH,
  RefillRequestStatus.APPROVED,
  RefillRequestStatus.QUEUED_FOR_DISPENSE,
];

/**
 * R5-E refill request / re-auth (Book 119).
 * ED-R5E-01: fail-closed + request/re-auth. No auto-Rx / no silent substitution.
 * Subscription auto-execute remains OFF unless pack explicitly enables both flags.
 */
@Injectable()
export class RefillService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PolicyResolver,
    private readonly outbox: OutboxService,
    private readonly dispensing: DispensingService,
    private readonly rxFulfillmentSafety: RxFulfillmentSafetyGate,
  ) {}

  async eligibility(principal: Principal, prescriptionId: string) {
    const decision = await this.evaluateEligibility(principal.personId, prescriptionId);
    const open = await this.prisma.refillRequest.findFirst({
      where: {
        prescriptionId,
        customerPersonId: principal.personId,
        status: { in: OPEN_REFILL },
      },
      orderBy: { createdAt: 'desc' },
    });
    const subscription = await this.prisma.rxSubscription.findUnique({
      where: {
        prescriptionId_customerPersonId: {
          prescriptionId,
          customerPersonId: principal.personId,
        },
      },
    });
    return {
      ...decision,
      open_request_id: open?.id ?? null,
      open_request_status: open?.status ?? null,
      subscription: this.presentSubscription(subscription),
      ed_r5e_01: 'fail_closed_request_reauth',
      auto_refill: false,
    };
  }

  async requestRefill(
    principal: Principal,
    input: { prescription_id: string },
    idempotencyKey: string,
  ) {
    if (!idempotencyKey?.trim()) {
      throw Errors.validation('Idempotency-Key is required.');
    }
    const existing = await this.prisma.refillRequest.findUnique({
      where: { idempotencyKey },
    });
    if (existing) {
      return this.presentRequest(existing.id);
    }

    const decision = await this.evaluateEligibility(principal.personId, input.prescription_id);
    if (!decision.eligible) {
      throw Errors.problem(
        409,
        'REFILL_NOT_ELIGIBLE',
        'Refill not eligible',
        decision.reason ?? 'Refill is not available for this prescription.',
      );
    }

    const open = await this.prisma.refillRequest.findFirst({
      where: {
        prescriptionId: input.prescription_id,
        customerPersonId: principal.personId,
        status: { in: OPEN_REFILL },
      },
    });
    if (open) {
      return this.presentRequest(open.id);
    }

    const requireDoctor = decision.require_doctor_reauth;
    const initial = requireDoctor
      ? RefillRequestStatus.PENDING_REAUTH
      : RefillRequestStatus.PENDING_REAUTH; // ED-R5E-01: always human clinical re-auth path (doctor or pharmacist)

    const id = uuidv7();
    await this.prisma.$transaction(async (tx) => {
      await tx.refillRequest.create({
        data: {
          id,
          prescriptionId: decision.prescription_id,
          prescriptionVersionId: decision.prescription_version_id!,
          customerPersonId: principal.personId,
          countryId: decision.country_id!,
          status: initial,
          eligibilityReasonCode: decision.reason,
          eligibilitySnapshot: decision.snapshot as object,
          idempotencyKey,
        },
      });
      await tx.refillRequestHistory.create({
        data: {
          id: uuidv7(),
          requestId: id,
          fromStatus: RefillRequestStatus.REQUESTED,
          toStatus: initial,
          actorPersonId: principal.personId,
          reasonCode: 'customer_request',
        },
      });
      await this.outbox.enqueue(tx, {
        type: 'REFILL_REQUESTED',
        aggregateType: 'refill_request',
        aggregateId: id,
        producer: 'clinical',
        payload: {
          refill_request_id: id,
          prescription_id: decision.prescription_id,
          status: initial,
          customer_person_id: principal.personId,
        },
        occurrenceKey: `REFILL_REQUESTED:${id}`,
      });
    });
    return this.presentRequest(id);
  }

  async listCustomerRequests(principal: Principal) {
    const rows = await this.prisma.refillRequest.findMany({
      where: { customerPersonId: principal.personId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return { requests: await Promise.all(rows.map((r) => this.presentRequest(r.id))) };
  }

  async listDoctorPending(principal: Principal) {
    const profiles = await this.prisma.doctorProfile.findMany({
      where: { personId: principal.personId },
      select: { id: true, partnerId: true },
    });
    if (!profiles.length) {
      return { requests: [] };
    }
    const partnerIds = new Set(profiles.map((p) => p.partnerId));
    const profileIds = new Set(profiles.map((p) => p.id));
    const pending = await this.prisma.refillRequest.findMany({
      where: { status: RefillRequestStatus.PENDING_REAUTH },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
    const rxIds = [...new Set(pending.map((r) => r.prescriptionId))];
    const rxs = await this.prisma.prescription.findMany({
      where: { id: { in: rxIds } },
      select: { id: true, doctorPartnerId: true, doctorProfileId: true },
    });
    const allowed = new Set(
      rxs
        .filter((rx) => partnerIds.has(rx.doctorPartnerId) || profileIds.has(rx.doctorProfileId))
        .map((rx) => rx.id),
    );
    const rows = pending.filter((r) => allowed.has(r.prescriptionId)).slice(0, 50);
    return { requests: await Promise.all(rows.map((r) => this.presentRequest(r.id))) };
  }

  async approve(principal: Principal, requestId: string, idempotencyKey: string) {
    if (!idempotencyKey?.trim()) {
      throw Errors.validation('Idempotency-Key is required.');
    }
    const row = await this.prisma.refillRequest.findUnique({ where: { id: requestId } });
    if (!row) {
      throw Errors.notFound('Refill request not found');
    }
    if (row.status === RefillRequestStatus.QUEUED_FOR_DISPENSE && row.dispensingCaseId) {
      return this.presentRequest(row.id);
    }
    if (row.status === RefillRequestStatus.APPROVED && row.dispensingCaseId) {
      return this.presentRequest(row.id);
    }
    if (row.status !== RefillRequestStatus.PENDING_REAUTH && row.status !== RefillRequestStatus.REQUESTED) {
      throw Errors.problem(409, 'REFILL_ILLEGAL_TRANSITION', 'Illegal transition', `Cannot approve from ${row.status}`);
    }

    await this.assertDoctorMayDecide(principal, row.prescriptionId);

    const country = await this.prisma.country.findUniqueOrThrow({ where: { id: row.countryId } });
    const resolved = await this.policy.resolvePublished(country.isoAlpha2);
    if (!this.policy.isRxRefillEnabled(resolved?.document ?? null)) {
      throw Errors.serviceDisabled('Refill is disabled for this country pack.');
    }

    // Re-check expiry / cancellation at approval time (fail closed).
    const recheck = await this.evaluateEligibility(row.customerPersonId, row.prescriptionId);
    if (!recheck.eligible && recheck.reason !== 'open_request_exists') {
      if (recheck.reason === 'prescription_expired' || recheck.reason === 'version_expired') {
        await this.transition(row.id, RefillRequestStatus.EXPIRED_BLOCKED, principal.personId, 'expired_at_approval');
        throw Errors.problem(409, 'PRESCRIPTION_EXPIRED', 'Prescription expired', 'Prescription is no longer valid for refill.');
      }
      throw Errors.problem(409, 'REFILL_NOT_ELIGIBLE', 'Refill not eligible', recheck.reason ?? 'Not eligible');
    }

    const queued = await this.dispensing.enqueueForRefill({
      prescriptionVersionId: row.prescriptionVersionId,
      refillRequestId: row.id,
      actorPersonId: principal.personId,
    });
    if (!queued.accepted || !queued.case_id) {
      throw Errors.problem(409, 'REFILL_ENQUEUE_FAILED', 'Enqueue failed', queued.reason ?? 'Could not queue dispensing case');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.refillRequest.update({
        where: { id: row.id },
        data: {
          status: RefillRequestStatus.QUEUED_FOR_DISPENSE,
          decidedByPersonId: principal.personId,
          decidedAt: new Date(),
          decisionReasonCode: 'doctor_approved',
          dispensingCaseId: queued.case_id!,
        },
      });
      await tx.refillRequestHistory.create({
        data: {
          id: uuidv7(),
          requestId: row.id,
          fromStatus: row.status,
          toStatus: RefillRequestStatus.QUEUED_FOR_DISPENSE,
          actorPersonId: principal.personId,
          reasonCode: 'doctor_approved',
        },
      });
      await this.outbox.enqueue(tx, {
        type: 'REFILL_APPROVED',
        aggregateType: 'refill_request',
        aggregateId: row.id,
        producer: 'clinical',
        payload: {
          refill_request_id: row.id,
          dispensing_case_id: queued.case_id,
          prescription_id: row.prescriptionId,
          customer_person_id: row.customerPersonId,
          actor_person_id: principal.personId,
        },
        occurrenceKey: `REFILL_APPROVED:${row.id}:${idempotencyKey}`,
      });
    });
    return this.presentRequest(row.id);
  }

  async reject(principal: Principal, requestId: string, reasonCode: string | undefined, idempotencyKey: string) {
    if (!idempotencyKey?.trim()) {
      throw Errors.validation('Idempotency-Key is required.');
    }
    const row = await this.prisma.refillRequest.findUnique({ where: { id: requestId } });
    if (!row) {
      throw Errors.notFound('Refill request not found');
    }
    if (row.status === RefillRequestStatus.REJECTED) {
      return this.presentRequest(row.id);
    }
    if (row.status !== RefillRequestStatus.PENDING_REAUTH && row.status !== RefillRequestStatus.REQUESTED) {
      throw Errors.problem(409, 'REFILL_ILLEGAL_TRANSITION', 'Illegal transition', `Cannot reject from ${row.status}`);
    }
    await this.assertDoctorMayDecide(principal, row.prescriptionId);
    await this.transition(row.id, RefillRequestStatus.REJECTED, principal.personId, reasonCode ?? 'doctor_rejected');
    await this.prisma.$transaction(async (tx) => {
      await tx.refillRequest.update({
        where: { id: row.id },
        data: {
          decidedByPersonId: principal.personId,
          decidedAt: new Date(),
          decisionReasonCode: reasonCode ?? 'doctor_rejected',
        },
      });
      await this.outbox.enqueue(tx, {
        type: 'REFILL_REJECTED',
        aggregateType: 'refill_request',
        aggregateId: row.id,
        producer: 'clinical',
        payload: {
          refill_request_id: row.id,
          reason_code: reasonCode ?? 'doctor_rejected',
          customer_person_id: row.customerPersonId,
          actor_person_id: principal.personId,
        },
        occurrenceKey: `REFILL_REJECTED:${row.id}:${idempotencyKey}`,
      });
    });
    return this.presentRequest(row.id);
  }

  async cancelCustomer(principal: Principal, requestId: string, idempotencyKey: string) {
    if (!idempotencyKey?.trim()) {
      throw Errors.validation('Idempotency-Key is required.');
    }
    const row = await this.prisma.refillRequest.findFirst({
      where: { id: requestId, customerPersonId: principal.personId },
    });
    if (!row) {
      throw Errors.notFound('Refill request not found');
    }
    if (row.status === RefillRequestStatus.CANCELLED) {
      return this.presentRequest(row.id);
    }
    if (
      row.status === RefillRequestStatus.QUEUED_FOR_DISPENSE ||
      row.status === RefillRequestStatus.APPROVED
    ) {
      throw Errors.problem(409, 'REFILL_ILLEGAL_TRANSITION', 'Illegal transition', 'Cannot cancel after clinical approval/queue.');
    }
    await this.transition(row.id, RefillRequestStatus.CANCELLED, principal.personId, 'customer_cancelled');
    return this.presentRequest(row.id);
  }

  async adminCancel(principal: Principal, requestId: string) {
    if (principal.audience !== 'admin') {
      throw Errors.forbidden('Admin session required');
    }
    const row = await this.prisma.refillRequest.findUnique({ where: { id: requestId } });
    if (!row) {
      throw Errors.notFound('Refill request not found');
    }
    if (row.status === RefillRequestStatus.CANCELLED) {
      return this.presentRequest(row.id);
    }
    if (
      row.status === RefillRequestStatus.QUEUED_FOR_DISPENSE ||
      row.status === RefillRequestStatus.APPROVED
    ) {
      throw Errors.problem(
        409,
        'REFILL_ILLEGAL_TRANSITION',
        'Illegal transition',
        'Cannot cancel after clinical approval/queue. Doctor reject is on the doctor portal.',
      );
    }
    await this.transition(row.id, RefillRequestStatus.CANCELLED, principal.personId, 'ops_cancelled');
    return this.presentRequest(row.id);
  }

  async adminList(limit = 50) {
    const rows = await this.prisma.refillRequest.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(100, Math.max(1, limit)),
    });
    return {
      requests: rows.map((r) => ({
        id: r.id,
        prescription_id: r.prescriptionId,
        status: r.status,
        eligibility_reason_code: r.eligibilityReasonCode,
        dispensing_case_id: r.dispensingCaseId,
        customer_person_id: r.customerPersonId,
        created_at: r.createdAt.toISOString(),
        decided_at: r.decidedAt?.toISOString() ?? null,
      })),
    };
  }

  /** Subscription foundation: never auto-executes payments/dispenses while gated OFF. */
  async getOrCreateSubscriptionView(principal: Principal, prescriptionId: string) {
    const rx = await this.prisma.prescription.findFirst({
      where: { id: prescriptionId, patientPersonId: principal.personId },
    });
    if (!rx) {
      throw Errors.notFound('Prescription not found');
    }
    const country = await this.prisma.country.findUniqueOrThrow({ where: { id: rx.countryId } });
    const resolved = await this.policy.resolvePublished(country.isoAlpha2);
    const packAllows = this.policy.isRxSubscriptionEnabled(resolved?.document ?? null);
    let row = await this.prisma.rxSubscription.findUnique({
      where: {
        prescriptionId_customerPersonId: { prescriptionId, customerPersonId: principal.personId },
      },
    });
    if (!row) {
      row = await this.prisma.rxSubscription.create({
        data: {
          id: uuidv7(),
          prescriptionId,
          customerPersonId: principal.personId,
          countryId: rx.countryId,
          status: RxSubscriptionStatus.DISABLED,
          autoExecuteEnabled: false,
        },
      });
    }
    return this.wrapSubscriptionView(row, resolved?.document ?? null, packAllows);
  }

  private wrapSubscriptionView(
    row: {
      id: string;
      status: RxSubscriptionStatus;
      autoExecuteEnabled: boolean;
      nextAttemptAt: Date | null;
      pauseReasonCode: string | null;
    },
    document: Parameters<PolicyResolver['isRxSubscriptionEnabled']>[0],
    packAllows?: boolean,
  ) {
    const subscriptionEnabled = packAllows ?? this.policy.isRxSubscriptionEnabled(document);
    return {
      ...this.presentSubscription(row),
      pack_subscription_enabled: subscriptionEnabled,
      pack_auto_execute_enabled: this.policy.isRxSubscriptionAutoExecuteEnabled(document),
      message: subscriptionEnabled
        ? row.status === RxSubscriptionStatus.ACTIVE
          ? 'Refill reminders are on. We will notify you — automatic payment and dispense stay off in sandbox.'
          : 'Turn on refill reminders to get notified when it is time to reorder. Automatic refill stays off.'
        : 'Automatic refill / subscription is unavailable for this country pack.',
    };
  }

  /** Reminder-mode subscription — never turns on auto_execute (ED-R5E-01). */
  async enableSubscription(principal: Principal, prescriptionId: string) {
    const rx = await this.prisma.prescription.findFirst({
      where: { id: prescriptionId, patientPersonId: principal.personId },
      include: {
        currentVersion: { include: { lines: { orderBy: { lineNumber: 'asc' }, take: 1 } } },
      },
    });
    if (!rx) {
      throw Errors.notFound('Prescription not found');
    }
    if (
      rx.status === PrescriptionStatus.DRAFT ||
      rx.status === PrescriptionStatus.CANCELLED ||
      rx.status === PrescriptionStatus.EXPIRED
    ) {
      throw Errors.validation('Subscription is not available for this prescription status.');
    }
    const country = await this.prisma.country.findUniqueOrThrow({ where: { id: rx.countryId } });
    const resolved = await this.policy.resolvePublished(country.isoAlpha2);
    const packAllows = this.policy.isRxSubscriptionEnabled(resolved?.document ?? null);
    if (!packAllows) {
      throw Errors.problem(
        403,
        'SUBSCRIPTION_UNAVAILABLE',
        'Subscription unavailable',
        'Medicine subscription / refill reminders are not enabled for your region.',
      );
    }
    let row = await this.prisma.rxSubscription.findUnique({
      where: {
        prescriptionId_customerPersonId: { prescriptionId, customerPersonId: principal.personId },
      },
    });
    if (!row) {
      row = await this.prisma.rxSubscription.create({
        data: {
          id: uuidv7(),
          prescriptionId,
          customerPersonId: principal.personId,
          countryId: rx.countryId,
          status: RxSubscriptionStatus.DISABLED,
          autoExecuteEnabled: false,
        },
      });
    }
    if (row.status === RxSubscriptionStatus.ACTIVE) {
      return this.wrapSubscriptionView(row, resolved?.document ?? null);
    }
    const reminderAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const updated = await this.prisma.rxSubscription.update({
      where: { id: row.id },
      data: {
        status: RxSubscriptionStatus.ACTIVE,
        autoExecuteEnabled: false,
        pauseReasonCode: null,
        nextAttemptAt: reminderAt,
      },
    });
    return this.wrapSubscriptionView(updated, resolved?.document ?? null);
  }

  async listCustomerSubscriptions(principal: Principal) {
    const rows = await this.prisma.rxSubscription.findMany({
      where: { customerPersonId: principal.personId },
      orderBy: { updatedAt: 'desc' },
    });
    const prescriptionIds = [...new Set(rows.map((r) => r.prescriptionId))];
    const prescriptions = prescriptionIds.length
      ? await this.prisma.prescription.findMany({
          where: { id: { in: prescriptionIds }, patientPersonId: principal.personId },
          include: {
            currentVersion: { include: { lines: { orderBy: { lineNumber: 'asc' }, take: 1 } } },
          },
        })
      : [];
    const rxById = new Map(prescriptions.map((rx) => [rx.id, rx]));
    const countryIds = [...new Set(rows.map((r) => r.countryId))];
    const countries = countryIds.length
      ? await this.prisma.country.findMany({ where: { id: { in: countryIds } } })
      : [];
    const packByCountry = new Map<string, Parameters<PolicyResolver['isRxSubscriptionEnabled']>[0]>();
    for (const country of countries) {
      const resolved = await this.policy.resolvePublished(country.isoAlpha2);
      packByCountry.set(country.id, resolved?.document ?? null);
    }
    return {
      subscriptions: rows
        .map((row) => {
          const rx = rxById.get(row.prescriptionId);
          if (!rx || rx.status === PrescriptionStatus.CANCELLED) {
            return null;
          }
          const document = packByCountry.get(row.countryId) ?? null;
          const line = rx.currentVersion?.lines?.[0];
          return {
            prescription_id: row.prescriptionId,
            prescription_status: rx.status,
            prescription_version_number: rx.currentVersion?.versionNumber ?? null,
            medicine_label: line?.clinicalConceptLabel ?? null,
            ...this.wrapSubscriptionView(row, document),
          };
        })
        .filter((row): row is NonNullable<typeof row> => row !== null),
    };
  }

  async pauseSubscription(principal: Principal, prescriptionId: string) {
    const row = await this.requireOwnedSubscription(principal, prescriptionId);
    if (row.status !== RxSubscriptionStatus.ACTIVE) {
      throw Errors.problem(409, 'SUBSCRIPTION_ILLEGAL_TRANSITION', 'Illegal transition', 'Only active subscriptions may be paused.');
    }
    const updated = await this.prisma.rxSubscription.update({
      where: { id: row.id },
      data: {
        status: RxSubscriptionStatus.PAUSED,
        autoExecuteEnabled: false,
        pauseReasonCode: 'customer_pause',
      },
    });
    const document = await this.subscriptionPolicyDocument(row.countryId);
    return this.wrapSubscriptionView(updated, document);
  }

  async cancelSubscription(principal: Principal, prescriptionId: string) {
    const row = await this.requireOwnedSubscription(principal, prescriptionId);
    const document = await this.subscriptionPolicyDocument(row.countryId);
    if (row.status === RxSubscriptionStatus.CANCELLED || row.status === RxSubscriptionStatus.DISABLED) {
      return this.wrapSubscriptionView(row, document);
    }
    const updated = await this.prisma.rxSubscription.update({
      where: { id: row.id },
      data: {
        status: RxSubscriptionStatus.CANCELLED,
        autoExecuteEnabled: false,
        pauseReasonCode: 'customer_cancel',
        nextAttemptAt: null,
      },
    });
    return this.wrapSubscriptionView(updated, document);
  }

  /**
   * Hard gate: recurring execution never runs unless pack enables BOTH subscription + auto_execute
   * AND row.autoExecuteEnabled. Default path always returns disabled.
   * S156: evaluates due rows for machine-readable decisions without executing fulfillment.
   */
  async tryExecuteDueSubscriptions(): Promise<{
    executed: number;
    skipped: string;
    decisions: Array<{
      subscription_id: string;
      decision: string;
      reason_code: string;
      execution_authorized: boolean;
    }>;
  }> {
    const due = await this.prisma.rxSubscription.findMany({
      where: {
        status: RxSubscriptionStatus.ACTIVE,
        autoExecuteEnabled: true,
        OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: new Date() } }],
      },
      take: 50,
      select: { id: true },
    });
    const decisions = [];
    for (const row of due) {
      const result = await this.rxFulfillmentSafety.evaluateSubscriptionAutoExecute({
        subscriptionId: row.id,
      });
      await this.rxFulfillmentSafety.auditGateDecision({
        decision: result,
        context: 'auto_execute',
      });
      decisions.push({
        subscription_id: row.id,
        decision: result.decision,
        reason_code: result.reason_code,
        execution_authorized: result.execution_authorized,
      });
    }
    // Never auto-execute in this software path — OD-RX-REFILL / ED-R5E-01.
    return {
      executed: 0,
      skipped:
        due.length === 0
          ? 'auto_execute_disabled_ed_r5e_01'
          : 'auto_execute_worker_not_authorized',
      decisions,
    };
  }

  private async subscriptionPolicyDocument(countryId: string) {
    const country = await this.prisma.country.findUniqueOrThrow({ where: { id: countryId } });
    const resolved = await this.policy.resolvePublished(country.isoAlpha2);
    return resolved?.document ?? null;
  }

  private async requireOwnedSubscription(principal: Principal, prescriptionId: string) {
    const row = await this.prisma.rxSubscription.findUnique({
      where: {
        prescriptionId_customerPersonId: { prescriptionId, customerPersonId: principal.personId },
      },
    });
    if (!row) {
      throw Errors.notFound('Subscription not found');
    }
    return row;
  }

  private presentSubscription(
    row: {
      id: string;
      status: RxSubscriptionStatus;
      autoExecuteEnabled: boolean;
      nextAttemptAt: Date | null;
      pauseReasonCode: string | null;
    } | null,
  ) {
    if (!row) {
      return {
        available: false,
        status: 'DISABLED',
        auto_execute_enabled: false,
        next_attempt_at: null,
        note: 'Automatic refill is unavailable unless explicitly configured.',
      };
    }
    return {
      available: true,
      id: row.id,
      status: row.status,
      auto_execute_enabled: false, // never advertise true execution in present layer unless pack+row both on — still force false in API surface for safety
      next_attempt_at: row.nextAttemptAt?.toISOString() ?? null,
      pause_reason_code: row.pauseReasonCode,
      note:
        row.autoExecuteEnabled === true
          ? 'auto_execute flag present but scheduler remains inert until legal/pack gate + worker authorization'
          : 'Automatic refill is OFF (ED-R5E-01).',
    };
  }

  private async transition(
    requestId: string,
    to: RefillRequestStatus,
    actorPersonId: string,
    reasonCode: string,
  ) {
    const row = await this.prisma.refillRequest.findUniqueOrThrow({ where: { id: requestId } });
    await this.prisma.$transaction(async (tx) => {
      await tx.refillRequest.update({
        where: { id: requestId },
        data: { status: to },
      });
      await tx.refillRequestHistory.create({
        data: {
          id: uuidv7(),
          requestId,
          fromStatus: row.status,
          toStatus: to,
          actorPersonId,
          reasonCode,
        },
      });
    });
  }

  private async assertDoctorMayDecide(principal: Principal, prescriptionId: string) {
    const rx = await this.prisma.prescription.findUnique({ where: { id: prescriptionId } });
    if (!rx) {
      throw Errors.notFound('Prescription not found');
    }
    const profile = await this.prisma.doctorProfile.findFirst({
      where: {
        personId: principal.personId,
        OR: [{ id: rx.doctorProfileId }, { partnerId: rx.doctorPartnerId }],
      },
    });
    if (!profile) {
      throw Errors.forbidden('Only the prescribing doctor may authorize this refill.');
    }
  }

  private async evaluateEligibility(patientPersonId: string, prescriptionId: string) {
    const rx = await this.prisma.prescription.findUnique({
      where: { id: prescriptionId },
      include: {
        currentVersion: { include: { lines: true } },
        versions: { orderBy: { versionNumber: 'desc' }, take: 1, include: { lines: true } },
      },
    });
    const deny = (reason: string, extra: Record<string, unknown> = {}) => ({
      eligible: false,
      reason,
      prescription_id: prescriptionId,
      prescription_status: rx?.status ?? null,
      prescription_version_id: rx?.currentVersionId ?? null,
      country_id: rx?.countryId ?? null,
      require_doctor_reauth: true,
      prior_dispensing_case_id: null as string | null,
      snapshot: { reason, ...extra },
      od_rx_refill: 'unresolved_human_legal',
    });

    if (!rx || rx.patientPersonId !== patientPersonId) {
      return deny('not_found_or_not_owner');
    }
    if (rx.status === PrescriptionStatus.DRAFT) {
      return deny('prescription_draft');
    }
    if (rx.status === PrescriptionStatus.CANCELLED) {
      return deny('prescription_cancelled');
    }
    if (rx.status === PrescriptionStatus.EXPIRED) {
      return deny('prescription_expired');
    }
    if (rx.status !== PrescriptionStatus.ISSUED && rx.status !== PrescriptionStatus.FULLY_DISPENSED) {
      return deny('prescription_status_not_refillable', { status: rx.status });
    }

    const version = rx.currentVersion ?? rx.versions[0];
    if (!version?.sealedAt) {
      return deny('version_not_sealed');
    }
    const now = new Date();
    if (version.validUntil && version.validUntil < now) {
      return deny('version_expired');
    }
    if (version.validFrom && version.validFrom > now) {
      return deny('version_not_yet_valid');
    }

    const country = await this.prisma.country.findUnique({ where: { id: rx.countryId } });
    if (!country) {
      return deny('country_missing');
    }
    const resolved = await this.policy.resolvePublished(country.isoAlpha2);
    const doc = resolved?.document ?? null;
    if (!doc) {
      return deny('policy_missing');
    }
    if (!this.policy.isRxRefillEnabled(doc)) {
      return deny('rx_refill_disabled');
    }
    if (!this.policy.isRxDispenseEnabled(doc)) {
      return deny('rx_dispense_disabled');
    }

    for (const line of version.lines ?? []) {
      if (!this.policy.isRestrictionCodeAllowed(doc, line.restrictionCategoryCode)) {
        return deny('medication_restriction', { code: line.restrictionCategoryCode });
      }
    }

    const rel = await this.prisma.clinicalRelationship.findFirst({
      where: {
        patientPersonId,
        doctorPartnerId: rx.doctorPartnerId,
        status: ClinicalRelationshipStatus.ACTIVE,
      },
    });
    if (!rel) {
      return deny('clinical_relationship_missing');
    }

    if (this.policy.isBookingConsentRequired(doc)) {
      const consent = await this.prisma.consentGrant.findFirst({
        where: {
          subjectPersonId: patientPersonId,
          recipientPartnerId: rx.doctorPartnerId,
          status: ConsentGrantStatus.ACTIVE,
        },
      });
      if (!consent) {
        return deny('consent_missing');
      }
    }

    const priorDispense = await this.prisma.dispensingCase.findFirst({
      where: {
        prescriptionId,
        status: DispensingCaseStatus.DISPENSED,
      },
      orderBy: { updatedAt: 'desc' },
    });
    if (!priorDispense) {
      return deny('no_prior_dispense');
    }

    const openCase = await this.prisma.dispensingCase.findFirst({
      where: {
        prescriptionVersionId: version.id,
        status: {
          in: [
            DispensingCaseStatus.QUEUED,
            DispensingCaseStatus.VALIDATING,
            DispensingCaseStatus.AUTHORIZED_TO_DISPENSE,
            DispensingCaseStatus.DISPENSING,
          ],
        },
      },
    });
    if (openCase) {
      return deny('open_dispensing_case', { case_id: openCase.id });
    }

    const requireDoctor = this.policy.isRxRefillDoctorReauthRequired(doc);
    return {
      eligible: true,
      reason: 'ok',
      prescription_id: prescriptionId,
      prescription_status: rx.status,
      prescription_version_id: version.id,
      country_id: rx.countryId,
      require_doctor_reauth: requireDoctor,
      prior_dispensing_case_id: priorDispense.id,
      snapshot: {
        reason: 'ok',
        require_doctor_reauth: requireDoctor,
        prior_dispensing_case_id: priorDispense.id,
        pack_refill: true,
        subscription_auto_execute: false,
      },
      od_rx_refill: 'unresolved_human_legal',
    };
  }

  private async presentRequest(id: string) {
    const row = await this.prisma.refillRequest.findUniqueOrThrow({
      where: { id },
      include: { history: { orderBy: { createdAt: 'asc' } } },
    });
    let orderId: string | null = null;
    if (row.dispensingCaseId) {
      const complete = await this.prisma.dispenseEvent.findFirst({
        where: { caseId: row.dispensingCaseId, kind: DispenseEventKind.COMPLETE },
        orderBy: { createdAt: 'desc' },
      });
      if (complete) {
        const order = await this.prisma.order.findUnique({
          where: { dispenseEventId: complete.id },
          select: { id: true },
        });
        orderId = order?.id ?? null;
      }
    }
    return {
      id: row.id,
      prescription_id: row.prescriptionId,
      prescription_version_id: row.prescriptionVersionId,
      status: row.status,
      eligibility_reason_code: row.eligibilityReasonCode,
      dispensing_case_id: row.dispensingCaseId,
      order_id: orderId,
      decided_at: row.decidedAt?.toISOString() ?? null,
      decision_reason_code: row.decisionReasonCode,
      created_at: row.createdAt.toISOString(),
      history: row.history.map((h) => ({
        from_status: h.fromStatus,
        to_status: h.toStatus,
        reason_code: h.reasonCode,
        created_at: h.createdAt.toISOString(),
      })),
      next:
        row.status === RefillRequestStatus.QUEUED_FOR_DISPENSE
          ? 'Pharmacy desk processes new DispensingCase; then patient uses R5-D Order medicines handoff'
          : row.status === RefillRequestStatus.PENDING_REAUTH
            ? 'Awaiting doctor clinical re-authorization'
            : null,
      ed_r5e_01: 'fail_closed_request_reauth',
    };
  }
}
