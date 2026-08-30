import { INestApplication } from '@nestjs/common';
import {
  AffiliateReferralCodeStatus,
  OrganizationKind,
  OrganizationStatus,
} from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { uuidv7 } from '@world-pharma/shared';
import { AppModule } from '../app/app.module';
import { PrismaService } from '../app/prisma.service';
import { SessionService } from '../identity/session.service';
import { PolicyCache } from '../policy/cache';
import { ProblemFilter } from '../common/problem.filter';
import { emptyPolicyDocument } from '../policy/empty-pack';
import { applyTestIsolation } from '../test/isolate-runtime';

async function issueToken(
  app: INestApplication,
  prisma: PrismaService,
  personId: string,
  audience: 'admin' | 'customer',
  extra?: { organizationId?: string; countryId?: string },
) {
  const account = await prisma.account.findUniqueOrThrow({ where: { personId } });
  const membership = await prisma.membership.findFirst({
    where: { personId, status: 'ACTIVE', deletedAt: null },
    include: { role: true },
    orderBy: { createdAt: 'asc' },
  });
  const roles = membership ? [membership.role.code] : [];
  const issued = await app.get(SessionService).issue({
    personId,
    accountId: account.id,
    audience,
    membershipId: membership?.id,
    organizationId: extra?.organizationId ?? membership?.organizationId ?? undefined,
    countryId: extra?.countryId ?? membership?.countryId ?? undefined,
    roles,
  });
  return { token: issued.accessToken, personId };
}

async function grantRole(
  prisma: PrismaService,
  personId: string,
  roleCode: string,
  extra: { scope: 'platform' | 'country' | 'organization'; countryId?: string; organizationId?: string },
) {
  const role = await prisma.role.findUnique({ where: { code: roleCode } });
  await prisma.membership.create({
    data: {
      id: uuidv7(),
      personId,
      roleId: role!.id,
      scope: extra.scope,
      countryId: extra.countryId,
      organizationId: extra.organizationId,
      status: 'ACTIVE',
    },
  });
}

async function seedPerson(prisma: PrismaService, email: string, countryId: string) {
  const personId = uuidv7();
  await prisma.person.create({
    data: {
      id: personId,
      status: 'ACTIVE',
      primaryCountryId: countryId,
      account: { create: { id: uuidv7(), status: 'ACTIVE' } },
      identifiers: {
        create: {
          id: uuidv7(),
          type: 'EMAIL',
          valueNormalized: email.toLowerCase(),
          verifiedAt: new Date(),
        },
      },
    },
  });
  return personId;
}

