import { ProblemException } from '../common/problem';
import {
  assertSafeVaultPath,
  assertSandboxProviderEnvironment,
  isSafeVaultPath,
  normalizeCountriesCsv,
  normalizeCurrenciesCsv,
  normalizeMethodsCsv,
  normalizePriority,
} from './provider-config';
import { MockPaymentGatewayAdapter } from './mock.adapter';
import { PaymentGatewayRegistry } from './gateway.registry';

describe('provider-config validation', () => {
  it('accepts env/vault paths and rejects live key material', () => {
    expect(isSafeVaultPath('env:PAYMENT_MOCK_WEBHOOK_SECRET')).toBe(true);
    expect(isSafeVaultPath('vault:prod/payments/{psp}/api-key')).toBe(true);
    expect(isSafeVaultPath('sk_live_not_a_real_key')).toBe(false);
    expect(isSafeVaultPath('rk_live_x')).toBe(false);
    expect(() => assertSafeVaultPath('password=hunter2')).toThrow(ProblemException);
  });

  it('fail-closes production environment writes without claiming a PSP', () => {
    expect(() => assertSandboxProviderEnvironment('production', 'MOCK_PRIMARY')).toThrow(ProblemException);
    try {
      assertSandboxProviderEnvironment('production', 'MOCK_PRIMARY');
    } catch (err) {
      expect((err as ProblemException).code).toBe('HUMAN_GATES_NOT_PRODUCTION_READY');
    }
    assertSandboxProviderEnvironment('sandbox', 'MOCK_PRIMARY');
  });

  it('fail-closes incomplete country/currency/method csv', () => {
    expect(normalizeCountriesCsv('*')).toBe('*');
    expect(normalizeCountriesCsv('xx,zz')).toBe('XX,ZZ');
    expect(() => normalizeCountriesCsv('')).toThrow(ProblemException);
    expect(() => normalizeCountriesCsv('INDIA')).toThrow(ProblemException);
    expect(normalizeCurrenciesCsv('xxx')).toBe('XXX');
    expect(() => normalizeCurrenciesCsv('')).toThrow(ProblemException);
    expect(normalizeMethodsCsv('CARD,WALLET')).toBe('CARD,WALLET');
    expect(() => normalizeMethodsCsv('VISA')).toThrow(ProblemException);
    expect(normalizePriority(10)).toBe(10);
    expect(() => normalizePriority(0)).toThrow(ProblemException);
  });

  it('resolves catalog codes through the same adapter without provider if-branches', () => {
    const registry = new PaymentGatewayRegistry(new MockPaymentGatewayAdapter());
    const primary = registry.resolve('MOCK_PRIMARY', 'sandbox');
    const fallback = registry.resolve('MOCK_FALLBACK', 'sandbox');
    expect(primary).toBe(fallback);
    expect(primary.constructor.name).toBe('MockPaymentGatewayAdapter');
  });
});
