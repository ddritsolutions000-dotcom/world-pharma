import { canRadiologistVerify } from './radiologist-sod';

describe('canRadiologistVerify', () => {
  it('blocks self-verify', () => {
    expect(canRadiologistVerify('person-1', 'person-1')).toBe(false);
  });

  it('allows different reviewer', () => {
    expect(canRadiologistVerify('person-1', 'person-2')).toBe(true);
  });
});
