import { buildIndiaPolicyDocument } from './india-policy';
import { buildUsPolicyDocument } from './us-policy';
import { buildUaePolicyDocument } from './uae-policy';
import { validatePolicyDocument } from '../policy/validator';

describe('global market demo policies', () => {
  it('validates India policy pack', () => {
    const result = validatePolicyDocument(buildIndiaPolicyDocument());
    expect(result.ok).toBe(true);
  });

  it('validates United States policy pack', () => {
    const result = validatePolicyDocument(buildUsPolicyDocument());
    expect(result.ok).toBe(true);
  });

  it('validates UAE policy pack', () => {
    const result = validatePolicyDocument(buildUaePolicyDocument());
    expect(result.ok).toBe(true);
  });
});
