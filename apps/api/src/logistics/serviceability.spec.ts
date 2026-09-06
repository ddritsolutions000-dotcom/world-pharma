import { resolveServiceability } from './serviceability';

describe('resolveServiceability', () => {
  it('returns unavailable when postal code is empty', () => {
    const result = resolveServiceability('IN', '');
    expect(result.serviceable).toBe(false);
    expect(result.message).toMatch(/postal code/i);
  });

  it('resolves known India pincodes to city', () => {
    const result = resolveServiceability('IN', '122001');
    expect(result.serviceable).toBe(true);
    expect(result.city).toBe('Gurgaon');
    expect(result.medicine_eta).toBe('same_day');
  });

  it('resolves additional metro pincodes', () => {
    expect(resolveServiceability('IN', '400001').city).toBe('Mumbai');
    expect(resolveServiceability('IN', '380001').city).toBe('Ahmedabad');
  });

  it('accepts sandbox XX postal codes', () => {
    const result = resolveServiceability('XX', '10001');
    expect(result.serviceable).toBe(true);
    expect(result.city).toBe('Sandbox City');
  });
});
