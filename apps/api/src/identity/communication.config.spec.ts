import { CountryProductionLifecycle, ProductionDependencyStatus } from '@prisma/client';
import { evaluateProductionMessagingAvailable } from '../platform/production-messaging-gate';
import {
  isLiveOtpEnabled,
  isMockOtpProvider,
  readCommunicationEnvironment,
} from './communication.config';

describe('communication.config', () => {
  afterEach(() => {
    delete process.env['COMMUNICATION_ENVIRONMENT'];
    delete process.env['OTP_ENVIRONMENT'];
    delete process.env['OTP_LIVE_ENABLED'];
    delete process.env['COMMUNICATION_LIVE_ENABLED'];
  });

  it('defaults to sandbox and live disabled', () => {
    expect(readCommunicationEnvironment()).toBe('sandbox');
    expect(isLiveOtpEnabled()).toBe(false);
  });

  it('detects mock/console providers', () => {
    expect(isMockOtpProvider('CONSOLE')).toBe(true);
    expect(isMockOtpProvider('MOCK_SMS')).toBe(true);
    expect(isMockOtpProvider('TWILIO')).toBe(false);
  });
});

describe('production-messaging-gate', () => {
  afterEach(() => {
    delete process.env['COMMUNICATION_ENVIRONMENT'];
    delete process.env['OTP_LIVE_ENABLED'];
  });

  it('blocks when no SMS/MESSAGING/EMAIL provider dependency', async () => {
    process.env['COMMUNICATION_ENVIRONMENT'] = 'production';
    process.env['OTP_LIVE_ENABLED'] = 'true';
    const prisma = {
      country: {
        findUnique: async () => ({
          id: 'c1',
          isoAlpha2: 'BB',
          productionLifecycle: CountryProductionLifecycle.ACTIVE,
        }),
      },
      productionDependency: {
        findMany: async () => [],
      },
    } as never;
    const result = await evaluateProductionMessagingAvailable(prisma, { countryCode: 'BB' });
    expect(result.available).toBe(false);
    expect(result.blockers).toContain('MESSAGING_PROVIDER_DEPENDENCY_MISSING');
    expect(result.never_fallback_to_mock).toBe(true);
  });

  it('blocks mock messaging provider', async () => {
    process.env['COMMUNICATION_ENVIRONMENT'] = 'production';
    process.env['OTP_LIVE_ENABLED'] = 'true';
    const prisma = {
      country: {
        findUnique: async () => ({
          id: 'c1',
          isoAlpha2: 'BB',
          productionLifecycle: CountryProductionLifecycle.ACTIVE,
        }),
      },
      productionDependency: {
        findMany: async () => [
          {
            dependencyType: 'SMS_PROVIDER',
            status: ProductionDependencyStatus.VERIFIED,
            externalGated: false,
            configReference: 'vault:sms',
            providerIdentifier: 'SANDBOX_SMS',
          },
        ],
      },
    } as never;
    const result = await evaluateProductionMessagingAvailable(prisma, { countryCode: 'BB' });
    expect(result.blockers).toContain('MOCK_MESSAGING_PROVIDER_PRODUCTION_FORBIDDEN');
  });
});
