/**
 * Sprint 50 — Blocker taxonomy + first-country launch package / dry-run tests
 */
import {
  classifyBlockerTaxonomy,
  listKnownProductionDependencyCatalog,
  resolveActionability,
  taxonomyCounts,
} from './launch-blocker-actionability';
import { buildBlockerDetail, decideOverall } from './final-launch-readiness';

describe('Sprint 50 launch blocker actionability', () => {
  it('classifies legal evidence as LEGAL_REGULATORY_REQUIRED', () => {
    expect(classifyBlockerTaxonomy('LEGAL_EVIDENCE_EXPIRED')).toBe('LEGAL_REGULATORY_REQUIRED');
    expect(classifyBlockerTaxonomy('LEGAL_EVIDENCE_MISSING')).toBe('LEGAL_REGULATORY_REQUIRED');
  });

  it('classifies partner commercial as EXTERNAL_BUSINESS_APPROVAL', () => {
    expect(classifyBlockerTaxonomy('COMMERCIAL_APPROVAL_MISSING')).toBe('EXTERNAL_BUSINESS_APPROVAL');
  });

  it('classifies KYC internal vs KYC provider external', () => {
    expect(classifyBlockerTaxonomy('KYC_NOT_VERIFIED')).toBe('INTERNAL_ACTION_REQUIRED');
    expect(classifyBlockerTaxonomy('KYC_PROVIDER_NOT_LIVE')).toBe('EXTERNAL_PROVIDER_REQUIRED');
  });

  it('classifies payment/R14-A as external provider/approval', () => {
    expect(classifyBlockerTaxonomy('PAYMENT_PROVIDER_EXTERNAL_GATED')).toBe('EXTERNAL_PROVIDER_REQUIRED');
    expect(classifyBlockerTaxonomy('R14_A_OWNER_CONFIRMATION_REQUIRED')).toBe('EXTERNAL_BUSINESS_APPROVAL');
  });

  it('classifies communications/logistics as EXTERNAL_PROVIDER_REQUIRED', () => {
    expect(classifyBlockerTaxonomy('OTP_PROVIDER_EXTERNAL_GATED')).toBe('EXTERNAL_PROVIDER_REQUIRED');
    expect(classifyBlockerTaxonomy('CARRIER_EXTERNAL_GATED')).toBe('EXTERNAL_PROVIDER_REQUIRED');
  });

  it('classifies infrastructure/security as SECURITY_REQUIRED', () => {
    expect(classifyBlockerTaxonomy('PITR_EXTERNAL_GATED')).toBe('SECURITY_REQUIRED');
    expect(classifyBlockerTaxonomy('KMS_SECRETS_EXTERNAL_GATED')).toBe('SECURITY_REQUIRED');
    expect(classifyBlockerTaxonomy('MALWARE_SCANNER_EXTERNAL_GATED')).toBe('SECURITY_REQUIRED');
  });

  it('classifies healthcare clinical adapters as EXTERNAL_PROVIDER_REQUIRED', () => {
    expect(classifyBlockerTaxonomy('NO_PRODUCTION_CLINICAL_ADAPTER')).toBe('EXTERNAL_PROVIDER_REQUIRED');
    expect(classifyBlockerTaxonomy('ERX_EXTERNAL_GATED')).toBe('EXTERNAL_PROVIDER_REQUIRED');
  });

  it('classifies configuration blockers as CONFIGURATION_REQUIRED', () => {
    expect(classifyBlockerTaxonomy('CURRENCY_NOT_CONFIGURED')).toBe('CONFIGURATION_REQUIRED');
    expect(classifyBlockerTaxonomy('POLICY_PACK_MISSING')).toBe('CONFIGURATION_REQUIRED');
    expect(classifyBlockerTaxonomy('SERVICEABILITY_NOT_CONFIGURED')).toBe('CONFIGURATION_REQUIRED');
  });

  it('marks external providers as not clearable from application', () => {
    const a = resolveActionability('PAYMENT_PROVIDER_EXTERNAL_GATED');
    expect(a.can_clear_from_application).toBe(false);
    expect(a.requires_external_party).toBe(true);
    expect(a.live_verification_required).toBe(true);
    expect(a.config_reference_required).toBe(true);
  });

  it('marks internal licence/evidence as clearable via admin workflows', () => {
    const a = resolveActionability('PHARMACY_LICENCE_MISSING');
    expect(a.can_clear_from_application).toBe(true);
    expect(a.resolving_href).toBe('/partners');
    expect(a.runbook_stage).toBe(3);
  });

  it('buildBlockerDetail embeds taxonomy + actionability', () => {
    const detail = buildBlockerDetail({
      code: 'LEGAL_EVIDENCE_EXPIRED',
      dimension: 'LEGAL',
      country_code: 'AE',
      category: 'legal',
    });
    expect(detail.taxonomy).toBe('LEGAL_REGULATORY_REQUIRED');
    expect(detail.actionability.what_is_missing.length).toBeGreaterThan(0);
    expect(detail.blocks_activation).toBe(true);
  });

  it('taxonomyCounts aggregates classes', () => {
    const counts = taxonomyCounts([
      { taxonomy: 'INTERNAL_ACTION_REQUIRED' },
      { taxonomy: 'EXTERNAL_PROVIDER_REQUIRED' },
      { taxonomy: 'EXTERNAL_PROVIDER_REQUIRED' },
      { taxonomy: 'SECURITY_REQUIRED' },
    ]);
    expect(counts.INTERNAL_ACTION_REQUIRED).toBe(1);
    expect(counts.EXTERNAL_PROVIDER_REQUIRED).toBe(2);
    expect(counts.SECURITY_REQUIRED).toBe(1);
  });

  it('decideOverall remains fail-closed with EXTERNAL_GATED', () => {
    expect(decideOverall('UNDER_REVIEW', [{ status: 'READY' }, { status: 'EXTERNAL_GATED' }])).toBe(
      'NOT_READY',
    );
  });

  it('known production dependency catalog is wired into final matrix', () => {
    const catalog = listKnownProductionDependencyCatalog();
    expect(catalog.every((c) => c.in_final_matrix)).toBe(true);
    expect(catalog.some((c) => c.code === 'PAYMENT_PROVIDER')).toBe(true);
    expect(catalog.some((c) => c.code === 'PITR_OFFSITE')).toBe(true);
    expect(catalog.some((c) => c.code === 'KYC_PROVIDER')).toBe(true);
  });

  it('mock gateway codes classify as external provider', () => {
    expect(classifyBlockerTaxonomy('MOCK_GATEWAY_PRODUCTION_FORBIDDEN')).toBe(
      'EXTERNAL_PROVIDER_REQUIRED',
    );
  });
});
