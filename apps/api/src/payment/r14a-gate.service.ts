import { Injectable } from '@nestjs/common';
import { R14AGateCode, R14AGateEvidenceClass } from '@prisma/client';
import { uuidv7 } from '@world-pharma/shared';
import { PrismaService } from '../app/prisma.service';
import { Errors } from '../common/problem';
import type { Principal } from '../identity/current-principal';
import { SecurityEventsService } from '../identity/security-events.service';
import { isLivePaymentEnabled } from './payment.config';
import {
  assertHumanGatesAllowLive,
  deriveGateWorkflowStatus,
  evaluateR14AGates,
  isForbiddenDocumentPayload,
  isForbiddenSecretLikeValue,
  isPlaceholderGateValue,
  isValidProductionCountryIso2,
  R14A_GATE_CODES,
  type R14AGateSnapshot,
} from './r14a-gate';

function parseGateCode(raw: string): R14AGateCode {
  if ((R14A_GATE_CODES as readonly string[]).includes(raw)) {
    return raw as R14AGateCode;
  }
  throw Errors.validation(`Unknown R14-A gate "${raw}".`);
}

function toSnapshot(row: {
  gateCode: R14AGateCode;
  valueText: string;
  evidenceClass: R14AGateEvidenceClass;
  evidenceRef: string | null;
  updatedByPersonId: string | null;
  verifiedByPersonId: string | null;
  verifiedAt: Date | null;
  updatedAt: Date;
}): R14AGateSnapshot {
  return {
    gateCode: row.gateCode,
    valueText: row.valueText,
    evidenceClass: row.evidenceClass,
    evidenceRef: row.evidenceRef,
    updatedByPersonId: row.updatedByPersonId,
    verifiedByPersonId: row.verifiedByPersonId,
    verifiedAt: row.verifiedAt,
    updatedAt: row.updatedAt,
  };
}

function assertSafeGateInput(
  gateCode: R14AGateCode,
  value: string,
  evidenceRef: string | null | undefined,
): void {
  if (isForbiddenSecretLikeValue(value, gateCode) || (evidenceRef && isForbiddenSecretLikeValue(evidenceRef))) {
    throw Errors.problem(
      400,
      'SECRET_VALUE_FORBIDDEN',
      'Secret value forbidden',
      'Do not store credentials, API keys, PAN/CVV, or certificates in R14-A gate configuration.',
    );
  }
  if (isForbiddenDocumentPayload(value) || (evidenceRef && isForbiddenDocumentPayload(evidenceRef))) {
    throw Errors.problem(
      400,
      'DOCUMENT_PAYLOAD_FORBIDDEN',
      'Document payload forbidden',
      'Do not store contract PDFs or other document binaries. Record a contract ID or DMS reference only.',
    );
  }
}

