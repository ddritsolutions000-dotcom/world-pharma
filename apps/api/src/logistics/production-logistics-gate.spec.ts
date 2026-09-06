import { CountryProductionLifecycle, ProductionDependencyStatus } from '@prisma/client';
import { evaluateProductionLogisticsAvailable } from './production-logistics-gate';

function mockPrisma(overrides: {
  country?: {
    id: string;
    isoAlpha2: string;
    productionLifecycle: CountryProductionLifecycle;
  } | null;
  dep?: {
    status: ProductionDependencyStatus;
    configReference: string | null;
    externalGated: boolean;
    providerIdentifier: string | null;
  } | null;
  zones?: number;
  coverages?: number;
}) {
  return {
    country: {
      findUnique: async () => overrides.country ?? null,
    },
    productionDependency: {
      findFirst: async () => overrides.dep ?? null,
    },
    serviceabilityZone: {
      count: async () => overrides.zones ?? 0,
    },
    carrierCoverage: {
      count: async () => overrides.coverages ?? 0,
    },
  } as never;
}

describe('production-logistics-gate', () => {
  const prevEnv = process.env['LOGISTICS_ENVIRONMENT'];
  const prevLive = process.env['CARRIER_LIVE_ENABLED'];

  afterEach(() => {
    if (prevEnv === undefined) delete process.env['LOGISTICS_ENVIRONMENT'];
    else process.env['LOGISTICS_ENVIRONMENT'] = prevEnv;
    if (prevLive === undefined) delete process.env['CARRIER_LIVE_ENABLED'];
    else process.env['CARRIER_LIVE_ENABLED'] = prevLive;
  });

  it('blocks when country is missing', async () => {
    const result = await evaluateProductionLogisticsAvailable(mockPrisma({ country: null }), {
      countryCode: 'ZZ',
    });
    expect(result.available).toBe(false);
    expect(result.blockers).toContain('COUNTRY_NOT_FOUND');
    expect(result.never_fallback_to_mock).toBe(true);
    expect(result.external_gate).toBe('EXTERNAL_GATED');
  });

  it('blocks inactive country and missing carrier dependency', async () => {
    const result = await evaluateProductionLogisticsAvailable(
      mockPrisma({
        country: {
          id: 'c1',
          isoAlpha2: 'AA',
          productionLifecycle: CountryProductionLifecycle.CONFIGURED,
        },
        dep: null,
      }),
      { countryCode: 'AA' },
    );
    expect(result.available).toBe(false);
    expect(result.blockers).toEqual(
      expect.arrayContaining([
        'COUNTRY_PRODUCTION_NOT_ACTIVE',
        'CARRIER_DEPENDENCY_MISSING',
        'LOGISTICS_LIVE_DISABLED',
        'NO_PRODUCTION_CARRIER_ADAPTER',
      ]),
    );
  });

  it('blocks suspended country', async () => {
    const result = await evaluateProductionLogisticsAvailable(
      mockPrisma({
        country: {
          id: 'c1',
          isoAlpha2: 'AA',
          productionLifecycle: CountryProductionLifecycle.SUSPENDED,
        },
        dep: null,
        zones: 1,
      }),
      { countryCode: 'AA' },
    );
    expect(result.blockers).toContain('COUNTRY_PRODUCTION_SUSPENDED');
    expect(result.blockers).not.toContain('COUNTRY_PRODUCTION_NOT_ACTIVE');
  });

  it('blocks EXTERNAL_GATED and mock provider even when status VERIFIED', async () => {
    process.env['LOGISTICS_ENVIRONMENT'] = 'production';
    process.env['CARRIER_LIVE_ENABLED'] = 'true';
    const result = await evaluateProductionLogisticsAvailable(
      mockPrisma({
        country: {
          id: 'c1',
          isoAlpha2: 'AA',
          productionLifecycle: CountryProductionLifecycle.ACTIVE,
        },
        dep: {
          status: ProductionDependencyStatus.VERIFIED,
          configReference: 'vault:prod/carrier/account',
          externalGated: true,
          providerIdentifier: 'MOCK',
        },
        zones: 1,
        coverages: 1,
      }),
      { countryCode: 'AA' },
    );
    expect(result.available).toBe(false);
    expect(result.blockers).toEqual(
      expect.arrayContaining([
        'CARRIER_EXTERNAL_GATED',
        'MOCK_CARRIER_PRODUCTION_FORBIDDEN',
        'NO_PRODUCTION_CARRIER_ADAPTER',
      ]),
    );
  });

  it('blocks missing carrier config reference', async () => {
    process.env['LOGISTICS_ENVIRONMENT'] = 'production';
    process.env['CARRIER_LIVE_ENABLED'] = 'true';
    const result = await evaluateProductionLogisticsAvailable(
      mockPrisma({
        country: {
          id: 'c1',
          isoAlpha2: 'AA',
          productionLifecycle: CountryProductionLifecycle.ACTIVE,
        },
        dep: {
          status: ProductionDependencyStatus.VERIFIED,
          configReference: null,
          externalGated: false,
          providerIdentifier: 'ACME_EXPRESS',
        },
        zones: 1,
      }),
      { countryCode: 'AA' },
    );
    expect(result.blockers).toContain('CARRIER_CONFIG_MISSING');
  });

  it('blocks when serviceability cannot be established', async () => {
    process.env['LOGISTICS_ENVIRONMENT'] = 'production';
    process.env['CARRIER_LIVE_ENABLED'] = 'true';
    const result = await evaluateProductionLogisticsAvailable(
      mockPrisma({
        country: {
          id: 'c1',
          isoAlpha2: 'AA',
          productionLifecycle: CountryProductionLifecycle.ACTIVE,
        },
        dep: {
          status: ProductionDependencyStatus.VERIFIED,
          configReference: 'cfg',
          externalGated: false,
          providerIdentifier: 'ACME_EXPRESS',
        },
        zones: 0,
        coverages: 0,
      }),
      { countryCode: 'AA' },
    );
    expect(result.blockers).toContain('SERVICEABILITY_NOT_READY');
    expect(result.serviceability_ready).toBe(false);
  });

  it('blocks non-verified carrier as not live', async () => {
    process.env['LOGISTICS_ENVIRONMENT'] = 'production';
    process.env['CARRIER_LIVE_ENABLED'] = 'true';
    const result = await evaluateProductionLogisticsAvailable(
      mockPrisma({
        country: {
          id: 'c1',
          isoAlpha2: 'AA',
          productionLifecycle: CountryProductionLifecycle.ACTIVE,
        },
        dep: {
          status: ProductionDependencyStatus.MISSING,
          configReference: 'cfg',
          externalGated: false,
          providerIdentifier: 'ACME_EXPRESS',
        },
        zones: 1,
      }),
      { countryCode: 'AA' },
    );
    expect(result.blockers).toContain('CARRIER_NOT_LIVE');
  });

  it('records production environment not set while sandbox is active', async () => {
    delete process.env['LOGISTICS_ENVIRONMENT'];
    delete process.env['CARRIER_LIVE_ENABLED'];
    const result = await evaluateProductionLogisticsAvailable(
      mockPrisma({
        country: {
          id: 'c1',
          isoAlpha2: 'AA',
          productionLifecycle: CountryProductionLifecycle.ACTIVE,
        },
        dep: {
          status: ProductionDependencyStatus.VERIFIED,
          configReference: 'cfg',
          externalGated: false,
          providerIdentifier: 'ACME_EXPRESS',
        },
        zones: 1,
      }),
      { countryCode: 'AA' },
    );
    expect(result.blockers).toContain('PRODUCTION_ENVIRONMENT_NOT_SET');
    expect(result.warnings.some((w) => w.includes('sandbox'))).toBe(true);
  });

  it('still fail-closed when production flags are enabled because no live adapter exists', async () => {
    process.env['LOGISTICS_ENVIRONMENT'] = 'production';
    process.env['CARRIER_LIVE_ENABLED'] = 'true';
    const result = await evaluateProductionLogisticsAvailable(
      mockPrisma({
        country: {
          id: 'c1',
          isoAlpha2: 'AA',
          productionLifecycle: CountryProductionLifecycle.ACTIVE,
        },
        dep: {
          status: ProductionDependencyStatus.VERIFIED,
          configReference: 'vault:prod/carrier/account',
          externalGated: false,
          providerIdentifier: 'ACME_EXPRESS',
        },
        zones: 2,
        coverages: 1,
      }),
      { countryCode: 'AA' },
    );
    expect(result.available).toBe(false);
    expect(result.blockers).toEqual(['NO_PRODUCTION_CARRIER_ADAPTER']);
    expect(result.never_fallback_to_mock).toBe(true);
  });
});
