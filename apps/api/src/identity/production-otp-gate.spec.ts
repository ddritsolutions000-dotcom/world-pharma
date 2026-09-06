import { CountryProductionLifecycle, ProductionDependencyStatus } from '@prisma/client';
import {
  evaluateProductionOtpAvailable,
  type ProductionOtpAvailability,
} from './production-otp-gate';

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
}) {
  return {
    country: {
      findUnique: async () => overrides.country ?? null,
    },
    productionDependency: {
      findFirst: async () => overrides.dep ?? null,
    },
  } as never;
}

describe('production-otp-gate', () => {
  const prevEnv = process.env['COMMUNICATION_ENVIRONMENT'];
  const prevLive = process.env['OTP_LIVE_ENABLED'];

  afterEach(() => {
    if (prevEnv === undefined) delete process.env['COMMUNICATION_ENVIRONMENT'];
    else process.env['COMMUNICATION_ENVIRONMENT'] = prevEnv;
    if (prevLive === undefined) delete process.env['OTP_LIVE_ENABLED'];
    else process.env['OTP_LIVE_ENABLED'] = prevLive;
    delete process.env['COMMUNICATION_LIVE_ENABLED'];
  });

  it('blocks when country is missing', async () => {
    const result = await evaluateProductionOtpAvailable(mockPrisma({ country: null }), {
      countryCode: 'ZZ',
    });
    expect(result.available).toBe(false);
    expect(result.blockers).toContain('COUNTRY_NOT_FOUND');
    expect(result.never_fallback_to_mock).toBe(true);
  });

  it('blocks suspended country and missing OTP dependency', async () => {
    process.env['COMMUNICATION_ENVIRONMENT'] = 'sandbox';
    delete process.env['OTP_LIVE_ENABLED'];
    const result: ProductionOtpAvailability = await evaluateProductionOtpAvailable(
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
        'OTP_PROVIDER_DEPENDENCY_MISSING',
        'LIVE_OTP_DISABLED',
      ]),
    );
  });

  it('blocks EXTERNAL_GATED dependency even when status VERIFIED without sender ref', async () => {
    process.env['COMMUNICATION_ENVIRONMENT'] = 'production';
    process.env['OTP_LIVE_ENABLED'] = 'true';
    const result = await evaluateProductionOtpAvailable(
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
          providerIdentifier: 'TWILIO',
        },
      }),
      { countryCode: 'AA' },
    );
    expect(result.available).toBe(false);
    expect(result.blockers).toEqual(
      expect.arrayContaining([
        'OTP_PROVIDER_EXTERNAL_GATED',
        'SENDER_CONFIG_REF_MISSING',
      ]),
    );
  });

  it('blocks mock/console provider identifier in production dependency', async () => {
    process.env['COMMUNICATION_ENVIRONMENT'] = 'production';
    process.env['OTP_LIVE_ENABLED'] = 'true';
    const result = await evaluateProductionOtpAvailable(
      mockPrisma({
        country: {
          id: 'c1',
          isoAlpha2: 'AA',
          productionLifecycle: CountryProductionLifecycle.ACTIVE,
        },
        dep: {
          status: ProductionDependencyStatus.VERIFIED,
          configReference: 'vault:prod/otp/sender',
          externalGated: false,
          providerIdentifier: 'CONSOLE',
        },
      }),
      { countryCode: 'AA' },
    );
    expect(result.blockers).toContain('MOCK_OTP_PROVIDER_PRODUCTION_FORBIDDEN');
    expect(result.available).toBe(false);
  });

  it('blocks inactive (CONFIGURED) country', async () => {
    process.env['COMMUNICATION_ENVIRONMENT'] = 'production';
    process.env['OTP_LIVE_ENABLED'] = 'true';
    const result = await evaluateProductionOtpAvailable(
      mockPrisma({
        country: {
          id: 'c1',
          isoAlpha2: 'AA',
          productionLifecycle: CountryProductionLifecycle.CONFIGURED,
        },
        dep: {
          status: ProductionDependencyStatus.VERIFIED,
          configReference: 'vault:x',
          externalGated: false,
          providerIdentifier: 'TWILIO',
        },
      }),
      { countryCode: 'AA' },
    );
    expect(result.blockers).toContain('COUNTRY_PRODUCTION_NOT_ACTIVE');
  });
});