@Injectable()
export class R14AGateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly security: SecurityEventsService,
  ) {}

  async list() {
    const rows = await this.prisma.r14AHumanGate.findMany();
    const byCode = new Map(rows.map((row) => [row.gateCode, toSnapshot(row)]));
    const snapshots = R14A_GATE_CODES.map((code) => byCode.get(code)).filter(
      (row): row is R14AGateSnapshot => Boolean(row),
    );
    const evaluation = evaluateR14AGates(snapshots, { livePaymentEnabled: isLivePaymentEnabled() });
    return {
      engineering_config_status: evaluation.engineering_config_status,
      readiness_status: evaluation.readiness_status,
      next_required_action: evaluation.next_required_action,
      live_production_status: evaluation.live_production_status,
      book_263_production_evidence: evaluation.book_263_production_evidence,
      live_payment_enabled: isLivePaymentEnabled(),
      owner_evidenced_count: evaluation.owner_evidenced_count,
      placeholder_count: evaluation.placeholder_count,
      live_unlock_blocked_reason: evaluation.live_unlock_blocked_reason,
      note: 'PLACEHOLDER/DEV/DEMO values are configuration test data only. They are not Book-263 owner evidence and cannot enable live payments. 7/7 OWNER_EVIDENCED requires a fresh implementation audit and does not enable live payments.',
      gates: snapshots.map((row) => {
        const placeholder = isPlaceholderGateValue(row.valueText, row.gateCode);
        return {
          gate_code: row.gateCode,
          value: row.valueText,
          evidence_class: row.evidenceClass,
          workflow_status: deriveGateWorkflowStatus(row),
          evidence_ref: row.evidenceRef,
          placeholder,
          updated_by_person_id: row.updatedByPersonId,
          verified_by_person_id: row.verifiedByPersonId,
          verified_at: row.verifiedAt?.toISOString() ?? null,
          updated_at: row.updatedAt.toISOString(),
        };
      }),
    };
  }

  async revisions(gateCodeRaw: string) {
    const gateCode = parseGateCode(gateCodeRaw);
    const rows = await this.prisma.r14AHumanGateRevision.findMany({
      where: { gateCode },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return {
      gate_code: gateCode,
      data: rows.map((row) => ({
        id: row.id,
        action: row.action,
        previous_value: row.previousValueText,
        new_value: row.newValueText,
        previous_evidence_class: row.previousEvidenceClass,
        new_evidence_class: row.newEvidenceClass,
        actor_person_id: row.actorPersonId,
        note: row.note,
        created_at: row.createdAt.toISOString(),
      })),
    };
  }

  async upsert(principal: Principal, gateCodeRaw: string, body: { value?: string; evidence_ref?: string | null }) {
    const gateCode = parseGateCode(gateCodeRaw);
    const value = (body.value ?? '').trim();
    if (!value) {
      throw Errors.validation('value is required');
    }
    const evidenceRefInput = body.evidence_ref?.trim() || null;
    assertSafeGateInput(gateCode, value, evidenceRefInput);
    const placeholderValue = isPlaceholderGateValue(value, gateCode);
    if (gateCode === 'PRODUCTION_COUNTRY' && !placeholderValue && !isValidProductionCountryIso2(value)) {
      throw Errors.validation('PRODUCTION_COUNTRY requires a real ISO 3166-1 alpha-2 code. XX/ZZ/TQ are not evidence.');
    }
    if (!placeholderValue && !evidenceRefInput) {
      throw Errors.validation('evidence_ref is required when recording non-placeholder owner evidence.');
    }
    if (evidenceRefInput && isPlaceholderGateValue(evidenceRefInput) && !placeholderValue) {
      throw Errors.validation('evidence_ref cannot be a DEV/DEMO/PLACEHOLDER token for owner evidence.');
    }
    const existing = await this.prisma.r14AHumanGate.findUnique({ where: { gateCode } });
    if (!existing) {
      throw Errors.notFound(`R14-A gate ${gateCode} is not configured.`);
    }
    const evidenceClass: R14AGateEvidenceClass = 'PLACEHOLDER';
    const evidenceRef = placeholderValue
      ? evidenceRefInput || 'DEV_PLACEHOLDER_NOT_BOOK_263_EVIDENCE'
      : evidenceRefInput;
    await this.prisma.$transaction(async (tx) => {
      await tx.r14AHumanGateRevision.create({
        data: {
          id: uuidv7(),
          gateCode,
          previousValueText: existing.valueText,
          newValueText: value,
          previousEvidenceClass: existing.evidenceClass,
          newEvidenceClass: evidenceClass,
          actorPersonId: principal.personId,
          action: 'UPSERT',
          note: placeholderValue
            ? 'Admin configuration update. PLACEHOLDER cannot unlock live payments.'
            : 'Owner evidence recorded as PENDING. A different authorized reviewer must verify. Does not enable live payments.',
        },
      });
      await tx.r14AHumanGate.update({
        where: { gateCode },
        data: {
          valueText: value,
          evidenceClass,
          evidenceRef,
          updatedByPersonId: principal.personId,
          verifiedByPersonId: null,
          verifiedAt: null,
        },
      });
    });
    await this.security.emit({
      type: 'R14A_GATE_UPDATED',
      outcome: 'success',
      personId: principal.personId,
      sessionId: principal.sessionId,
      metadata: {
        gate_code: gateCode,
        action: 'UPSERT',
        previous_evidence_class: existing.evidenceClass,
        new_evidence_class: evidenceClass,
        workflow_status: placeholderValue ? 'NOT_EVIDENCED' : 'PENDING',
        evidence_ref: evidenceRef,
      },
    });
    return this.list();
  }

  async verify(principal: Principal, gateCodeRaw: string, body: { evidence_ref?: string }) {
    const gateCode = parseGateCode(gateCodeRaw);
    const existing = await this.prisma.r14AHumanGate.findUnique({ where: { gateCode } });
    if (!existing) {
      throw Errors.notFound(`R14-A gate ${gateCode} is not configured.`);
    }
    const evidenceRef = body.evidence_ref?.trim();
    if (isPlaceholderGateValue(existing.valueText, gateCode)) {
      await this.prisma.r14AHumanGateRevision.create({
        data: {
          id: uuidv7(),
          gateCode,
          previousValueText: existing.valueText,
          newValueText: existing.valueText,
          previousEvidenceClass: existing.evidenceClass,
          newEvidenceClass: existing.evidenceClass,
          actorPersonId: principal.personId,
          action: 'VERIFY_REJECTED',
          note: 'PLACEHOLDER/DEV/DEMO values cannot be classified OWNER_EVIDENCED.',
        },
      });
      await this.security.emit({
        type: 'R14A_GATE_UPDATED',
        outcome: 'failure',
        personId: principal.personId,
        sessionId: principal.sessionId,
        metadata: {
          gate_code: gateCode,
          action: 'VERIFY_REJECTED',
          reason: 'PLACEHOLDER_NOT_OWNER_EVIDENCE',
        },
      });
      throw Errors.problem(
        409,
        'PLACEHOLDER_NOT_OWNER_EVIDENCE',
        'Placeholder is not owner evidence',
        `${gateCode} is still a DEV/DEMO/PLACEHOLDER value and cannot be marked OWNER_EVIDENCED or Book-263 evidenced.`,
      );
    }
    if (existing.updatedByPersonId && existing.updatedByPersonId === principal.personId) {
      throw Errors.problem(
        409,
        'DUAL_CONTROL_REQUIRED',
        'Dual control required',
        'A different authorized reviewer must verify this gate.',
      );
    }
    if (!evidenceRef) {
      throw Errors.validation('evidence_ref is required to verify a non-placeholder gate.');
    }
    assertSafeGateInput(gateCode, existing.valueText, evidenceRef);
    if (isPlaceholderGateValue(evidenceRef)) {
      throw Errors.validation('evidence_ref cannot be a DEV/DEMO/PLACEHOLDER token for owner evidence.');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.r14AHumanGateRevision.create({
        data: {
          id: uuidv7(),
          gateCode,
          previousValueText: existing.valueText,
          newValueText: existing.valueText,
          previousEvidenceClass: existing.evidenceClass,
          newEvidenceClass: 'OWNER_EVIDENCED',
          actorPersonId: principal.personId,
          action: 'VERIFY',
          note: evidenceRef,
        },
      });
      await tx.r14AHumanGate.update({
        where: { gateCode },
        data: {
          evidenceClass: 'OWNER_EVIDENCED',
          evidenceRef,
          verifiedByPersonId: principal.personId,
          verifiedAt: new Date(),
        },
      });
    });
    await this.security.emit({
      type: 'R14A_GATE_UPDATED',
      outcome: 'success',
      personId: principal.personId,
      sessionId: principal.sessionId,
      metadata: {
        gate_code: gateCode,
        action: 'VERIFY',
        previous_evidence_class: existing.evidenceClass,
        new_evidence_class: 'OWNER_EVIDENCED',
        workflow_status: 'OWNER_EVIDENCED',
        evidence_ref: evidenceRef,
      },
    });
    return this.list();
  }

  async loadSnapshots(): Promise<R14AGateSnapshot[]> {
    const rows = await this.prisma.r14AHumanGate.findMany();
    return rows.map(toSnapshot);
  }

  async assertLiveBlocked(context: string): Promise<void> {
    const snapshots = await this.loadSnapshots();
    assertHumanGatesAllowLive(snapshots, context);
  }
}
