import { ConfigService } from '@nestjs/config';
import { JwtAudience } from '@prisma/client';
import type { AppEnv } from '@world-pharma/config';
import { MfaService } from './mfa.service';

function createMfa(env: Partial<AppEnv>): MfaService {
  const config = {
    get: (key: keyof AppEnv) => env[key as keyof AppEnv],
  } as ConfigService<AppEnv, true>;
  return new MfaService({} as never, {} as never, {} as never, {} as never, config);
}

const adminSuperAdmin = {
  mfaRequired: false,
  roles: ['super_admin'],
  audience: 'admin' as JwtAudience,
};

describe('MfaService policy', () => {
  it('defaults development login MFA to disabled', () => {
    const mfa = createMfa({ NODE_ENV: 'development' });
    expect(mfa.isLoginMfaDisabledByEnvironment()).toBe(true);
    expect(mfa.resolveLoginMfaGate({ ...adminSuperAdmin, mfaEnrolled: true })).toBe('none');
    expect(mfa.resolveLoginMfaGate({ ...adminSuperAdmin, mfaEnrolled: false })).toBe('none');
  });

  it('requires MFA in development when AUTH_MFA_ENABLED=true', () => {
    const mfa = createMfa({ NODE_ENV: 'development', AUTH_MFA_ENABLED: true });
    expect(mfa.isLoginMfaDisabledByEnvironment()).toBe(false);
    expect(mfa.resolveLoginMfaGate({ ...adminSuperAdmin, mfaEnrolled: false })).toBe('enroll');
    expect(mfa.resolveLoginMfaGate({ ...adminSuperAdmin, mfaEnrolled: true })).toBe('verify');
  });

  it('never disables MFA in production regardless of AUTH_MFA_ENABLED', () => {
    const mfa = createMfa({ NODE_ENV: 'production', AUTH_MFA_ENABLED: false as never });
    expect(mfa.isLoginMfaDisabledByEnvironment()).toBe(false);
    expect(mfa.isEffectivePolicyRequired(adminSuperAdmin)).toBe(true);
    expect(mfa.resolveLoginMfaGate({ ...adminSuperAdmin, mfaEnrolled: true })).toBe('verify');
  });

  it('ignores enrolled TOTP when development MFA is disabled', () => {
    const mfa = createMfa({ NODE_ENV: 'development' });
    expect(mfa.resolveLoginMfaGate({ ...adminSuperAdmin, mfaEnrolled: true })).toBe('none');
  });

  it('does not require MFA for non-admin audiences', () => {
    const mfa = createMfa({ NODE_ENV: 'production' });
    expect(
      mfa.resolveLoginMfaGate({
        mfaRequired: false,
        roles: [],
        audience: 'customer',
        mfaEnrolled: false,
      }),
    ).toBe('none');
  });
});
