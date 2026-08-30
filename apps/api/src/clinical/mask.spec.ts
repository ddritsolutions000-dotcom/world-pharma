import { maskCredentialNumber } from './mask';

describe('maskCredentialNumber', () => {
  it('masks all but the last four characters', () => {
    expect(maskCredentialNumber('ABC123456')).toBe('•••••3456');
    expect(maskCredentialNumber('12')).toBe('****');
  });
});
