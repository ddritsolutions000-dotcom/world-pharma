import {
  buildBlockerDetail,
  classifyBlockerActionable,
  decideOverall,
  mapCountryDimensionStatus,
  overallToDimensionStatus,
  statusFromGateBlockers,
} from './final-launch-readiness';

describe('final-launch-readiness helpers (S49)', () => {
  it('classifies external gate codes as EXTERNAL', () => {
    expect(classifyBlockerActionable('PAYMENT_PROVIDER_EXTERNAL_GATED')).toBe('EXTERNAL');
    expect(classifyBlockerActionable('NO_PRODUCTION_CLINICAL_ADAPTER')).toBe('EXTERNAL');
    expect(classifyBlockerActionable('R14_A_OWNER_CONFIRMATION_REQUIRED')).toBe('EXTERNAL');
    expect(classifyBlockerActionable('PITR_EXTERNAL_GATED')).toBe('EXTERNAL');
  });

  it('classifies operational missing codes as INTERNAL', () => {
    expect(classifyBlockerActionable('LEGAL_EVIDENCE_EXPIRED')).toBe('INTERNAL');
    expect(classifyBlockerActionable('KYC_NOT_VERIFIED')).toBe('INTERNAL');
    expect(classifyBlockerActionable('COMMERCIAL_APPROVAL_MISSING')).toBe('INTERNAL');
  });

  it('maps available+empty blockers to READY', () => {
    expect(statusFromGateBlockers(true, [])).toBe('READY');
  });

  it('maps suspended lifecycle codes to SUSPENDED', () => {
    expect(statusFromGateBlockers(false, ['COUNTRY_PRODUCTION_SUSPENDED'], { suspended: true })).toBe(
      'SUSPENDED',
    );
  });

  it('keeps EXTERNAL_GATED when only external blockers present', () => {
    expect(
      statusFromGateBlockers(false, [
        'PAYMENT_PROVIDER_EXTERNAL_GATED',
        'R14_A_OWNER_CONFIRMATION_REQUIRED',
        'COUNTRY_PRODUCTION_NOT_ACTIVE',
      ]),
    ).toBe('EXTERNAL_GATED');
  });

  it('never converts EXTERNAL_GATED mixed with hard internal into READY', () => {
    expect(
      statusFromGateBlockers(false, ['LEGAL_EVIDENCE_EXPIRED', 'PAYMENT_PROVIDER_EXTERNAL_GATED']),
    ).toBe('BLOCKED');
  });

  it('maps country production dimension statuses', () => {
    expect(mapCountryDimensionStatus('PASS')).toBe('READY');
    expect(mapCountryDimensionStatus('EXTERNAL_GATED')).toBe('EXTERNAL_GATED');
    expect(mapCountryDimensionStatus('EXPIRED')).toBe('BLOCKED');
    expect(mapCountryDimensionStatus('MISSING')).toBe('NOT_CONFIGURED');
  });

  it('decideOverall is fail-closed when any dimension is EXTERNAL_GATED', () => {
    expect(
      decideOverall('UNDER_REVIEW', [
        { status: 'READY' },
        { status: 'EXTERNAL_GATED' },
      ]),
    ).toBe('NOT_READY');
  });

  it('decideOverall is READY_FOR_ACTIVATION only when all READY', () => {
    expect(
      decideOverall('READY_FOR_ACTIVATION', [
        { status: 'READY' },
        { status: 'READY' },
      ]),
    ).toBe('READY_FOR_ACTIVATION');
  });

  it('decideOverall returns SUSPENDED when lifecycle or dimension suspended', () => {
    expect(decideOverall('SUSPENDED', [{ status: 'READY' }])).toBe('SUSPENDED');
    expect(decideOverall('ACTIVE', [{ status: 'SUSPENDED' }])).toBe('SUSPENDED');
  });

  it('overallToDimensionStatus maps decisions', () => {
    expect(overallToDimensionStatus('READY_FOR_ACTIVATION')).toBe('READY');
    expect(overallToDimensionStatus('NOT_READY')).toBe('BLOCKED');
    expect(overallToDimensionStatus('SUSPENDED')).toBe('SUSPENDED');
  });

  it('buildBlockerDetail never marks blocks_activation false', () => {
    const detail = buildBlockerDetail({
      code: 'OTP_PROVIDER_EXTERNAL_GATED',
      dimension: 'COMMUNICATIONS',
      country_code: 'AE',
      category: 'communications',
    });
    expect(detail.blocks_activation).toBe(true);
    expect(detail.actionable).toBe('EXTERNAL');
    expect(detail.taxonomy).toBe('EXTERNAL_PROVIDER_REQUIRED');
    expect(detail.actionability.can_clear_from_application).toBe(false);
    expect(detail.country_code).toBe('AE');
    expect(detail.explanation.length).toBeGreaterThan(0);
  });
});
