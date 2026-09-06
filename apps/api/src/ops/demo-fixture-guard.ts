/**
 * Sprint 63 — Prevent demo/sandbox fixtures from seeding under production flags.
 */
export function shouldSkipDemoFixtureSeed(env: NodeJS.ProcessEnv = process.env): {
  skip: boolean;
  reason: string | null;
} {
  if (env.NODE_ENV !== 'development') {
    return { skip: true, reason: 'NODE_ENV is not development' };
  }
  if (env.DEV_SANDBOX_SEED === 'false') {
    return { skip: true, reason: 'DEV_SANDBOX_SEED=false' };
  }
  if (env.INFRASTRUCTURE_ENVIRONMENT === 'production') {
    return { skip: true, reason: 'INFRASTRUCTURE_ENVIRONMENT=production' };
  }
  if (env.PAYMENT_ENVIRONMENT === 'production') {
    return { skip: true, reason: 'PAYMENT_ENVIRONMENT=production' };
  }
  if (env.COMMUNICATION_ENVIRONMENT === 'production') {
    return { skip: true, reason: 'COMMUNICATION_ENVIRONMENT=production' };
  }
  if (env.LOGISTICS_ENVIRONMENT === 'production') {
    return { skip: true, reason: 'LOGISTICS_ENVIRONMENT=production' };
  }
  return { skip: false, reason: null };
}
