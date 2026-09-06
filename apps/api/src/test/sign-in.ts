import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { PrismaService } from '../app/prisma.service';

export type TestAudience = 'customer' | 'admin' | 'doctor' | 'partner_applicant';

export type TestSignInResult = { token: string; personId: string };

/** Register a person via OTP and return a customer session. */
export async function signInCustomer(app: INestApplication, email: string): Promise<TestSignInResult> {
  const requested = await request(app.getHttpServer())
    .post('/api/v1/auth/otp/request')
    .send({ identifier: email, purpose: 'REGISTER' });
  if (requested.status !== 200) {
    throw new Error(`OTP request failed (${requested.status}): ${JSON.stringify(requested.body)}`);
  }
  const verified = await request(app.getHttpServer())
    .post('/api/v1/auth/otp/verify')
    .send({
      challenge_id: requested.body.challenge_id,
      code: requested.body.dev_code,
      audience: 'customer',
    });
  if (verified.status !== 200) {
    throw new Error(`Customer OTP verify failed (${verified.status}): ${JSON.stringify(verified.body)}`);
  }
  const personId = verified.body.person_id as string | undefined;
  const token = verified.body.access_token as string | undefined;
  if (!personId || !token) {
    throw new Error('Customer OTP verify did not return person_id/access_token');
  }
  return { token, personId };
}

/**
 * Sign in with a company/admin audience. Person must already hold a company role
 * (super_admin, org_owner, etc.) or verify will correctly return 403.
 */
export async function signInAdmin(app: INestApplication, email: string, personId: string): Promise<TestSignInResult> {
  const requested = await request(app.getHttpServer())
    .post('/api/v1/auth/otp/request')
    .send({ identifier: email, purpose: 'LOGIN' });
  if (requested.status !== 200) {
    throw new Error(`OTP request failed (${requested.status}): ${JSON.stringify(requested.body)}`);
  }
  const verified = await request(app.getHttpServer())
    .post('/api/v1/auth/otp/verify')
    .send({
      challenge_id: requested.body.challenge_id,
      code: requested.body.dev_code,
      audience: 'admin',
    });
  if (verified.status !== 200) {
    throw new Error(`Admin OTP verify failed (${verified.status}): ${JSON.stringify(verified.body)}`);
  }
  const token = verified.body.access_token as string | undefined;
  if (!token) {
    throw new Error('Admin OTP verify did not return access_token');
  }
  return { token, personId };
}

/** Convenience: register customer, then sign in with the requested audience. */
export async function signIn(
  app: INestApplication,
  email: string,
  audience: TestAudience = 'customer',
): Promise<TestSignInResult> {
  const customer = await signInCustomer(app, email);
  if (audience === 'customer') {
    return customer;
  }
  if (audience === 'admin') {
    return signInAdmin(app, email, customer.personId);
  }
  const requested = await request(app.getHttpServer())
    .post('/api/v1/auth/otp/request')
    .send({ identifier: email, purpose: 'LOGIN' });
  const verified = await request(app.getHttpServer())
    .post('/api/v1/auth/otp/verify')
    .send({
      challenge_id: requested.body.challenge_id,
      code: requested.body.dev_code,
      audience,
    });
  if (verified.status !== 200) {
    throw new Error(`${audience} OTP verify failed (${verified.status}): ${JSON.stringify(verified.body)}`);
  }
  return {
    token: verified.body.access_token as string,
    personId: (verified.body.person_id as string | undefined) ?? customer.personId,
  };
}

export async function provisionSuperAdmin(
  app: INestApplication,
  prisma: PrismaService,
  emailPrefix: string,
): Promise<TestSignInResult> {
  const email = `${emailPrefix}-${Date.now()}@example.com`;
  const customer = await signInCustomer(app, email);
  const role = await prisma.role.findUnique({ where: { code: 'super_admin' } });
  if (!role) {
    throw new Error('super_admin role missing — run migrations/seeds');
  }
  const { uuidv7 } = await import('@world-pharma/shared');
  await prisma.membership.create({
    data: {
      id: uuidv7(),
      personId: customer.personId,
      roleId: role.id,
      scope: 'platform',
      status: 'ACTIVE',
    },
  });
  return signInAdmin(app, email, customer.personId);
}

/** Register by email, attach platform super_admin, return admin session. */
export async function bootstrapSuperAdminByEmail(
  app: INestApplication,
  prisma: PrismaService,
  email: string,
): Promise<TestSignInResult> {
  const customer = await signInCustomer(app, email);
  const role = await prisma.role.findUnique({ where: { code: 'super_admin' } });
  if (!role) {
    throw new Error('super_admin role missing — run migrations/seeds');
  }
  const { uuidv7 } = await import('@world-pharma/shared');
  await prisma.membership.create({
    data: {
      id: uuidv7(),
      personId: customer.personId,
      roleId: role.id,
      scope: 'platform',
      status: 'ACTIVE',
    },
  });
  return signInAdmin(app, email, customer.personId);
}

/** Register person, attach org role, return customer session for vendor API routes. */
export async function provisionOrgAdmin(
  app: INestApplication,
  prisma: PrismaService,
  emailPrefix: string,
  organizationId: string,
  roleCode = 'org_owner',
): Promise<TestSignInResult> {
  const email = `${emailPrefix}-${Date.now()}@example.com`;
  const customer = await signInCustomer(app, email);
  const role = await prisma.role.findUnique({ where: { code: roleCode } });
  if (!role) {
    throw new Error(`${roleCode} role missing — run migrations/seeds`);
  }
  const { uuidv7 } = await import('@world-pharma/shared');
  await prisma.membership.create({
    data: {
      id: uuidv7(),
      personId: customer.personId,
      roleId: role.id,
      scope: 'organization',
      organizationId,
      status: 'ACTIVE',
    },
  });
  return customer;
}
