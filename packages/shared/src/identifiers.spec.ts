import { normalizeEmail, normalizeIdentifier, normalizePhone } from './identifiers';

describe('identifiers', () => {
  it('normalizes email case and unicode', () => {
    expect(normalizeEmail('  Foo.Bar@Example.COM ')).toBe('foo.bar@example.com');
  });

  it('normalizes E.164 without assuming a country', () => {
    expect(normalizePhone('+14155552671')).toBe('+14155552671');
    expect(normalizePhone('4155552671')).toBeNull();
  });

  it('uses an explicit region only when provided by a pack', () => {
    expect(normalizePhone('4155552671', 'US')).toBe('+14155552671');
  });

  it('classifies email vs phone', () => {
    expect(normalizeIdentifier('user@example.com')).toEqual({
      type: 'EMAIL',
      value: 'user@example.com',
    });
    expect(normalizeIdentifier('+447911123456')).toEqual({
      type: 'PHONE',
      value: '+447911123456',
    });
  });
});
