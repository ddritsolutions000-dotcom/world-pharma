import { parseEnv } from './env';

const base = {
  NODE_ENV: 'test',
  PORT: '4000',
  DATABASE_URL: 'postgresql://worldpharma:worldpharma@localhost:5432/worldpharma',
  REDIS_URL: 'redis://localhost:6379',
  JWT_ACCESS_SECRET: 'test-access-secret-must-be-32-chars-min',
  OTP_PEPPER: 'test-otp-pepper-must-be-32-chars-minx',
};

describe('parseEnv', () => {
  it('accepts valid configuration', () => {
    const env = parseEnv(base);
    expect(env.PORT).toBe(4000);
    expect(env.NODE_ENV).toBe('test');
    expect(env.AUTH_ACCESS_TTL_SECONDS).toBe(900);
  });

  it('rejects missing DATABASE_URL', () => {
    expect(() =>
      parseEnv({
        ...base,
        DATABASE_URL: undefined,
      }),
    ).toThrow(/DATABASE_URL/);
  });

  it('requires CORS allowlist in production', () => {
    expect(() =>
      parseEnv({
        ...base,
        NODE_ENV: 'production',
        CORS_ALLOWED_ORIGINS: '',
      }),
    ).toThrow(/CORS_ALLOWED_ORIGINS/);
  });

  it('rejects OTP reveal in production', () => {
    expect(() =>
      parseEnv({
        ...base,
        NODE_ENV: 'production',
        AUTH_DEV_REVEAL_OTP: 'true',
      }),
    ).toThrow(/AUTH_DEV_REVEAL_OTP/);
  });

  it('treats staging like production for CORS and OTP reveal', () => {
    expect(() =>
      parseEnv({
        ...base,
        NODE_ENV: 'staging',
        CORS_ALLOWED_ORIGINS: '',
      }),
    ).toThrow(/CORS_ALLOWED_ORIGINS/);
    expect(() =>
      parseEnv({
        ...base,
        NODE_ENV: 'staging',
        CORS_ALLOWED_ORIGINS: 'https://staging.example',
        AUTH_DEV_REVEAL_OTP: 'true',
      }),
    ).toThrow(/AUTH_DEV_REVEAL_OTP/);
  });
});
