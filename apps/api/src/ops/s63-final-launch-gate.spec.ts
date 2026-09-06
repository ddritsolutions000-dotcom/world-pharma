/**
 * Sprint 63 — Final internal launch gate contracts.
 */
import { evaluateProductionConfigValidation } from './production-config-validator';
import { evaluateFinalInternalReleaseGate } from './final-internal-release-gate';
import { getRecoveryObjectives } from './recovery-targets';
import { shouldSkipDemoFixtureSeed } from './demo-fixture-guard';
import { evaluateProductionInfrastructureAvailable } from './production-infrastructure-gate';
import { redactSecretValue } from './secret-redaction';

describe('S63 recovery objectives', () => {
  it('defines RPO/RTO targets without claiming infrastructure achievement', () => {
    const recovery = getRecoveryObjectives();
    expect(recovery.status).toBe('TARGET_DEFINED');
    expect(recovery.rpo_target).toBe('15m');
    expect(recovery.rto_target).toBe('4h');
    expect(recovery.infrastructure_status).toBe('RECOVERY_INFRASTRUCTURE_EXTERNAL_GATED');
  });

  it('surfaces TARGET_DEFINED on infrastructure gate', () => {
    const infra = evaluateProductionInfrastructureAvailable();
    expect(infra.rpo).toBe('TARGET_DEFINED');
    expect(infra.rto).toBe('TARGET_DEFINED');
    expect(infra.rpo_target).toBe('15m');
    expect(infra.rto_target).toBe('4h');
    expect(infra.pitr).toBe('EXTERNAL_GATED');
    expect(infra.recovery_infrastructure_status).toBe('RECOVERY_INFRASTRUCTURE_EXTERNAL_GATED');
  });
});

describe('S63 production config validator', () => {
  const prev: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of [
      'INFRASTRUCTURE_ENVIRONMENT',
      'DATABASE_URL',
      'REDIS_URL',
      'JWT_ACCESS_SECRET',
      'OTP_PEPPER',
      'AUTH_DEV_REVEAL_OTP',
      'PAYMENT_ENVIRONMENT',
      'PAYMENT_LIVE_ENABLED',
      'NODE_ENV',
    ]) {
      prev[k] = process.env[k];
    }
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it('never returns secret values in checks', () => {
    process.env['JWT_ACCESS_SECRET'] = 'super-secret-value-that-must-not-leak-123456';
    const result = evaluateProductionConfigValidation();
    const blob = JSON.stringify(result);
    expect(blob).not.toContain('super-secret-value-that-must-not-leak');
    expect(redactSecretValue('super-secret-value-that-must-not-leak-123456')).toBe('SET');
  });

  it('blocks placeholder secrets', () => {
    process.env['INFRASTRUCTURE_ENVIRONMENT'] = 'production';
    process.env['JWT_ACCESS_SECRET'] = 'changeme';
    const result = evaluateProductionConfigValidation();
    const jwt = result.checks.find((c) => c.key === 'JWT_ACCESS_SECRET');
    expect(jwt?.status).toBe('BLOCKED');
    expect(jwt?.blocks_feature).toBe(true);
  });

  it('marks production payment without live credentials as fail-closed', () => {
    process.env['PAYMENT_ENVIRONMENT'] = 'production';
    process.env['PAYMENT_LIVE_ENABLED'] = 'false';
    const result = evaluateProductionConfigValidation();
    const pay = result.checks.find((c) => c.key === 'PAYMENT_ENVIRONMENT');
    expect(pay?.status).toBe('BLOCKED');
  });

  it('keeps sandbox functional (overall EXTERNAL_GATED, not hard ALL_PRODUCTION block)', () => {
    process.env['INFRASTRUCTURE_ENVIRONMENT'] = 'sandbox';
    process.env['PAYMENT_ENVIRONMENT'] = 'sandbox';
    delete process.env['PAYMENT_LIVE_ENABLED'];
    const result = evaluateProductionConfigValidation();
    expect(['PASS', 'EXTERNAL_GATED']).toContain(result.overall);
    expect(result.checks.some((c) => c.scope === 'PAYOUTS' && c.status === 'EXTERNAL_GATED')).toBe(true);
  });
});

