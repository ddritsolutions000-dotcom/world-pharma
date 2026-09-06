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

  it('accepts optional tax_profile_id as an id only', () => {
    const document = emptyPolicyDocument();
    document.tax_profile_id = 'tax-profile-xx';
    expect(validatePolicyDocument(document).ok).toBe(true);
    document.tax_profile_id = 'not a secret with spaces!!!';
    expect(validatePolicyDocument(document).ok).toBe(false);
  });

  it('accepts optional ledger refs and rejects accounting currency outside allowed', () => {
    const document = emptyPolicyDocument();
    document.ledger = { legal_entity_id: null, accounting_currency: null };
    expect(validatePolicyDocument(document).ok).toBe(true);
    document.currency = { default: 'GBP', allowed: ['GBP'] };
    document.ledger = { legal_entity_id: 'le-gb-sandbox', accounting_currency: 'GBP' };
    expect(validatePolicyDocument(document).ok).toBe(true);
    document.ledger = { legal_entity_id: null, accounting_currency: 'EUR' };
    expect(validatePolicyDocument(document).ok).toBe(false);
  });
});
