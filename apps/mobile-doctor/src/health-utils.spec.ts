import { classifyDoctorHealthFailure } from './health-utils';

describe('doctor health utils', () => {
  it('classifies consent revoked', () => {
    expect(
      classifyDoctorHealthFailure({
        ok: false,
        status: 403,
        error: 'Consent has been revoked.',
        kind: 'forbidden',
      }),
    ).toBe('consent_revoked');
  });
});
