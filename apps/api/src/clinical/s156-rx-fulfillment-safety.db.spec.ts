/**
 * S156 — Integration-style gate tests against Prisma when DATABASE_URL is available.
 * Uses worker-independent helpers + optional DB fixtures.
 */
import { DispenseEventKind, DispensingCaseStatus, PrescriptionStatus } from '@prisma/client';
import { PrismaClient } from '@world-pharma/database';
import { uuidv7 } from '@world-pharma/shared';
import { OutboxService } from '../events/outbox.service';
import { PolicyResolver } from '../policy/resolver';
import { RxFulfillmentSafetyGate } from './rx-fulfillment-safety-gate';

describe('S156 RxFulfillmentSafetyGate DB', () => {
  const prisma = new PrismaClient();
  let gate: RxFulfillmentSafetyGate;

  beforeAll(() => {
    const policy = {
      resolvePublished: async () => ({
        document: { healthcare: { rx_dispense_enabled: true, rx_subscription_enabled: false, rx_subscription_auto_execute: false } },
      }),
      isRxDispenseEnabled: (doc: { healthcare?: { rx_dispense_enabled?: boolean } } | null) =>
        doc?.healthcare?.rx_dispense_enabled === true,
      isRxSubscriptionAutoExecuteEnabled: () => false,
    } as unknown as PolicyResolver;
    const outbox = { enqueue: async () => ({ id: uuidv7() }) } as unknown as OutboxService;
    gate = new RxFulfillmentSafetyGate(prisma as never, policy, outbox);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('blocks missing prescription case', async () => {
    const result = await gate.evaluateCommerceAttach({
      customerPersonId: uuidv7(),
      countryId: uuidv7(),
      prescriptionCaseId: null,
    });
    expect(result.decision).toBe('BLOCKED');
    expect(result.reason_code).toBe('RX_REQUIRED');
  });

  it('blocks forged / non-existent case UUID', async () => {
    const country = await prisma.country.findFirst();
    if (!country) return;
    const result = await gate.evaluateCommerceAttach({
      customerPersonId: uuidv7(),
      countryId: country.id,
      prescriptionCaseId: uuidv7(),
    });
    expect(result.decision).toBe('BLOCKED');
    expect(result.reason_code).toBe('RX_CASE_NOT_FOUND');
  });

  it('blocks invalid UUID shape', async () => {
    const result = await gate.evaluateCommerceAttach({
      customerPersonId: uuidv7(),
      countryId: uuidv7(),
      prescriptionCaseId: 'forged-not-uuid',
    });
    expect(result.decision).toBe('BLOCKED');
    expect(result.reason_code).toBe('RX_CASE_INVALID');
  });

  it('blocks wrong patient when case exists', async () => {
    const dispensed = await prisma.dispensingCase.findFirst({
      where: { status: DispensingCaseStatus.DISPENSED },
      include: { prescription: true, events: { where: { kind: DispenseEventKind.COMPLETE }, take: 1 } },
    });
    if (!dispensed?.events[0]) return;
    const result = await gate.evaluateCommerceAttach({
      customerPersonId: uuidv7(),
      countryId: dispensed.countryId,
      prescriptionCaseId: dispensed.id,
    });
    expect(result.decision).toBe('BLOCKED');
    expect(result.reason_code).toBe('RX_PATIENT_MISMATCH');
  });

  it('blocks expired/cancelled prescription statuses when present', async () => {
    const cancelled = await prisma.prescription.findFirst({
      where: { status: { in: [PrescriptionStatus.CANCELLED, PrescriptionStatus.EXPIRED] } },
      include: { dispensingCases: { take: 1 } },
    });
    const caseId = cancelled?.dispensingCases[0]?.id;
    if (!cancelled || !caseId) return;
    const result = await gate.evaluateCommerceAttach({
      customerPersonId: cancelled.patientPersonId,
      countryId: cancelled.countryId,
      prescriptionCaseId: caseId,
    });
    expect(result.decision).toBe('BLOCKED');
    expect(['RX_REVOKED', 'RX_EXPIRED', 'RX_CASE_NOT_DISPENSABLE', 'RX_REVIEW_REQUIRED']).toContain(
      result.reason_code,
    );
  });

  it('auto-execute evaluator never authorizes execution when pack is off', async () => {
    const sub = await prisma.rxSubscription.findFirst({ where: { autoExecuteEnabled: true } });
    if (!sub) {
      const result = await gate.evaluateSubscriptionAutoExecute({ subscriptionId: uuidv7() });
      expect(result.execution_authorized).toBe(false);
      expect(result.decision).toBe('BLOCKED');
      return;
    }
    const result = await gate.evaluateSubscriptionAutoExecute({ subscriptionId: sub.id });
    expect(result.execution_authorized).toBe(false);
    expect(result.decision).not.toBe('AUTO_EXECUTE');
  });
});
