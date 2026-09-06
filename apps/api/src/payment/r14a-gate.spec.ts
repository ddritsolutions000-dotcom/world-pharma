import { ProblemException } from '../common/problem';
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

describe('r14a-gate evaluation', () => {
  const placeholders: R14AGateSnapshot[] = R14A_GATE_CODES.map((gateCode) => ({
    gateCode,
    valueText:
      gateCode === 'PRODUCTION_COUNTRY'
        ? 'ZZ'
        : `DEV_PLACEHOLDER_${gateCode}`,
    evidenceClass: 'PLACEHOLDER' as const,
    evidenceRef: 'DEV_PLACEHOLDER_NOT_BOOK_263_EVIDENCE',
    updatedByPersonId: null,
    verifiedByPersonId: null,
    verifiedAt: null,
    updatedAt: new Date(),
  }));

  const ownerEvidenced: R14AGateSnapshot[] = [
    ['NAMED_PSP', 'OWNER_SUPPLIED_VENDOR_NAME'],
    ['PRODUCTION_COUNTRY', 'DE'],
    ['LEGAL_ENTITY', 'OWNER_SUPPLIED_ENTITY'],
    ['MERCHANT_OF_RECORD', 'PLATFORM'],
    ['PSP_CONTRACT', 'CONTRACT-REF-001'],
    ['VAULT_PATH', 'vault:prod/payments/psp/api-key'],
    ['PCI_SAQ', 'SAQ-A-EP'],
  ].map(([gateCode, valueText]) => ({
    gateCode: gateCode as R14AGateSnapshot['gateCode'],
    valueText,
    evidenceClass: 'OWNER_EVIDENCED' as const,
    evidenceRef: 'GATE-OWNER-REF-001',
    updatedByPersonId: '11111111-1111-4111-8111-111111111111',
    verifiedByPersonId: '22222222-2222-4222-8222-222222222222',
    verifiedAt: new Date(),
    updatedAt: new Date(),
  }));

  it('treats seeded DEV/ZZ values as placeholders', () => {
    expect(isPlaceholderGateValue('DEV_PLACEHOLDER_PSP', 'NAMED_PSP')).toBe(true);
    expect(isPlaceholderGateValue('ZZ', 'PRODUCTION_COUNTRY')).toBe(true);
    expect(isPlaceholderGateValue('XX', 'PRODUCTION_COUNTRY')).toBe(true);
    expect(isPlaceholderGateValue('TQ', 'PRODUCTION_COUNTRY')).toBe(true);
    expect(isPlaceholderGateValue('MOCK_PRIMARY', 'NAMED_PSP')).toBe(true);
    expect(isPlaceholderGateValue('TEST_PSP', 'NAMED_PSP')).toBe(true);
    expect(isPlaceholderGateValue('FAKE_PSP', 'NAMED_PSP')).toBe(true);
    expect(isPlaceholderGateValue('No PAN/CVV', 'PCI_SAQ')).toBe(true);
  });

  it('does not treat a real ISO2 as evidenced until OWNER_EVIDENCED is stamped', () => {
    expect(isValidProductionCountryIso2('IN')).toBe(true);
    expect(isPlaceholderGateValue('IN', 'PRODUCTION_COUNTRY')).toBe(false);
    expect(isPlaceholderGateValue('India', 'PRODUCTION_COUNTRY')).toBe(true);
    expect(
      deriveGateWorkflowStatus({
        ...placeholders[1]!,
        gateCode: 'PRODUCTION_COUNTRY',
        valueText: 'IN',
        evidenceClass: 'PLACEHOLDER',
      }),
    ).toBe('PENDING');
  });

  it('marks engineering config ready without claiming live or Book 263 evidence', () => {
    const result = evaluateR14AGates(placeholders, { livePaymentEnabled: false });
    expect(result.engineering_config_status).toBe('R14_A_ENGINEERING_CONFIG_READY');
    expect(result.readiness_status).toBe('R14_A_READINESS_INCOMPLETE');
    expect(result.next_required_action).toBe('HUMAN_GATE_COLLECTION_REQUIRED');
    expect(result.live_production_status).toBe('R14_A_LIVE_PRODUCTION_BLOCKED');
    expect(result.owner_evidenced_count).toBe(0);
    expect(result.book_263_production_evidence).toBe('NOT_CLAIMED');
    expect(result.live_unlock_blocked_reason).toBe('PAYMENT_LIVE_ENABLED_OFF');
  });

  it('does not unlock live when PAYMENT_LIVE_ENABLED is true but gates are placeholders', () => {
    const result = evaluateR14AGates(placeholders, { livePaymentEnabled: true });
    expect(result.live_production_status).toBe('R14_A_LIVE_PRODUCTION_BLOCKED');
    expect(result.live_unlock_blocked_reason).toBe('HUMAN_GATES_NOT_OWNER_EVIDENCED');
    expect(() => assertHumanGatesAllowLive(placeholders, 'test')).toThrow(ProblemException);
  });

  it('rejects secret-like values and contract PDF payloads', () => {
    expect(isForbiddenSecretLikeValue('sk_live_abc')).toBe(true);
    expect(isForbiddenSecretLikeValue('DEV_PLACEHOLDER_VAULT_PATH')).toBe(false);
    expect(isForbiddenSecretLikeValue('vault:prod/payments/psp/api-key', 'VAULT_PATH')).toBe(false);
    expect(isForbiddenSecretLikeValue('sk_live_abc', 'VAULT_PATH')).toBe(true);
    expect(isForbiddenDocumentPayload('%PDF-1.4 fake')).toBe(true);
  });

  it('still blocks live if OWNER_EVIDENCED is stamped on a placeholder string', () => {
    const forged = placeholders.map((row) => ({
      ...row,
      evidenceClass: 'OWNER_EVIDENCED' as const,
    }));
    expect(evaluateR14AGates(forged, { livePaymentEnabled: true }).live_production_status).toBe(
      'R14_A_LIVE_PRODUCTION_BLOCKED',
    );
    expect(evaluateR14AGates(forged, { livePaymentEnabled: true }).owner_evidenced_count).toBe(0);
  });

  it('reports 7/7 OWNER_EVIDENCED as audit-required and never live-ready', () => {
    const result = evaluateR14AGates(ownerEvidenced, { livePaymentEnabled: true });
    expect(result.owner_evidenced_count).toBe(7);
    expect(result.placeholder_count).toBe(0);
    expect(result.readiness_status).toBe('R14_A_7_OF_7_EVIDENCED');
    expect(result.next_required_action).toBe('FRESH_IMPLEMENTATION_AUDIT_REQUIRED');
    expect(result.live_production_status).toBe('R14_A_LIVE_PRODUCTION_BLOCKED');
    expect(result.book_263_production_evidence).toBe('NOT_CLAIMED');
    expect(result.live_unlock_blocked_reason).toBe('FRESH_IMPLEMENTATION_AUDIT_REQUIRED');
    expect(result.engineering_config_status).toBe('R14_A_ENGINEERING_CONFIG_READY');
  });

  it('derives PENDING for genuine unverified values and OWNER_EVIDENCED after verify', () => {
    expect(deriveGateWorkflowStatus(placeholders[0]!)).toBe('NOT_EVIDENCED');
    expect(
      deriveGateWorkflowStatus({
        ...placeholders[0]!,
        valueText: 'OWNER_SUPPLIED_VENDOR_NAME',
        evidenceClass: 'PLACEHOLDER',
      }),
    ).toBe('PENDING');
    expect(deriveGateWorkflowStatus(ownerEvidenced[0]!)).toBe('OWNER_EVIDENCED');
  });
});
