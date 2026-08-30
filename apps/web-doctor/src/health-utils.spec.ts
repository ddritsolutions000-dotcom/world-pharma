import { classifyDoctorHealthFailure } from './health-utils';

describe('classifyDoctorHealthFailure', () => {
  it('maps revoked consent', () => {
    expect(
      classifyDoctorHealthFailure({
        ok: false,
        status: 403,
        error: 'Consent has been revoked.',
        kind: 'forbidden',
      }),
    ).toBe('consent_revoked');
  });

  it('maps expired consent', () => {
    expect(
      classifyDoctorHealthFailure({
        ok: false,
        status: 403,
        error: 'Consent grant has expired.',
        kind: 'forbidden',
      }),
    ).toBe('consent_expired');
  });

  it('maps disabled health pack', () => {
    expect(
      classifyDoctorHealthFailure({
        ok: false,
        status: 403,
        error: 'Health timeline is not enabled for this country.',
        kind: 'forbidden',
      }),
    ).toBe('disabled');
  });
});
