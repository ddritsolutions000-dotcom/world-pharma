import { TokenService } from './token.service';
import { ConfigService } from '@nestjs/config';
import { AppEnv } from '@world-pharma/config';

describe('TokenService', () => {
  const env: Pick<
    AppEnv,
    'JWT_ACCESS_SECRET' | 'JWT_ISSUER' | 'AUTH_ACCESS_TTL_SECONDS'
  > = {
    JWT_ACCESS_SECRET: 'test-access-secret-must-be-32-chars-min',
    JWT_ISSUER: 'world-pharma',
    AUTH_ACCESS_TTL_SECONDS: 900,
  };

  const config = {
    get: (key: keyof typeof env) => env[key],
  } as unknown as ConfigService<AppEnv, true>;

  it('signs and verifies a minimal access token', () => {
    const tokens = new TokenService(config);
    const jwt = tokens.signAccess({
      sub: '11111111-1111-7111-8111-111111111111',
      sid: '22222222-2222-7222-8222-222222222222',
      aud: 'customer',
      roles: [],
      ver: 1,
    });
    const claims = tokens.verifyAccess(jwt);
    expect(claims.sub).toBe('11111111-1111-7111-8111-111111111111');
    expect(claims.sid).toBe('22222222-2222-7222-8222-222222222222');
    expect(claims.aud).toBe('customer');
    expect(JSON.stringify(claims)).not.toMatch(/password|otp|secret/i);
  });
});
