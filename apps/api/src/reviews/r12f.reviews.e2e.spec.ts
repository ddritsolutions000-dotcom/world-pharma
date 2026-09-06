import { INestApplication } from '@nestjs/common';
import {
  CatalogLifecycle,
  OfferStatus,
  OrderStatus,
  OrganizationKind,
  OrganizationStatus,
  PaymentIntentStatus,
  ProductReviewStatus,
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
  audience: 'customer' | 'admin',
  roles: string[] = [],
) {
  const account = await prisma.account.findUniqueOrThrow({ where: { personId } });
  const issued = await app.get(SessionService).issue({
    personId,
    accountId: account.id,
    audience,
    roles,
  });
  return { token: issued.accessToken, personId };
}

async function grantRole(prisma: PrismaService, personId: string, roleCode: string) {
  const role = await prisma.role.findUniqueOrThrow({ where: { code: roleCode } });
  await prisma.membership.create({
    data: {
      id: uuidv7(),
      personId,
      roleId: role.id,
      scope: 'platform',
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

describe('R12-F reviews, Q&A, personalization', () => {
  jest.setTimeout(120_000);
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

  it('review + Q&A lifecycle, moderation, personalization, isolation', async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const country = await prisma.country.findUniqueOrThrow({ where: { isoAlpha2: 'XX' } });
    const doc = emptyPolicyDocument();
    doc.services.pharmacy = true;
    doc.crm = {
      ...doc.crm,
      reviews: { enabled: true, verified_purchase_required: true },
    };
    await prisma.policyPack.updateMany({
      where: { countryId: country.id, status: 'PUBLISHED' },
      data: { document: doc as never },
    });
    await app.get(PolicyCache).invalidate('XX');

    const vendor = await prisma.organization.create({
      data: {
        id: uuidv7(),
        countryId: country.id,
        kind: OrganizationKind.VENDOR,
        legalName: `Review Vendor ${suffix}`,
        displayName: `Review Vendor ${suffix}`,
        status: OrganizationStatus.ACTIVE,
      },
    });
    const brand = await prisma.catalogBrand.create({
      data: { id: uuidv7(), slug: `rv-brand-${suffix}`, name: 'Review Brand' },
    });
    const item = await prisma.catalogItem.create({
      data: {
        id: uuidv7(),
        slug: `rv-item-${suffix}`,
        kind: 'OTC',
        brandId: brand.id,
        createdByOrgId: vendor.id,
        status: CatalogLifecycle.PUBLISHED,
        translations: {
          create: { id: uuidv7(), locale: 'en', title: 'Review Zinc', description: 'Test item' },
        },
        countries: {
          create: { id: uuidv7(), countryId: country.id, available: true, rxRequired: false },
        },
      },
    });
    const variant = await prisma.catalogVariant.create({
      data: {
        id: uuidv7(),
        itemId: item.id,
        skuCode: `RV-SKU-${suffix}`,
        packSize: '10',
      },
    });
    const offer = await prisma.catalogOffer.create({
      data: {
        id: uuidv7(),
        variantId: variant.id,
        sellerOrgId: vendor.id,
        countryId: country.id,
        ownership: 'VENDOR_OWNED',
        status: OfferStatus.PUBLISHED,
        currency: 'XXX',
        publishedAt: new Date(),
      },
    });

    const customerA = await seedPerson(prisma, `rv-a-${suffix}@example.com`, country.id);
    const customerB = await seedPerson(prisma, `rv-b-${suffix}@example.com`, country.id);
    const moderator = await seedPerson(prisma, `rv-mod-${suffix}@example.com`, country.id);
    await grantRole(prisma, moderator, 'company_operations');

    const userA = await issueToken(app, prisma, customerA, 'customer');
    const userB = await issueToken(app, prisma, customerB, 'customer');
    const admin = await issueToken(app, prisma, moderator, 'admin', ['company_operations']);

    const location = await prisma.location.create({
      data: {
        id: uuidv7(),
        organizationId: vendor.id,
        countryId: country.id,
        kind: 'VENDOR_WAREHOUSE',
        name: 'Review WH',
        timezone: 'UTC',
      },
    });
    const cart = await prisma.cart.create({
      data: {
        id: uuidv7(),
        customerPersonId: customerA,
        countryId: country.id,
        sellerOrgId: vendor.id,
      },
    });
    const checkout = await prisma.checkoutSession.create({
      data: {
        id: uuidv7(),
        customerPersonId: customerA,
        countryId: country.id,
        cartId: cart.id,
        sellerOrgId: vendor.id,
        status: 'READY_FOR_PAYMENT',
        idempotencyKey: `rv-co-${suffix}`,
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    const quote = await prisma.checkoutQuote.create({
      data: {
        id: uuidv7(),
        sessionId: checkout.id,
        fingerprint: 'rv',
        currency: 'XXX',
        sellMinor: 100n,
        totalMinor: 100n,
        payload: {},
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    const paymentIntent = await prisma.paymentIntent.create({
      data: {
        id: uuidv7(),
        checkoutSessionId: checkout.id,
        checkoutQuoteId: quote.id,
        customerPersonId: customerA,
        countryId: country.id,
        method: 'CARD',
        status: PaymentIntentStatus.CAPTURED,
        amountMinor: 100n,
        capturedMinor: 100n,
        currency: 'XXX',
        idempotencyKey: `rv-pay-${suffix}`,
      },
    });
    const orderId = uuidv7();
    await prisma.order.create({
      data: {
        id: orderId,
        orderNumber: `RV-${suffix}`,
        customerPersonId: customerA,
        sellerOrgId: vendor.id,
        countryId: country.id,
        checkoutSessionId: checkout.id,
        checkoutQuoteId: quote.id,
        paymentIntentId: paymentIntent.id,
        fulfillingLocationId: location.id,
        status: OrderStatus.CONFIRMED,
        currency: 'XXX',
        goodsMinor: 100n,
        totalMinor: 100n,
        items: {
          create: {
            id: uuidv7(),
            offerId: offer.id,
            variantId: variant.id,
            sku: variant.skuCode,
            title: 'Review Zinc',
            qty: 1,
            unitMinor: 100n,
            lineMinor: 100n,
            currency: 'XXX',
          },
        },
      },
    });

    const emptyReviews = await request(app.getHttpServer())
      .get(`/api/v1/catalog/items/${item.id}/reviews?country=XX`);
    expect(emptyReviews.status).toBe(200);
    expect(emptyReviews.body.data).toEqual([]);

    const noPurchase = await request(app.getHttpServer())
      .post(`/api/v1/catalog/items/${item.id}/reviews`)
      .set('Authorization', `Bearer ${userB.token}`)
      .send({ country_code: 'XX', rating: 5, body: 'Great product for daily use.' });
    expect(noPurchase.status).toBe(403);

    const tooEarly = await request(app.getHttpServer())
      .post(`/api/v1/catalog/items/${item.id}/reviews`)
      .set('Authorization', `Bearer ${userA.token}`)
      .send({ country_code: 'XX', rating: 5, body: 'Order not delivered yet.' });
    expect(tooEarly.status).toBe(403);

    await prisma.order.update({ where: { id: orderId }, data: { status: OrderStatus.DELIVERED } });

    const submit = await request(app.getHttpServer())
      .post(`/api/v1/catalog/items/${item.id}/reviews`)
      .set('Authorization', `Bearer ${userA.token}`)
      .set('Idempotency-Key', `rv-${suffix}`)
      .send({ country_code: 'XX', rating: 5, title: 'Works well', body: 'Great product for daily use.' });
    expect(submit.status).toBe(201);
    expect(submit.body.status).toBe('SUBMITTED');
    const reviewId = submit.body.id as string;

    const dup = await request(app.getHttpServer())
      .post(`/api/v1/catalog/items/${item.id}/reviews`)
      .set('Authorization', `Bearer ${userA.token}`)
      .send({ country_code: 'XX', rating: 4, body: 'Duplicate attempt.' });
    expect(dup.status).toBe(201);
    expect(dup.body.duplicate).toBe(true);

    const pendingPublic = await request(app.getHttpServer())
      .get(`/api/v1/catalog/items/${item.id}/reviews?country=XX`);
    expect(pendingPublic.body.data).toHaveLength(0);

    const approve = await request(app.getHttpServer())
      .patch(`/api/v1/admin/reviews/${reviewId}?country_code=XX`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ country_code: 'XX', status: 'APPROVED', version: 1, response_body: 'Thanks for your feedback.' });
    expect(approve.status).toBe(200);
    expect(approve.body.status).toBe('APPROVED');

    const published = await request(app.getHttpServer())
      .get(`/api/v1/catalog/items/${item.id}/reviews?country=XX`);
    expect(published.status).toBe(200);
    expect(published.body.data).toHaveLength(1);
    expect(published.body.data[0].rating).toBe(5);

    const rejectConflict = await request(app.getHttpServer())
      .patch(`/api/v1/admin/reviews/${reviewId}?country_code=XX`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ country_code: 'XX', status: 'REJECTED', version: 1 });
    expect(rejectConflict.status).toBe(409);

    const question = await request(app.getHttpServer())
      .post(`/api/v1/catalog/items/${item.id}/questions`)
      .set('Authorization', `Bearer ${userA.token}`)
      .send({ country_code: 'XX', body: 'Is this suitable for travel packing?' });
    expect(question.status).toBe(201);
    const questionId = question.body.id as string;

    const modQuestion = await request(app.getHttpServer())
      .patch(`/api/v1/admin/questions/${questionId}?country_code=XX`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        country_code: 'XX',
        status: 'APPROVED',
        version: 1,
        answer_body: 'Yes, the pack size is travel-friendly.',
      });
    expect(modQuestion.status).toBe(200);

    const publicQ = await request(app.getHttpServer())
      .get(`/api/v1/catalog/items/${item.id}/questions?country=XX`);
    expect(publicQ.body.data).toHaveLength(1);
    expect(publicQ.body.data[0].answer_body).toContain('travel');

    const clinical = await request(app.getHttpServer())
      .post('/api/v1/me/personalization/events')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({
        country_code: 'XX',
        event_kind: 'PRODUCT_VIEWED',
        source: 'pdp',
        source_key: `view-${suffix}`,
        catalog_item_id: item.id,
        metadata: { diagnosis: 'hidden' },
      });
    expect(clinical.status).toBe(400);

    const event = await request(app.getHttpServer())
      .post('/api/v1/me/personalization/events')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({
        country_code: 'XX',
        event_kind: 'PRODUCT_VIEWED',
        source: 'pdp',
        source_key: `view-${suffix}`,
        catalog_item_id: item.id,
      });
    expect(event.status).toBe(201);

    const eventDup = await request(app.getHttpServer())
      .post('/api/v1/me/personalization/events')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({
        country_code: 'XX',
        event_kind: 'PRODUCT_VIEWED',
        source: 'pdp',
        source_key: `view-${suffix}`,
        catalog_item_id: item.id,
      });
    expect(eventDup.status).toBe(201);
    expect(eventDup.body.id).toBe(event.body.id);

    const doctorRating = await request(app.getHttpServer())
      .post('/api/v1/catalog/doctors/fake-id/reviews')
      .send({ rating: 5 });
    expect([404, 405]).toContain(doctorRating.status);

    const unauth = await request(app.getHttpServer())
      .post(`/api/v1/catalog/items/${item.id}/reviews`)
      .send({ country_code: 'XX', rating: 5, body: 'Should fail auth.' });
    expect(unauth.status).toBe(401);

    await prisma.productReview.update({
      where: { id: reviewId },
      data: { status: ProductReviewStatus.SUBMITTED, version: 2 },
    });
    const secondReject = await request(app.getHttpServer())
      .patch(`/api/v1/admin/reviews/${reviewId}?country_code=XX`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ country_code: 'XX', status: 'REJECTED', version: 2 });
    expect(secondReject.status).toBe(200);
    expect(secondReject.body.not_published).toBe(true);
  });
});
