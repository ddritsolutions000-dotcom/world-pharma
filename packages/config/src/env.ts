import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  APP_VERSION: z.string().optional(),
  GIT_SHA: z.string().optional(),
  BUILD_TIME: z.string().optional(),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32),
  OTP_PEPPER: z.string().min(32),
  JWT_ISSUER: z.string().min(1).default('world-pharma'),
  AUTH_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  AUTH_REFRESH_TTL_SECONDS: z.coerce.number().int().positive().default(1_209_600),
  AUTH_OTP_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  AUTH_OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  AUTH_OTP_RESEND_SECONDS: z.coerce.number().int().nonnegative().default(60),
  AUTH_OTP_LENGTH: z.coerce.number().int().min(6).max(8).default(6),
  CORS_ALLOWED_ORIGINS: z.string().default(''),
  HTTP_JSON_LIMIT: z.string().default('100kb'),
  AUTH_DEV_REVEAL_OTP: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

export type AppEnv = z.infer<typeof envSchema>;

export function parseEnv(
  raw: Record<string, unknown> | NodeJS.ProcessEnv = process.env,
): AppEnv {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment: ${issues}`);
  }
  const env = result.data;
  const locked = env.NODE_ENV === 'production' || env.NODE_ENV === 'staging';
  if (locked && env.AUTH_DEV_REVEAL_OTP) {
    throw new Error('AUTH_DEV_REVEAL_OTP is forbidden when NODE_ENV is staging or production');
  }
  if (locked && !env.CORS_ALLOWED_ORIGINS.trim()) {
    throw new Error('CORS_ALLOWED_ORIGINS is required when NODE_ENV is staging or production');
  }
  return env;
}
