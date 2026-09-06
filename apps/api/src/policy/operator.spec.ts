import { emptyPolicyDocument } from './empty-pack';
import {
  applyOperatorView,
  assertOperatorSafety,
  assertSafeGatewayRefs,
  assertSafeTaxProfileId,
  diffOperatorViews,
  extractOperatorView,
  requiresDualControl,
} from './operator';
import { ProblemException } from '../common/problem';

describe('policy operator safety', () => {
  const registered = (code: string) => code === 'MOCK_PRIMARY' || code === 'MOCK_FALLBACK';

  it('accepts registered sandbox gateway refs and id-only tax profile', () => {
    const document = emptyPolicyDocument();
    document.payments.enabled = true;
    document.payments.gateway_refs = ['MOCK_PRIMARY'];
    document.payments.methods = ['CARD'];
    document.tax_profile_id = 'tax-profile-xx-sandbox';
    expect(() => assertOperatorSafety(document, registered)).not.toThrow();
  });

  it('rejects unknown and invented PSP codes', () => {
    expect(() => assertSafeGatewayRefs(['STRIPE'], registered)).toThrow(ProblemException);
    try {
      assertSafeGatewayRefs(['RAZORPAY'], registered);
    } catch (err) {
      expect((err as ProblemException).code).toBe('UNKNOWN_GATEWAY_REF');
    }
  });

  it('rejects secret-like gateway refs and tax profile values', () => {
    expect(() => assertSafeGatewayRefs(['sk_live_not_a_real_key'], registered)).toThrow(ProblemException);
    expect(() => assertSafeTaxProfileId('password=hunter2')).toThrow(ProblemException);
  });

  it('requires dual control only when recording is enabled', () => {
    const off = emptyPolicyDocument();
    expect(requiresDualControl(off)).toBe(false);
    off.recording_allowed = true;
    expect(requiresDualControl(off)).toBe(true);
  });

  it('rejects secret-bearing keys on the raw document', () => {
    expect(() =>
      assertOperatorSafety(
        { ...emptyPolicyDocument(), api_key: 'sk_live_x' } as never,
        registered,
      ),
    ).toThrow(ProblemException);
  });

  it('diffs operator keys without dumping the full pack', () => {
    const before = emptyPolicyDocument();
    const after = applyOperatorView(before, {
      ...extractOperatorView(before),
      payments: {
        enabled: true,
        methods: ['CARD'],
        gateway_refs: ['MOCK_PRIMARY'],
        currencies: ['XXX'],
      },
    });
    const diff = diffOperatorViews(before, after);
    expect(diff.map((row) => row.path)).toEqual(
      expect.arrayContaining(['payments.enabled', 'payments.methods', 'payments.gateway_refs', 'payments.currencies']),
    );
    expect(diff.some((row) => row.path.startsWith('partner_types'))).toBe(false);
  });

  it('applies localization, catalog currency, timezone, and empty ledger refs without inventing legal values', () => {
    const before = emptyPolicyDocument();
    const after = applyOperatorView(before, {
      ...extractOperatorView(before),
      i18n: { default_locale: 'en-GB', locales: ['en-GB', 'en'] },
      currency: { default: 'GBP', allowed: ['GBP'] },
      timezone_default: 'Europe/London',
      ledger_legal_entity_id: null,
      ledger_accounting_currency: 'GBP',
    });
    expect(after.i18n.default_locale).toBe('en-GB');
    expect(after.currency).toEqual({ default: 'GBP', allowed: ['GBP'] });
    expect(after.timezone.default).toBe('Europe/London');
    expect(after.timezone.allowed).toEqual(expect.arrayContaining(['Europe/London', 'UTC']));
    expect(after.ledger).toEqual({ legal_entity_id: null, accounting_currency: 'GBP' });
    expect(() => assertOperatorSafety(after, registered)).not.toThrow();
    const diff = diffOperatorViews(before, after);
    expect(diff.map((row) => row.path)).toEqual(
      expect.arrayContaining([
        'i18n.default_locale',
        'currency.default',
        'timezone.default',
        'ledger.accounting_currency',
      ]),
    );
  });

  it('rejects secret-like legal entity ids', () => {
    expect(() =>
      assertOperatorSafety(
        {
          ...emptyPolicyDocument(),
          ledger: { legal_entity_id: 'sk_live_not_a_real_key', accounting_currency: null },
        },
        registered,
      ),
    ).toThrow(ProblemException);
  });
});
