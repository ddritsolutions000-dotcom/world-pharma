import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
async function main() {
  const row = await p.accountIdentifier.findFirst({
    where: { valueNormalized: 'sandbox-pathologist@dev.local' },
  });
  console.log('pathologist ident', row);
  const s = await fetch('http://127.0.0.1:4000/api/v1/auth/otp/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: 'sandbox-pathologist@dev.local', purpose: 'LOGIN' }),
  });
  console.log('otp', s.status, await s.text());
}
main()
  .catch(console.error)
  .finally(() => p.$disconnect());
