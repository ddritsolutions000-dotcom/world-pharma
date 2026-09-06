/**
 * S156 — Fail-closed Rx fulfillment safety gate (mocked domain).
 * Covers eligibility + negative paths without inventing medical rules.
 */
import { DispenseEventKind, DispensingCaseStatus, PrescriptionStatus, RxSubscriptionStatus } from '@prisma/client';
import { uuidv7 } from '@world-pharma/shared';
import { OutboxService } from '../events/outbox.service';
import { PolicyResolver } from '../policy/resolver';
import { RxFulfillmentSafetyGate } from './rx-fulfillment-safety-gate';

type MockCaseRow = {
  id: string;
  countryId: string;
  prescriptionId: string;
  prescriptionVersionId: string;
  status: DispensingCaseStatus;
  prescription: {
    id: string;
    status: PrescriptionStatus;
    patientPersonId: string;
    countryId: string;
    currentVersionId: string;
  };
  prescriptionVersion: {
    id: string;
    sealedAt: Date | null;
    validFrom: Date | null;
    validUntil: Date | null;
  };
  lineMappings: Array<{
    catalogVariantId: string;
    catalogItemId: string;
    quantityDispensed: string;
  }>;
  events: Array<{ id: string }>;
};

function baseCase(): {
  patientId: string;
  countryId: string;
  versionId: string;
  caseId: string;
  completeId: string;
  variantId: string;
  row: MockCaseRow;
} {
  const patientId = uuidv7();
  const countryId = uuidv7();
  const versionId = uuidv7();
  const caseId = uuidv7();
  const completeId = uuidv7();
  const variantId = uuidv7();
  return {
    patientId,
    countryId,
    versionId,
    caseId,
    completeId,
    variantId,
    row: {
      id: caseId,
      countryId,
      prescriptionId: uuidv7(),
      prescriptionVersionId: versionId,
      status: DispensingCaseStatus.DISPENSED,
      prescription: {
        id: uuidv7(),
        status: PrescriptionStatus.ISSUED,
        patientPersonId: patientId,
        countryId,
        currentVersionId: versionId,
      },
      prescriptionVersion: {
        id: versionId,
        sealedAt: new Date(),
        validFrom: new Date(Date.now() - 60_000),
        validUntil: new Date(Date.now() + 86_400_000),
      },
      lineMappings: [
        {
          catalogVariantId: variantId,
          catalogItemId: uuidv7(),
          quantityDispensed: '2',
        },
      ],
      events: [{ id: completeId }],
    },
  };
}

