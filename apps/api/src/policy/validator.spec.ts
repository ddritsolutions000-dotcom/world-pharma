import { emptyPolicyDocument } from './empty-pack';
import { assertSafeDefaults, validatePolicyDocument } from './validator';

describe('policy document validation', () => {
  it('accepts the empty pack', () => {
    const document = emptyPolicyDocument();
    const result = validatePolicyDocument(document);
    expect(result.ok).toBe(true);
    expect(assertSafeDefaults(document)).toEqual([]);
  });

  it('rejects join_public when the partner type is disabled', () => {
    const document = emptyPolicyDocument();
    document.partner_types.DOCTOR.join_public = true;
    const result = validatePolicyDocument(document);
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toMatch(/join_public/);
  });

  it('rejects payments enabled without gateway refs', () => {
    const document = emptyPolicyDocument();
    document.payments.enabled = true;
    const result = validatePolicyDocument(document);
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toMatch(/gateway_refs/);
  });

  it('rejects invalid currency codes', () => {
    const document = emptyPolicyDocument();
    document.currency.default = 'rupee';
    const result = validatePolicyDocument(document);
    expect(result.ok).toBe(false);
  });
});
