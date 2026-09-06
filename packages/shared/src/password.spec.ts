import { hashPassword, verifyPassword } from './password';

describe('password', () => {
  it('hashes and verifies', async () => {
    const hash = await hashPassword('SandboxPartner!234');
    expect(hash.startsWith('scrypt$')).toBe(true);
    expect(await verifyPassword('SandboxPartner!234', hash)).toBe(true);
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });

  it('rejects missing or malformed hashes', async () => {
    expect(await verifyPassword('x', null)).toBe(false);
    expect(await verifyPassword('x', 'not-a-hash')).toBe(false);
  });
});
