import { R14AGateCode, R14AGateEvidenceClass } from '@prisma/client';
import { Errors } from '../common/problem';

export const R14A_GATE_CODES: readonly R14AGateCode[] = [
  'NAMED_PSP',
  'PRODUCTION_COUNTRY',
  'LEGAL_ENTITY',
  'MERCHANT_OF_RECORD',
  'PSP_CONTRACT',
  'VAULT_PATH',
  'PCI_SAQ',
] as const;

const REJECTED_PRODUCTION_COUNTRIES = new Set(['XX', 'TQ', 'PQ', 'TC', 'ZZ']);

const FAKE_VALUE_PREFIXES = [
  'DEV_',
  'DEMO_',
  'MOCK',
  'PLACEHOLDER_',
  'EXAMPLE_',
  'FAKE_',
  'DUMMY_',
  'SAMPLE_',
  'TEST_',
] as const;

const SECRET_PATTERN =
  /(?:sk_live|sk_test|rk_live|api[_-]?key|password|secret|cvv|\bpan\b|-----BEGIN)/i;

const LIVE_KEY_MATERIAL =
  /(?:sk_live|sk_test|rk_live|-----BEGIN|\bcvv\b|\bpan\b)/i;

const DOCUMENT_PAYLOAD_PATTERN = /%PDF|application\/pdf/i;

const VAULT_PATH_PATTERN = /^[a-z0-9][a-z0-9:./_\-]*$/i;

export type R14AGateSnapshot = {
  gateCode: R14AGateCode;
  valueText: string;
  evidenceClass: R14AGateEvidenceClass;
  evidenceRef: string | null;
  updatedByPersonId: string | null;
  verifiedByPersonId: string | null;
  verifiedAt: Date | null;
  updatedAt: Date;
};

export type R14AGateWorkflowStatus = 'NOT_EVIDENCED' | 'PENDING' | 'OWNER_EVIDENCED';

export type R14AGateEvaluation = {
  engineering_config_status: 'R14_A_ENGINEERING_CONFIG_READY' | 'R14_A_ENGINEERING_CONFIG_INCOMPLETE';
  readiness_status: 'R14_A_READINESS_INCOMPLETE' | 'R14_A_7_OF_7_EVIDENCED';
  next_required_action: 'HUMAN_GATE_COLLECTION_REQUIRED' | 'FRESH_IMPLEMENTATION_AUDIT_REQUIRED';
  live_production_status: 'R14_A_LIVE_PRODUCTION_READY' | 'R14_A_LIVE_PRODUCTION_BLOCKED';
  owner_evidenced_count: number;
  placeholder_count: number;
  book_263_production_evidence: false | 'NOT_CLAIMED';
  live_unlock_blocked_reason: string | null;
};

export function isForbiddenDocumentPayload(valueText: string): boolean {
  return DOCUMENT_PAYLOAD_PATTERN.test(valueText);
}

export function isValidProductionCountryIso2(valueText: string): boolean {
  const upper = valueText.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(upper) && !REJECTED_PRODUCTION_COUNTRIES.has(upper);
}

export function isPlaceholderGateValue(valueText: string, gateCode?: R14AGateCode): boolean {
  const raw = valueText.trim();
  if (!raw) {
    return true;
  }
  const upper = raw.toUpperCase();
  if (upper.includes('PLACEHOLDER') || upper.includes('DEMO') || upper.startsWith('DEV_')) {
    return true;
  }
  if (FAKE_VALUE_PREFIXES.some((prefix) => upper.startsWith(prefix))) {
    return true;
  }
  if (gateCode === 'PRODUCTION_COUNTRY') {
    return !isValidProductionCountryIso2(raw);
  }
  if (REJECTED_PRODUCTION_COUNTRIES.has(upper) && raw.length === 2) {
    return true;
  }
  if (gateCode === 'PCI_SAQ' && isEngineeringControlClaimedAsPci(raw)) {
    return true;
  }
  return false;
}