describe('R12-D affiliate referral infrastructure', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    applyTestIsolation();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new ProblemFilter());
    app.setGlobalPrefix('api/v1');
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates referral codes, links, records clicks, and preserves clinical boundary', async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const country = await prisma.country.findUniqueOrThrow({ where: { isoAlpha2: 'XX' } });
    const doc = emptyPolicyDocument();
    doc.services.pharmacy = true;
    await prisma.policyPack.updateMany({
      where: { countryId: country.id, status: 'PUBLISHED' },
      data: { document: doc as never },
    });
    await app.get(PolicyCache).invalidate('XX');

    const affOrg = await prisma.organization.create({
      data: {
        id: uuidv7(),
        countryId: country.id,
        kind: OrganizationKind.AFFILIATE_ORG,
        legalName: `Affiliate ${suffix}`,
        displayName: `Affiliate ${suffix}`,
        status: OrganizationStatus.ACTIVE,
      },
    });
    const otherAffOrg = await prisma.organization.create({
      data: {
        id: uuidv7(),
        countryId: country.id,
        kind: OrganizationKind.AFFILIATE_ORG,
        legalName: `Other Affiliate ${suffix}`,
        displayName: `Other Affiliate ${suffix}`,
        status: OrganizationStatus.ACTIVE,
      },
    });

    const adminPersonId = await seedPerson(prisma, `r12d-admin-${suffix}@example.com`, country.id);
    const affiliatePersonId = await seedPerson(prisma, `r12d-aff-${suffix}@example.com`, country.id);
    const otherAffiliatePersonId = await seedPerson(prisma, `r12d-aff2-${suffix}@example.com`, country.id);
    await grantRole(prisma, adminPersonId, 'super_admin', { scope: 'platform' });
    await grantRole(prisma, affiliatePersonId, 'org_owner', {
      scope: 'organization',
      organizationId: affOrg.id,
    });
    await grantRole(prisma, otherAffiliatePersonId, 'org_owner', {
      scope: 'organization',
      organizationId: otherAffOrg.id,
    });
    const adminUser = await issueToken(app, prisma, adminPersonId, 'admin');
    const affiliateUserSession = await issueToken(app, prisma, affiliatePersonId, 'customer', {
      organizationId: affOrg.id,
      countryId: country.id,
    });
    const otherAffiliateSession = await issueToken(app, prisma, otherAffiliatePersonId, 'customer', {
      organizationId: otherAffOrg.id,
      countryId: country.id,
    });

    const adminPartners = await request(app.getHttpServer())
      .get('/api/v1/admin/affiliate/partners?country_code=XX')
      .set('Authorization', `Bearer ${adminUser.token}`);
    expect(adminPartners.status).toBe(200);
    expect((adminPartners.body.data as Array<{ id: string }>).some((row) => row.id === affOrg.id)).toBe(true);

    const adminCode = await request(app.getHttpServer())
      .post('/api/v1/admin/affiliate/referral-codes')
      .set('Authorization', `Bearer ${adminUser.token}`)
      .set('Idempotency-Key', `admin-code-${suffix}`)
      .send({
        country_code: 'XX',
        organization_id: affOrg.id,
        code: `ADM-${suffix}`,
      });
    expect(adminCode.status).toBe(201);
    expect(adminCode.body.code).toBe(`ADM-${suffix}`.toUpperCase().replace(/[^A-Z0-9_-]/g, ''));

    const selfCode = await request(app.getHttpServer())
      .post('/api/v1/me/affiliate/codes')
      .set('Authorization', `Bearer ${affiliateUserSession.token}`)
      .set('Idempotency-Key', `self-code-${suffix}`)
      .send({ country_code: 'XX', code: `SELF-${suffix}` });
    expect(selfCode.status).toBe(201);
    expect(selfCode.body.status).toBe('ACTIVE');

    const duplicate = await request(app.getHttpServer())
      .post('/api/v1/me/affiliate/codes')
      .set('Authorization', `Bearer ${affiliateUserSession.token}`)
      .send({ country_code: 'XX', code: `SELF-${suffix}` });
    expect(duplicate.status).toBe(409);

    const link = await request(app.getHttpServer())
      .post('/api/v1/me/affiliate/links')
      .set('Authorization', `Bearer ${affiliateUserSession.token}`)
      .set('Idempotency-Key', `link-${suffix}`)
      .send({
        country_code: 'XX',
        referral_code_id: selfCode.body.id,
        label: 'Homepage',
        landing_path: '/',
      });
    expect(link.status).toBe(201);
    expect(link.body.referral_code).toBe(`SELF-${suffix}`.toUpperCase().replace(/[^A-Z0-9_-]/g, ''));

    const clickId = `click-${suffix}`;
    const click = await request(app.getHttpServer())
      .post('/api/v1/public/affiliate/click')
      .send({
        click_id: clickId,
        country_code: 'XX',
        link_id: link.body.id,
      });
    expect(click.status).toBe(201);
    expect(click.body.recorded).toBe(true);

    const clickDup = await request(app.getHttpServer())
      .post('/api/v1/public/affiliate/click')
      .send({
        click_id: clickId,
        country_code: 'XX',
        link_id: link.body.id,
      });
    expect(clickDup.status).toBe(201);
    expect(clickDup.body.duplicate).toBe(true);

    const stats = await request(app.getHttpServer())
      .get('/api/v1/me/affiliate/stats?country_code=XX')
      .set('Authorization', `Bearer ${affiliateUserSession.token}`);
    expect(stats.status).toBe(200);
    expect(stats.body.clicks_total).toBeGreaterThanOrEqual(1);
    expect(stats.body.clinical_blocked_default).toBe(true);
    expect(stats.body.payout_enabled).toBe(false);

    const inactive = await prisma.affiliateReferralCode.update({
      where: { id: selfCode.body.id },
      data: { status: AffiliateReferralCodeStatus.INACTIVE },
    });
    const badClick = await request(app.getHttpServer())
      .post('/api/v1/public/affiliate/click')
      .send({
        click_id: `click-bad-${suffix}`,
        country_code: 'XX',
        referral_code: inactive.code,
      });
    expect(badClick.status).toBe(410);

    await prisma.affiliateReferralCode.update({
      where: { id: selfCode.body.id },
      data: { status: AffiliateReferralCodeStatus.ACTIVE },
    });

    const cross = await request(app.getHttpServer())
      .get(`/api/v1/me/affiliate/links?country_code=XX`)
      .set('Authorization', `Bearer ${otherAffiliateSession.token}`);
    expect(cross.status).toBe(200);
    expect((cross.body.data as Array<{ id: string }>).some((row) => row.id === link.body.id)).toBe(false);

    const forbidden = await request(app.getHttpServer())
      .get('/api/v1/admin/affiliate/partners?country_code=XX')
      .set('Authorization', `Bearer ${affiliateUserSession.token}`);
    expect(forbidden.status).toBe(403);

    const earnings = await request(app.getHttpServer())
      .get('/api/v1/me/affiliate/earnings')
      .set('Authorization', `Bearer ${affiliateUserSession.token}`);
    expect(earnings.status).toBe(200);
    expect(earnings.body.live_payout).toBe(false);
  });
});