describe('S156 RxFulfillmentSafetyGate mocked paths', () => {
  const audits: Array<{ type: string; payload: Record<string, unknown> }> = [];
  let gate: RxFulfillmentSafetyGate;
  let caseRow: MockCaseRow | null;
  let orderByDispense: { id: string } | null;
  let rxDispenseEnabled = true;
  let autoExecutePack = false;

  beforeEach(() => {
    audits.length = 0;
    const fixture = baseCase();
    caseRow = fixture.row;
    orderByDispense = null;
    rxDispenseEnabled = true;
    autoExecutePack = false;

    const prisma = {
      dispensingCase: {
        findUnique: async () => caseRow,
      },
      country: {
        findUniqueOrThrow: async () => ({ id: fixture.countryId, isoAlpha2: 'T1' }),
      },
      order: {
        findUnique: async () => orderByDispense,
      },
      rxSubscription: {
        findUnique: async ({ where }: { where: { id: string } }) =>
          where.id === 'missing'
            ? null
            : {
                id: where.id,
                status: RxSubscriptionStatus.ACTIVE,
                autoExecuteEnabled: true,
                prescriptionId: fixture.row.prescription.id,
                customerPersonId: fixture.patientId,
              },
      },
      prescription: {
        findUnique: async () => ({
          id: fixture.row.prescription.id,
          status: PrescriptionStatus.ISSUED,
          patientPersonId: fixture.patientId,
          countryId: fixture.countryId,
        }),
      },
    };

    const policy = {
      resolvePublished: async () => ({ document: {} }),
      isRxDispenseEnabled: () => rxDispenseEnabled,
      isRxSubscriptionAutoExecuteEnabled: () => autoExecutePack,
    } as unknown as PolicyResolver;

    const outbox = {
      enqueue: async (_tx: unknown, event: { type: string; payload: Record<string, unknown> }) => {
        audits.push(event);
        return { id: uuidv7() };
      },
    } as unknown as OutboxService;

    gate = new RxFulfillmentSafetyGate(prisma as never, policy, outbox);
    (gate as unknown as { _fixture: typeof fixture })._fixture = fixture;
  });

  function fixture() {
    return (gate as unknown as { _fixture: ReturnType<typeof baseCase> })._fixture;
  }

  it('1. valid eligible prescription → ELIGIBLE', async () => {
    const f = fixture();
    const result = await gate.evaluateCommerceAttach({
      customerPersonId: f.patientId,
      countryId: f.countryId,
      prescriptionCaseId: f.caseId,
      catalogVariantId: f.variantId,
      qty: 1,
    });
    expect(result.decision).toBe('ELIGIBLE');
    expect(result.reason_code).toBe('RX_ELIGIBLE');
  });

  it('2. missing prescription → BLOCKED RX_REQUIRED', async () => {
    const result = await gate.evaluateCommerceAttach({
      customerPersonId: uuidv7(),
      countryId: uuidv7(),
      prescriptionCaseId: null,
    });
    expect(result).toMatchObject({ decision: 'BLOCKED', reason_code: 'RX_REQUIRED' });
  });

  it('3. expired prescription → BLOCKED', async () => {
    caseRow!.prescription.status = PrescriptionStatus.EXPIRED;
    const f = fixture();
    const result = await gate.evaluateCommerceAttach({
      customerPersonId: f.patientId,
      countryId: f.countryId,
      prescriptionCaseId: f.caseId,
    });
    expect(result.reason_code).toBe('RX_EXPIRED');
  });

  it('4. revoked/cancelled prescription → BLOCKED', async () => {
    caseRow!.prescription.status = PrescriptionStatus.CANCELLED;
    const f = fixture();
    const result = await gate.evaluateCommerceAttach({
      customerPersonId: f.patientId,
      countryId: f.countryId,
      prescriptionCaseId: f.caseId,
    });
    expect(result.reason_code).toBe('RX_REVOKED');
  });

  it('5. wrong patient → BLOCKED', async () => {
    const f = fixture();
    const result = await gate.evaluateCommerceAttach({
      customerPersonId: uuidv7(),
      countryId: f.countryId,
      prescriptionCaseId: f.caseId,
    });
    expect(result.reason_code).toBe('RX_PATIENT_MISMATCH');
  });

  it('6. wrong medicine/SKU → BLOCKED', async () => {
    const f = fixture();
    const result = await gate.evaluateCommerceAttach({
      customerPersonId: f.patientId,
      countryId: f.countryId,
      prescriptionCaseId: f.caseId,
      catalogVariantId: uuidv7(),
      qty: 1,
    });
    expect(result.reason_code).toBe('RX_SKU_MISMATCH');
  });

  it('7. quantity violation → BLOCKED', async () => {
    const f = fixture();
    const result = await gate.evaluateCommerceAttach({
      customerPersonId: f.patientId,
      countryId: f.countryId,
      prescriptionCaseId: f.caseId,
      catalogVariantId: f.variantId,
      qty: 99,
    });
    expect(result.reason_code).toBe('RX_QTY_EXCEEDED');
  });

  it('8. required review missing → REVIEW_REQUIRED', async () => {
    caseRow!.status = DispensingCaseStatus.QUEUED;
    caseRow!.events = [];
    const f = fixture();
    const result = await gate.evaluateCommerceAttach({
      customerPersonId: f.patientId,
      countryId: f.countryId,
      prescriptionCaseId: f.caseId,
    });
    expect(result.decision).toBe('REVIEW_REQUIRED');
    expect(result.reason_code).toBe('RX_REVIEW_REQUIRED');
  });

  it('9. unauthorized pharmacy path represented as non-dispensable → BLOCKED', async () => {
    caseRow!.status = DispensingCaseStatus.REJECTED;
    caseRow!.events = [];
    const f = fixture();
    const result = await gate.evaluateCommerceAttach({
      customerPersonId: f.patientId,
      countryId: f.countryId,
      prescriptionCaseId: f.caseId,
    });
    expect(result.reason_code).toBe('RX_CASE_NOT_DISPENSABLE');
  });

  it('10. country policy disallows Rx execution → BLOCKED', async () => {
    rxDispenseEnabled = false;
    const f = fixture();
    const result = await gate.evaluateCommerceAttach({
      customerPersonId: f.patientId,
      countryId: f.countryId,
      prescriptionCaseId: f.caseId,
    });
    expect(result.reason_code).toBe('RX_POLICY_DISABLED');
  });

  it('11. compliance hold is separate cart path; gate still blocks draft Rx', async () => {
    caseRow!.prescription.status = PrescriptionStatus.DRAFT;
    const f = fixture();
    const result = await gate.evaluateCommerceAttach({
      customerPersonId: f.patientId,
      countryId: f.countryId,
      prescriptionCaseId: f.caseId,
    });
    expect(result.reason_code).toBe('RX_DRAFT');
  });

  it('12–13. duplicate / retry → already executed blocked (idempotent)', async () => {
    orderByDispense = { id: uuidv7() };
    const f = fixture();
    const first = await gate.evaluateCommerceAttach({
      customerPersonId: f.patientId,
      countryId: f.countryId,
      prescriptionCaseId: f.caseId,
      catalogVariantId: f.variantId,
      qty: 1,
    });
    const second = await gate.evaluateCommerceAttach({
      customerPersonId: f.patientId,
      countryId: f.countryId,
      prescriptionCaseId: f.caseId,
      catalogVariantId: f.variantId,
      qty: 1,
    });
    expect(first.reason_code).toBe('RX_ALREADY_EXECUTED');
    expect(second.reason_code).toBe('RX_ALREADY_EXECUTED');
    expect(first.already_ordered).toBe(true);
  });

  it('14. direct API forged UUID → BLOCKED (bypass blocked)', async () => {
    caseRow = null;
    const result = await gate.evaluateCommerceAttach({
      customerPersonId: uuidv7(),
      countryId: uuidv7(),
      prescriptionCaseId: uuidv7(),
    });
    expect(result.reason_code).toBe('RX_CASE_NOT_FOUND');
  });

  it('15. audit event without clinical payload', async () => {
    const f = fixture();
    const decision = await gate.evaluateCommerceAttach({
      customerPersonId: f.patientId,
      countryId: f.countryId,
      prescriptionCaseId: f.caseId,
      catalogVariantId: f.variantId,
      qty: 1,
    });
    await gate.auditGateDecision({
      actorPersonId: f.patientId,
      countryId: f.countryId,
      decision,
      context: 'commerce_attach',
    });
    expect(audits).toHaveLength(1);
    expect(audits[0]!.type).toBe('RX_FULFILLMENT_SAFETY_GATE');
    const payload = audits[0]!.payload;
    expect(payload.decision).toBe('ELIGIBLE');
    expect(payload.reason_code).toBe('RX_ELIGIBLE');
    expect(JSON.stringify(payload)).not.toMatch(/dosage|clinicalConcept|strengthText|lineMappings/i);
  });

  it('validity window expiry uses version.validUntil', async () => {
    caseRow!.prescriptionVersion.validUntil = new Date(Date.now() - 1000);
    const f = fixture();
    const result = await gate.evaluateCommerceAttach({
      customerPersonId: f.patientId,
      countryId: f.countryId,
      prescriptionCaseId: f.caseId,
    });
    expect(result.reason_code).toBe('RX_EXPIRED');
  });

  it('subscription auto-execute never authorizes worker execution', async () => {
    autoExecutePack = true;
    const result = await gate.evaluateSubscriptionAutoExecute({ subscriptionId: uuidv7() });
    expect(result.execution_authorized).toBe(false);
    expect(result.decision).not.toBe('AUTO_EXECUTE');
    expect(result.reason_code).toBe('AUTO_EXECUTE_WORKER_NOT_AUTHORIZED');
  });

  it('COMPLETE event kind is required for eligibility', async () => {
    expect(DispenseEventKind.COMPLETE).toBe('COMPLETE');
    caseRow!.events = [];
    const f = fixture();
    const result = await gate.evaluateCommerceAttach({
      customerPersonId: f.patientId,
      countryId: f.countryId,
      prescriptionCaseId: f.caseId,
    });
    expect(result.reason_code).toBe('RX_MISSING_COMPLETE');
  });
});
