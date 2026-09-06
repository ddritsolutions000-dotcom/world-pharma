/**
 * Sprint 62 — production readiness contracts (fail-closed, no live providers).
 */
import { CountryProductionLifecycle, ProductionDependencyStatus } from '@prisma/client';
import { evaluateProductionPaymentAvailable } from '../payment/production-payment-gate';
import { evaluateProductionOtpAvailable } from '../identity/production-otp-gate';
import { evaluateProductionLogisticsAvailable } from '../logistics/production-logistics-gate';
import { evaluateProductionInfrastructureAvailable } from '../ops/production-infrastructure-gate';
import { listHealthcareIntegrationCatalog } from '../healthcare/production-healthcare-gate';
import { decideOverall, statusFromGateBlockers } from './final-launch-readiness';
import { listKnownProductionDependencyCatalog } from './launch-blocker-actionability';

describe('S62 production readiness inventory contracts', () => {
  it('lists known production dependency catalog covering required external rails', () => {
    const catalog = listKnownProductionDependencyCatalog();
    const codes = catalog.map((d) => d.code);
    for (const needle of [
      'PAYMENT_PROVIDER',
      'OTP_PROVIDER',
      'MESSAGING_PROVIDER',
      'CARRIER',
      'KYC_PROVIDER',
      'OBJECT_STORAGE',
      'KMS_SECRETS',
      'MALWARE_SCANNER',
      'PITR_OFFSITE',
      'ERX',
      'VIDEO',
      'PACS_DICOM',
      'HL7_FHIR',
    ]) {
      expect(codes).toContain(needle);
    }
  });

  it('never treats EXTERNAL_GATED-only blockers as READY_FOR_ACTIVATION', () => {
    expect(statusFromGateBlockers(false, ['PAYMENT_PROVIDER_EXTERNAL_GATED'])).toBe('EXTERNAL_GATED');
    expect(
      decideOverall('ACTIVE', [{ status: 'EXTERNAL_GATED' }, { status: 'EXTERNAL_GATED' }]),
    ).toBe('NOT_READY');
  });

  it('healthcare integration catalog entries remain EXTERNAL_GATED', () => {
    const rows = listHealthcareIntegrationCatalog();
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.status).toBe('EXTERNAL_GATED');
    }
  });
});

describe('S62 fail-closed payment/OTP/logistics/infra', () => {
  const prev = {
    payEnv: process.env['PAYMENT_ENVIRONMENT'],
    payLive: process.env['PAYMENT_LIVE_ENABLED'],
    commEnv: process.env['COMMUNICATION_ENVIRONMENT'],
    otpLive: process.env['OTP_LIVE_ENABLED'],
    logEnv: process.env['LOGISTICS_ENVIRONMENT'],
    carLive: process.env['CARRIER_LIVE_ENABLED'],
  };

  afterEach(() => {
    const restore = (k: string, v: string | undefined) => {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    };
    restore('PAYMENT_ENVIRONMENT', prev.payEnv);
    restore('PAYMENT_LIVE_ENABLED', prev.payLive);
    restore('COMMUNICATION_ENVIRONMENT', prev.commEnv);
    restore('OTP_LIVE_ENABLED', prev.otpLive);
    restore('LOGISTICS_ENVIRONMENT', prev.logEnv);
    restore('CARRIER_LIVE_ENABLED', prev.carLive);
  });

  function prismaStub(depExternal: boolean) {
    return {
      country: {
        findUnique: async () => ({
          id: 'c1',
          isoAlpha2: 'IN',
          productionLifecycle: CountryProductionLifecycle.ACTIVE,
        }),
      },
      productionDependency: {
        findFirst: async () => ({
          status: ProductionDependencyStatus.VERIFIED,
          configReference: depExternal ? null : 'cfg-ref',
          externalGated: depExternal,
          providerIdentifier: depExternal ? 'MOCK' : 'LIVE_VENDOR',
        }),
      },
      r14AHumanGate: { findMany: async () => [] },
      serviceabilityZone: { count: async () => 0 },
      carrierCoverage: { count: async () => 0 },
    } as never;
  }

  it('payment stays unavailable when dependency EXTERNAL_GATED under production env', async () => {
    process.env['PAYMENT_ENVIRONMENT'] = 'production';
    process.env['PAYMENT_LIVE_ENABLED'] = 'true';
    const result = await evaluateProductionPaymentAvailable(prismaStub(true), { countryCode: 'IN' });
    expect(result.available).toBe(false);
    expect(result.blockers.join(',')).toMatch(/EXTERNAL_GATED|R14|MOCK|DISABLED|MISSING|CONFIG/i);
  });

  it('OTP stays unavailable without live production path', async () => {
    process.env['COMMUNICATION_ENVIRONMENT'] = 'sandbox';
    delete process.env['OTP_LIVE_ENABLED'];
    const result = await evaluateProductionOtpAvailable(prismaStub(true), { countryCode: 'IN' });
    expect(result.available).toBe(false);
  });

  it('logistics remains gated (no production carrier adapter)', async () => {
    process.env['LOGISTICS_ENVIRONMENT'] = 'production';
    process.env['CARRIER_LIVE_ENABLED'] = 'true';
    const result = await evaluateProductionLogisticsAvailable(prismaStub(false), { countryCode: 'IN' });
    expect(result.available).toBe(false);
    expect(result.external_gate).toBe('EXTERNAL_GATED');
    expect(result.blockers).toEqual(expect.arrayContaining(['NO_PRODUCTION_CARRIER_ADAPTER']));
  });

  it('infrastructure evaluate reports EXTERNAL_GATED PITR', () => {
    const infra = evaluateProductionInfrastructureAvailable();
    expect(['EXTERNAL_GATED', 'BLOCKED', 'READY']).toContain(infra.status);
    expect(infra.pitr).toBe('EXTERNAL_GATED');
    expect(infra.rpo).toBe('TARGET_DEFINED');
    expect(infra.rto).toBe('TARGET_DEFINED');
    expect(infra.recovery_infrastructure_status).toBe('RECOVERY_INFRASTRUCTURE_EXTERNAL_GATED');
  });
});
