import { readPaymentEnvironment, isLivePaymentEnabled } from '../payment/payment.config';

export type DependencyMode = 'healthy' | 'sandbox' | 'disabled' | 'unavailable' | 'degraded';

export type DependencyStatus = {
  name: string;
  mode: DependencyMode;
  detail: string;
};

/** Classify runtime dependency posture without exposing secrets. */
export function buildRuntimeProfile(): {
  environment: string;
  app_version: string;
  git_sha: string;
  dependencies: DependencyStatus[];
} {
  const nodeEnv = process.env['NODE_ENV'] ?? 'development';
  const paymentEnv = readPaymentEnvironment();
  const livePayments = isLivePaymentEnabled();

  const dependencies: DependencyStatus[] = [
    {
      name: 'postgres',
      mode: 'healthy',
      detail: 'Required — probed by /health/ready',
    },
    {
      name: 'redis',
      mode: 'healthy',
      detail: 'Required for rate limits, BullMQ, policy cache',
    },
    {
      name: 'payments',
      mode: livePayments && paymentEnv === 'production' ? 'healthy' : 'sandbox',
      detail: livePayments
        ? `PAYMENT_LIVE_ENABLED=true · PAYMENT_ENVIRONMENT=${paymentEnv}`
        : 'Sandbox/mock only — live PSP rails not enabled',
    },
    {
      name: 'carriers',
      mode: 'sandbox',
      detail: 'Mock carrier adapter — live carrier booking is an external dependency',
    },
    {
      name: 'notifications',
      mode: nodeEnv === 'production' ? 'degraded' : 'sandbox',
      detail:
        nodeEnv === 'production'
          ? 'Verify country notification provider matrix before production traffic'
          : 'Console/sandbox providers acceptable in development',
    },
    {
      name: 'object_storage',
      mode: 'sandbox',
      detail: 'Local private object store — production requires S3-compatible backend',
    },
    {
      name: 'otp',
      mode: process.env['AUTH_DEV_REVEAL_OTP'] === 'true' ? 'sandbox' : 'healthy',
      detail: process.env['AUTH_DEV_REVEAL_OTP'] === 'true'
        ? 'AUTH_DEV_REVEAL_OTP enabled — development only'
        : 'OTP pepper configured — production SMS/email provider is external',
    },
  ];

  return {
    environment: nodeEnv,
    app_version: process.env['APP_VERSION'] ?? '0.0.0',
    git_sha: process.env['GIT_SHA'] ?? 'unknown',
    dependencies,
  };
}
