import { redactText, redactValue } from './redact';

describe('redact', () => {
  it('redacts sensitive object keys and substrings', () => {
    expect(
      redactValue({
        password: 'secret',
        otp: '123456',
        refresh_token: 'abc',
        access_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
        mfa: 'JBSWY3DPEHPK3PXP',
        kyc: 'passport-scan',
        health_record: 'diagnosis notes',
        pan: '4111111111111111',
        cvv: '123',
        person_id: 'p1',
      }),
    ).toEqual({
      password: '[redacted]',
      otp: '[redacted]',
      refresh_token: '[redacted]',
      access_token: '[redacted]',
      mfa: '[redacted]',
      kyc: '[redacted]',
      health_record: '[redacted]',
      pan: '[redacted]',
      cvv: '[redacted]',
      person_id: 'p1',
    });
    const leaked = redactText(
      'otp=999111 password=hunter2 token=eyJhbGci mfa=JBSWY3DPEHPK3PXP cvv=123 pan=4111111111111111',
    );
    expect(leaked).not.toMatch(/999111/);
    expect(leaked).not.toMatch(/hunter2/);
    expect(leaked).not.toMatch(/eyJhbGci/);
    expect(leaked).not.toMatch(/JBSWY3DPEHPK3PXP/);
    expect(leaked).not.toMatch(/4111111111111111/);
    expect(leaked).not.toMatch(/cvv=123/);
  });
});
