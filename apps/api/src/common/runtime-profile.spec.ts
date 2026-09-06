import { buildRuntimeProfile } from './runtime-profile';

describe('buildRuntimeProfile', () => {
  const prior = { ...process.env };

  afterEach(() => {
    process.env = { ...prior };
  });

  it('marks payments as sandbox when live is disabled', () => {
    delete process.env['PAYMENT_LIVE_ENABLED'];
    process.env['PAYMENT_ENVIRONMENT'] = 'sandbox';
    const profile = buildRuntimeProfile();
    const payments = profile.dependencies.find((row) => row.name === 'payments');
    expect(payments?.mode).toBe('sandbox');
  });

  it('marks object storage as sandbox', () => {
    const profile = buildRuntimeProfile();
    const storage = profile.dependencies.find((row) => row.name === 'object_storage');
    expect(storage?.mode).toBe('sandbox');
  });
});
