import { CountryProductionLifecycle, ProductionDependencyStatus } from '@prisma/client';
import {
  evaluateProductionPaymentAvailable,
  type ProductionPaymentAvailability,
} from './production-payment-gate';

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
  gates?: unknown[];
}) {
  return {
    country: {
      findUnique: async () => overrides.country ?? null,
    },
    productionDependency: {
      findFirst: async () => overrides.dep ?? null,
    },
    r14AHumanGate: {
      findMany: async () => overrides.gates ?? [],
    },
  } as never;
}

describe('production-payment-gate', () => {
  const prevEnv = process.env['PAYMENT_ENVIRONMENT'];
  const prevLive = process.env['PAYMENT_LIVE_ENABLED'];

  afterEach(() => {
    if (prevEnv === undefined) delete process.env['PAYMENT_ENVIRONMENT'];
    else process.env['PAYMENT_ENVIRONMENT'] = prevEnv;
    if (prevLive === undefined) delete process.env['PAYMENT_LIVE_ENABLED'];
    else process.env['PAYMENT_LIVE_ENABLED'] = prevLive;
  });

  it('blocks when country is missing', async () => {
    const result = await evaluateProductionPaymentAvailable(mockPrisma({ country: null }), {
      countryCode: 'ZZ',
    });
    expect(result.available).toBe(false);
    expect(result.blockers).toContain('COUNTRY_NOT_FOUND');
  });

  it('blocks suspended country and missing PSP dependency', async () => {
    process.env['PAYMENT_ENVIRONMENT'] = 'sandbox';
    delete process.env['PAYMENT_LIVE_ENABLED'];
    const result: ProductionPaymentAvailability = await evaluateProductionPaymentAvailable(
      mockPrisma({
        country: {
          id: 'c1',
          isoAlpha2: 'AA',
          productionLifecycle: CountryProductionLifecycle.SUSPENDED,
        },
        dep: null,
      }),
      { countryCode: 'AA' },
    );
    expect(result.available).toBe(false);
    expect(result.blockers).toEqual(
      expect.arrayContaining([
        'COUNTRY_PRODUCTION_SUSPENDED',
        'PAYMENT_PROVIDER_DEPENDENCY_MISSING',
        'R14_A_OWNER_CONFIRMATION_REQUIRED',
        'LIVE_PAYMENTS_DISABLED',
      ]),
    );
  });

  it('blocks EXTERNAL_GATED dependency even when status VERIFIED without merchant ref', async () => {
    process.env['PAYMENT_ENVIRONMENT'] = 'production';
    process.env['PAYMENT_LIVE_ENABLED'] = 'true';
    const result = await evaluateProductionPaymentAvailable(
      mockPrisma({
        country: {
          id: 'c1',
          isoAlpha2: 'AA',
          productionLifecycle: CountryProductionLifecycle.ACTIVE,
        },
        dep: {
          status: ProductionDependencyStatus.VERIFIED,
          configReference: null,
          externalGated: true,
          providerIdentifier: 'STRIPE',
        },
      }),
      { countryCode: 'AA' },
    );
    expect(result.available).toBe(false);
    expect(result.blockers).toEqual(
      expect.arrayContaining([
        'PAYMENT_PROVIDER_EXTERNAL_GATED',
        'MERCHANT_CONFIG_REF_MISSING',
        'R14_A_OWNER_CONFIRMATION_REQUIRED',
      ]),
    );
  });

  it('blocks mock provider identifier in production dependency', async () => {
    process.env['PAYMENT_ENVIRONMENT'] = 'production';
    process.env['PAYMENT_LIVE_ENABLED'] = 'true';
    const result = await evaluateProductionPaymentAvailable(
      mockPrisma({
        country: {
          id: 'c1',
          isoAlpha2: 'AA',
          productionLifecycle: CountryProductionLifecycle.ACTIVE,
        },
        dep: {
          status: ProductionDependencyStatus.VERIFIED,
          configReference: 'vault:prod/payments/mock',
          externalGated: false,
          providerIdentifier: 'MOCK_PRIMARY',
        },
      }),
      { countryCode: 'AA' },
    );
    expect(result.blockers).toContain('MOCK_GATEWAY_PRODUCTION_FORBIDDEN');
    expect(result.available).toBe(false);
  });
});