function isEngineeringControlClaimedAsPci(valueText: string): boolean {
  const normalized = valueText.toUpperCase().replace(/[_-]/g, ' ');
  return (
    normalized.includes('NO PAN') ||
    normalized.includes('NO CVV') ||
    normalized.includes('ENGINEERING CONTROL')
  );
}

/**
 * Rejects credential material. Vault-path gates may contain the words "secret" or "api-key"
 * as path segments; live key blobs remain forbidden.
 */
export function isForbiddenSecretLikeValue(valueText: string, gateCode?: R14AGateCode): boolean {
  if (valueText.length > 200) {
    return true;
  }
  if (gateCode === 'VAULT_PATH') {
    if (LIVE_KEY_MATERIAL.test(valueText)) {
      return true;
    }
    return !VAULT_PATH_PATTERN.test(valueText.trim());
  }
  return SECRET_PATTERN.test(valueText);
}

export function deriveGateWorkflowStatus(row: R14AGateSnapshot): R14AGateWorkflowStatus {
  const placeholderValue = isPlaceholderGateValue(row.valueText, row.gateCode);
  if (row.evidenceClass === 'OWNER_EVIDENCED' && !placeholderValue) {
    return 'OWNER_EVIDENCED';
  }
  if (!placeholderValue) {
    return 'PENDING';
  }
  return 'NOT_EVIDENCED';
}

export function evaluateR14AGates(
  snapshots: readonly R14AGateSnapshot[],
  opts: { livePaymentEnabled: boolean },
): R14AGateEvaluation {
  const byCode = new Map(snapshots.map((row) => [row.gateCode, row]));
  const present = R14A_GATE_CODES.every((code) => byCode.has(code));
  const placeholderCount = snapshots.filter(
    (row) => isPlaceholderGateValue(row.valueText, row.gateCode),
  ).length;
  const ownerEvidenced = snapshots.filter(
    (row) =>
      row.evidenceClass === 'OWNER_EVIDENCED' &&
      !isPlaceholderGateValue(row.valueText, row.gateCode),
  ).length;
  const allOwnerEvidenced = present && ownerEvidenced === 7 && placeholderCount === 0;
  let liveUnlockBlocked: string | null;
  if (!allOwnerEvidenced) {
    liveUnlockBlocked = opts.livePaymentEnabled
      ? 'HUMAN_GATES_NOT_OWNER_EVIDENCED'
      : 'PAYMENT_LIVE_ENABLED_OFF';
  } else {
    liveUnlockBlocked = 'FRESH_IMPLEMENTATION_AUDIT_REQUIRED';
  }
  return {
    engineering_config_status: present
      ? 'R14_A_ENGINEERING_CONFIG_READY'
      : 'R14_A_ENGINEERING_CONFIG_INCOMPLETE',
    readiness_status: allOwnerEvidenced ? 'R14_A_7_OF_7_EVIDENCED' : 'R14_A_READINESS_INCOMPLETE',
    next_required_action: allOwnerEvidenced
      ? 'FRESH_IMPLEMENTATION_AUDIT_REQUIRED'
      : 'HUMAN_GATE_COLLECTION_REQUIRED',
    live_production_status: 'R14_A_LIVE_PRODUCTION_BLOCKED',
    owner_evidenced_count: ownerEvidenced,
    placeholder_count: placeholderCount,
    book_263_production_evidence: 'NOT_CLAIMED',
    live_unlock_blocked_reason: liveUnlockBlocked,
  };
}

/** Fail closed: placeholders and missing OWNER_EVIDENCED rows never unlock live PSP. */
export function assertHumanGatesAllowLive(snapshots: readonly R14AGateSnapshot[] | undefined, context: string): void {
  const evaluation = evaluateR14AGates(snapshots ?? [], { livePaymentEnabled: true });
  if (evaluation.owner_evidenced_count !== 7 || evaluation.placeholder_count !== 0) {
    throw Errors.problem(
      503,
      'HUMAN_GATES_NOT_PRODUCTION_READY',
      'Human gates not production ready',
      `${context}: R14-A live requires 7/7 OWNER_EVIDENCED gates with no PLACEHOLDER/DEV/DEMO values. Placeholders are not Book-263 evidence.`,
    );
  }
}