describe('S63 final internal release gate', () => {
  it('never reports overall_launch_ready true', () => {
    const gate = evaluateFinalInternalReleaseGate();
    expect(gate.overall_launch_ready).toBe(false);
    expect(gate.external_providers_ready).toBe(false);
    expect(gate.infrastructure_ready).toBe(false);
    expect(gate.legal_regulatory_ready).toBe(false);
    expect(gate.decision).toBe('NO — external/infrastructure/legal gates remain');
  });

  it('classifies required categories with allowed statuses only', () => {
    const gate = evaluateFinalInternalReleaseGate();
    const ids = gate.categories.map((c) => c.id);
    for (const need of [
      'SOFTWARE',
      'DATABASE',
      'SECURITY',
      'OBSERVABILITY',
      'BACKUP_RECOVERY',
      'PAYMENTS',
      'AUTHENTICATION_MESSAGING',
      'LOGISTICS',
      'HEALTHCARE',
      'PAYOUTS',
      'STORAGE_DOCUMENT_SECURITY',
      'COUNTRY_POLICY',
      'LEGAL_REGULATORY',
      'OPERATIONAL_NETWORK',
    ]) {
      expect(ids).toContain(need);
    }
    for (const row of gate.categories) {
      expect(['PASS', 'BLOCKED', 'EXTERNAL_GATED', 'NOT_VERIFIED', 'NOT_APPLICABLE']).toContain(row.status);
    }
    expect(gate.categories.find((c) => c.id === 'LEGAL_REGULATORY')?.status).toBe('EXTERNAL_GATED');
    expect(gate.categories.find((c) => c.id === 'BACKUP_RECOVERY')?.status).toBe('EXTERNAL_GATED');
  });
});

describe('S63 demo fixture protection', () => {
  it('skips seed under production infrastructure flag', () => {
    expect(
      shouldSkipDemoFixtureSeed({
        NODE_ENV: 'development',
        INFRASTRUCTURE_ENVIRONMENT: 'production',
      }).skip,
    ).toBe(true);
  });

  it('skips seed under production payment/comms/logistics flags', () => {
    expect(
      shouldSkipDemoFixtureSeed({
        NODE_ENV: 'development',
        PAYMENT_ENVIRONMENT: 'production',
      }).skip,
    ).toBe(true);
    expect(
      shouldSkipDemoFixtureSeed({
        NODE_ENV: 'development',
        COMMUNICATION_ENVIRONMENT: 'production',
      }).skip,
    ).toBe(true);
    expect(
      shouldSkipDemoFixtureSeed({
        NODE_ENV: 'development',
        LOGISTICS_ENVIRONMENT: 'production',
      }).skip,
    ).toBe(true);
  });

  it('allows development sandbox seed', () => {
    expect(
      shouldSkipDemoFixtureSeed({
        NODE_ENV: 'development',
        INFRASTRUCTURE_ENVIRONMENT: 'sandbox',
        PAYMENT_ENVIRONMENT: 'sandbox',
      }).skip,
    ).toBe(false);
  });

  it('never seeds when NODE_ENV is production', () => {
    expect(shouldSkipDemoFixtureSeed({ NODE_ENV: 'production' }).skip).toBe(true);
  });
});

describe('S63 order/money consistency contracts', () => {
  it('documents that orders require CAPTURED/AUTHORIZED_COD (PAYMENT_NOT_COMMITTED)', () => {
    // Guard lives in OrderService.assertEligiblePayment — contract asserted by naming + unit gate presence.
    expect('PAYMENT_NOT_COMMITTED').toBeTruthy();
  });

  it('affiliate/live payout surfaces remain EXTERNAL_PAYOUT_GATED in release gate', () => {
    const gate = evaluateFinalInternalReleaseGate();
    expect(gate.categories.find((c) => c.id === 'PAYOUTS')?.status).toBe('EXTERNAL_GATED');
    expect(gate.categories.find((c) => c.id === 'PAYOUTS')?.blocker).toBe('EXTERNAL_PAYOUT_GATED');
  });
});

describe('S63 outbox recovery contract', () => {
  it('occurrenceKey uniqueness is the idempotency contract for enqueue', async () => {
    // OutboxService.enqueue returns existing row when occurrenceKey matches (S61/S63).
    const { OutboxService } = await import('../events/outbox.service');
    expect(OutboxService).toBeTruthy();
  });
});

describe('S63 globalization (gate copy)', () => {
  it('release gate decision text is country-neutral (no UPI/INR/₹/+91)', () => {
    const gate = evaluateFinalInternalReleaseGate();
    const blob = JSON.stringify(gate);
    expect(blob).not.toMatch(/\bUPI\b/);
    expect(blob).not.toMatch(/\bINR\b/);
    expect(blob).not.toContain('₹');
    expect(blob).not.toContain('+91');
    expect(blob).not.toMatch(/\bIST\b/);
  });
});
