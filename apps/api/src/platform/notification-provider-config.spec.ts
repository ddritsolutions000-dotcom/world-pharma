import {
  assertConfigStatus,
  assertNotificationChannel,
  deriveEffectiveStatus,
  isSafeSecretRef,
} from './notification-provider-config';

describe('notification-provider-config', () => {
  it('accepts supported channels', () => {
    expect(assertNotificationChannel('sms')).toBe('SMS');
    expect(assertNotificationChannel('IN_APP')).toBe('IN_APP');
  });

  it('rejects live without verification', () => {
    const status = deriveEffectiveStatus({
      active: true,
      configStatus: assertConfigStatus('SANDBOX'),
      secretRef: 'env:NOTIFICATION_SMS_CONSOLE',
      environment: 'production',
    });
    expect(status.live).toBe(false);
    expect(status.effective).toBe('misconfigured');
  });

  it('marks sandbox console as sandbox effective', () => {
    const status = deriveEffectiveStatus({
      active: true,
      configStatus: assertConfigStatus('SANDBOX'),
      secretRef: 'env:NOTIFICATION_SMS_CONSOLE',
      environment: 'sandbox',
    });
    expect(status.live).toBe(false);
    expect(status.effective).toBe('sandbox');
  });

  it('allows vault paths only', () => {
    expect(isSafeSecretRef('env:NOTIFICATION_SMS_CONSOLE')).toBe(true);
    expect(isSafeSecretRef('sk_live_abc')).toBe(false);
  });
});
