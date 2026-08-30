import { Injectable } from '@nestjs/common';
import {
  CatalogLifecycle,
  Prisma,
  ProductQuestionStatus,
  ProductReviewStatus,
} from '@prisma/client';
import { uuidv7 } from '@world-pharma/shared';
import { PrismaService, runWithTenant } from '../app/prisma.service';
import { Errors } from '../common/problem';
import type { Principal } from '../identity/current-principal';
import { isCompanyRole } from '../identity/authority';
import { SecurityEventsService } from '../identity/security-events.service';
import { resolveCountryByCode, assertUuid } from '../cms/cms-country';
import { PolicyResolver } from '../policy/resolver';
import { AbuseService } from '../security/abuse.service';
import { workerTenantContext } from '../tenancy/build-tenant-context';
import { PersonalizationService } from '../personalization/personalization.service';
import {
  assertQuestionTransition,
  assertReviewTransition,
} from './review-status';
import { assertRating, assertSafeUgcText } from './ugc-safety';

const DAILY_REVIEW_CAP = 20;

@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policies: PolicyResolver,
    private readonly securityEvents: SecurityEventsService,
    private readonly abuse: AbuseService,
    private readonly personalization: PersonalizationService,
  ) {}

  async listPublicReviews(catalogItemId: string, countryCode: string) {
    assertUuid(catalogItemId, 'catalog item id');
    const country = await resolveCountryByCode(this.prisma, countryCode);
    await this.assertPublishedItem(catalogItemId, country.id);
    return runWithTenant(workerTenantContext({ countryId: country.id }), async () => {
      const rows = await this.prisma.productReview.findMany({
        where: {
          catalogItemId,
          countryId: country.id,
          status: ProductReviewStatus.APPROVED,
        },
        include: {
          responses: { orderBy: { createdAt: 'asc' } },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      });
      return {
        data: rows.map((row) => this.presentReview(row, country.isoAlpha2, false)),
      };
    });
  }

  async listPublicQuestions(catalogItemId: string, countryCode: string) {
    assertUuid(catalogItemId, 'catalog item id');
    const country = await resolveCountryByCode(this.prisma, countryCode);
    await this.assertPublishedItem(catalogItemId, country.id);
    return runWithTenant(workerTenantContext({ countryId: country.id }), async () => {
      const rows = await this.prisma.productQuestion.findMany({
        where: {
          catalogItemId,
          countryId: country.id,
          status: ProductQuestionStatus.APPROVED,
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      });
      return {
        data: rows.map((row) => this.presentQuestion(row, country.isoAlpha2, false)),
      };
    });
  }

  async getOwnReview(principal: Principal, catalogItemId: string, countryCode: string) {
    assertUuid(catalogItemId, 'catalog item id');
    const country = await resolveCountryByCode(this.prisma, countryCode);
    return runWithTenant(
      workerTenantContext({ countryId: country.id, personId: principal.personId }),
      async () => {
        const row = await this.prisma.productReview.findUnique({
          where: {
            catalogItemId_authorPersonId_countryId: {
              catalogItemId,
              authorPersonId: principal.personId,
              countryId: country.id,
            },
          },
        });
        if (!row) {
          return { review: null };
        }
        return { review: this.presentReview(row, country.isoAlpha2, true) };
      },
    );
  }

  async submitReview(
    principal: Principal,
    catalogItemId: string,
    input: { country_code: string; rating: number; title?: string; body: string },
    idempotencyKey?: string,
  ) {
    await this.assertReviewsEnabled(input.country_code);
    assertUuid(catalogItemId, 'catalog item id');
    assertRating(input.rating);
    assertSafeUgcText('body', input.body);
    if (input.title?.trim()) {
      assertSafeUgcText('title', input.title, 200);
    }
    const country = await resolveCountryByCode(this.prisma, input.country_code);
    await this.assertPublishedItem(catalogItemId, country.id);
    const orderId = await this.assertVerifiedPurchase(
      principal.personId,
      catalogItemId,
      country.id,
      input.country_code,
    );
    await this.assertDailyReviewCap(principal.personId, country.id);

    try {
      return await runWithTenant(
        workerTenantContext({ countryId: country.id, personId: principal.personId }),
        async () => {
          const row = await this.prisma.productReview.create({
            data: {
              id: uuidv7(),
              countryId: country.id,
              catalogItemId,
              authorPersonId: principal.personId,
              orderId,
              rating: input.rating,
              title: input.title?.trim() ?? '',
              body: input.body.trim(),
              status: ProductReviewStatus.SUBMITTED,
            },
          });
          await this.securityEvents.emit({
            type: 'PRODUCT_REVIEW_SUBMITTED',
            outcome: 'success',
            personId: principal.personId,
            metadata: {
              review_id: row.id,
              catalog_item_id: catalogItemId,
              country_id: country.id,
            },
          });
          await this.personalization.recordHook({
            countryCode: country.isoAlpha2,
            personId: principal.personId,
            catalogItemId,
            eventKind: 'PRODUCT_REVIEWED',
            source: 'product_review',
            sourceKey: idempotencyKey?.trim() || row.id,
          });
          return this.presentReview(row, country.isoAlpha2, true);
        },
      );
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const existing = await runWithTenant(
          workerTenantContext({ countryId: country.id, personId: principal.personId }),
          () =>
            this.prisma.productReview.findUniqueOrThrow({
              where: {
                catalogItemId_authorPersonId_countryId: {
                  catalogItemId,
                  authorPersonId: principal.personId,
                  countryId: country.id,
                },
              },
            }),
        );
        return { ...this.presentReview(existing, country.isoAlpha2, true), duplicate: true };
      }
      throw err;
    }
  }

  async submitQuestion(
    principal: Principal,
    catalogItemId: string,
    input: { country_code: string; body: string },
    idempotencyKey?: string,
  ) {
    await this.assertReviewsEnabled(input.country_code);
    assertUuid(catalogItemId, 'catalog item id');
    assertSafeUgcText('body', input.body, 1000);
    const country = await resolveCountryByCode(this.prisma, input.country_code);
    await this.assertPublishedItem(catalogItemId, country.id);

    const row = await runWithTenant(
      workerTenantContext({ countryId: country.id, personId: principal.personId }),
      async () =>
        this.prisma.productQuestion.create({
          data: {
            id: uuidv7(),
            countryId: country.id,
            catalogItemId,
            authorPersonId: principal.personId,
            body: input.body.trim(),
            status: ProductQuestionStatus.SUBMITTED,
          },
        }),
    );
    await this.securityEvents.emit({
      type: 'PRODUCT_QUESTION_SUBMITTED',
      outcome: 'success',
      personId: principal.personId,
      metadata: {
        question_id: row.id,
        catalog_item_id: catalogItemId,
        country_id: country.id,
      },
    });
    await this.personalization.recordHook({
      countryCode: country.isoAlpha2,
      personId: principal.personId,
      catalogItemId,
      eventKind: 'PRODUCT_QUESTION_ASKED',
      source: 'product_question',
      sourceKey: idempotencyKey?.trim() || row.id,
    });
    return this.presentQuestion(row, country.isoAlpha2, true);
  }

  async listModerationReviews(principal: Principal, countryCode: string, status?: string) {
    this.assertModerator(principal);
    const country = await resolveCountryByCode(this.prisma, countryCode);
    const filterStatus = status?.trim().toUpperCase() as ProductReviewStatus | undefined;
    return runWithTenant(
      workerTenantContext({ countryId: country.id, personId: principal.personId }),
      async () => {
        const rows = await this.prisma.productReview.findMany({
          where: {
            countryId: country.id,
            ...(filterStatus ? { status: filterStatus } : {}),
          },
          orderBy: [{ createdAt: 'desc' }],
          take: 100,
        });
        return { data: rows.map((row) => this.presentReview(row, country.isoAlpha2, true)) };
      },
    );
  }

  async listModerationQuestions(principal: Principal, countryCode: string, status?: string) {
    this.assertModerator(principal);
    const country = await resolveCountryByCode(this.prisma, countryCode);
    const filterStatus = status?.trim().toUpperCase() as ProductQuestionStatus | undefined;
    return runWithTenant(
      workerTenantContext({ countryId: country.id, personId: principal.personId }),
      async () => {
        const rows = await this.prisma.productQuestion.findMany({
          where: {
            countryId: country.id,
            ...(filterStatus ? { status: filterStatus } : {}),
          },
          orderBy: [{ createdAt: 'desc' }],
          take: 100,
        });
        return { data: rows.map((row) => this.presentQuestion(row, country.isoAlpha2, true)) };
      },
    );
  }

  async moderateReview(
    principal: Principal,
    id: string,
    input: { country_code: string; status: string; version: number; response_body?: string },
  ) {
    this.assertModerator(principal);
    assertUuid(id, 'review id');
    const country = await resolveCountryByCode(this.prisma, input.country_code);
    const nextStatus = input.status.trim().toUpperCase() as ProductReviewStatus;
    if (input.response_body?.trim()) {
      assertSafeUgcText('response_body', input.response_body, 2000);
    }
    return runWithTenant(
      workerTenantContext({ countryId: country.id, personId: principal.personId }),
      async () => {
        const row = await this.prisma.productReview.findFirst({
          where: { id, countryId: country.id },
        });
        if (!row) {
          throw Errors.notFound('Review not found');
        }
        if (row.version !== input.version) {
          throw Errors.conflict('Review version conflict');
        }
        assertReviewTransition(row.status, nextStatus);
        const updated = await this.prisma.productReview.update({
          where: { id: row.id },
          data: {
            status: nextStatus,
            version: { increment: 1 },
          },
        });
        if (input.response_body?.trim() && nextStatus === ProductReviewStatus.APPROVED) {
          await this.prisma.productReviewResponse.create({
            data: {
              id: uuidv7(),
              reviewId: row.id,
              responderPersonId: principal.personId,
              body: input.response_body.trim(),
            },
          });
        }
        await this.securityEvents.emit({
          type: 'PRODUCT_REVIEW_MODERATED',
          outcome: 'success',
          personId: principal.personId,
          metadata: {
            review_id: updated.id,
            country_id: country.id,
            status: updated.status,
          },
        });
        return this.presentReview(updated, country.isoAlpha2, true);
      },
    );
  }

  async moderateQuestion(
    principal: Principal,
    id: string,
    input: { country_code: string; status: string; version: number; answer_body?: string },
  ) {
    this.assertModerator(principal);
    assertUuid(id, 'question id');
    const country = await resolveCountryByCode(this.prisma, input.country_code);
    const nextStatus = input.status.trim().toUpperCase() as ProductQuestionStatus;
    if (input.answer_body?.trim()) {
      assertSafeUgcText('answer_body', input.answer_body, 2000);
    }
    return runWithTenant(
      workerTenantContext({ countryId: country.id, personId: principal.personId }),
      async () => {
        const row = await this.prisma.productQuestion.findFirst({
          where: { id, countryId: country.id },
        });
        if (!row) {
          throw Errors.notFound('Question not found');
        }
        if (row.version !== input.version) {
          throw Errors.conflict('Question version conflict');
        }
        assertQuestionTransition(row.status, nextStatus);
        const updated = await this.prisma.productQuestion.update({
          where: { id: row.id },
          data: {
            status: nextStatus,
            answerBody:
              nextStatus === ProductQuestionStatus.APPROVED
                ? input.answer_body?.trim() ?? row.answerBody
                : row.answerBody,
            version: { increment: 1 },
          },
        });
        await this.securityEvents.emit({
          type: 'PRODUCT_QUESTION_MODERATED',
          outcome: 'success',
          personId: principal.personId,
          metadata: {
            question_id: updated.id,
            country_id: country.id,
            status: updated.status,
          },
        });
        return this.presentQuestion(updated, country.isoAlpha2, true);
      },
    );
  }

  private async assertReviewsEnabled(countryCode: string) {
    const policy = await this.policies.resolvePublished(countryCode);
    if (policy?.document.crm?.reviews?.enabled === false) {
      throw Errors.forbidden('Product reviews are not enabled for this country');
    }
  }

  private async assertPublishedItem(catalogItemId: string, countryId: string) {
    const item = await this.prisma.catalogItem.findFirst({
      where: {
        id: catalogItemId,
        status: CatalogLifecycle.PUBLISHED,
        countries: { some: { countryId } },
      },
    });
    if (!item) {
      throw Errors.notFound('Catalog item not found or unavailable');
    }
    return item;
  }

  private async assertVerifiedPurchase(
    personId: string,
    catalogItemId: string,
    countryId: string,
    countryCode: string,
  ) {
    const policy = await this.policies.resolvePublished(countryCode);
    const requirePurchase = policy?.document.crm?.reviews?.verified_purchase_required !== false;
    if (!requirePurchase) {
      const fallback = await this.prisma.order.findFirst({
        where: { customerPersonId: personId, countryId },
        orderBy: { createdAt: 'desc' },
      });
      if (!fallback) {
        throw Errors.forbidden('Verified purchase required to submit a review');
      }
      return fallback.id;
    }
    const variants = await this.prisma.catalogVariant.findMany({
      where: { itemId: catalogItemId },
      select: { id: true },
    });
    if (!variants.length) {
      throw Errors.notFound('Catalog item not found or unavailable');
    }
    const line = await this.prisma.orderItem.findFirst({
      where: {
        order: { customerPersonId: personId, countryId },
        variantId: { in: variants.map((v) => v.id) },
      },
      orderBy: { createdAt: 'desc' },
      select: { orderId: true },
    });
    if (!line) {
      await this.abuse.record('review_abuse', undefined, personId);
      throw Errors.forbidden('Verified purchase required to submit a review');
    }
    return line.orderId;
  }

  private async assertDailyReviewCap(personId: string, countryId: string) {
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    const count = await this.prisma.productReview.count({
      where: {
        authorPersonId: personId,
        countryId,
        createdAt: { gte: since },
      },
    });
    if (count >= DAILY_REVIEW_CAP) {
      await this.abuse.record('review_abuse', undefined, personId);
      throw Errors.problem(429, 'REVIEW_RATE_LIMIT', 'Rate limit', 'Daily review submission cap reached');
    }
  }

  private assertModerator(principal: Principal) {
    if (!principal.roles.some((role) => isCompanyRole(role))) {
      throw Errors.forbidden('Admin access required');
    }
  }

  private presentReview(
    row: {
      id: string;
      catalogItemId: string;
      authorPersonId: string;
      orderId: string;
      rating: number;
      title: string;
      body: string;
      status: ProductReviewStatus;
      version: number;
      createdAt: Date;
      updatedAt: Date;
      responses?: Array<{ id: string; body: string; createdAt: Date }>;
    },
    countryCode: string,
    includeAuthor: boolean,
  ) {
    return {
      id: row.id,
      catalog_item_id: row.catalogItemId,
      country_code: countryCode,
      rating: row.rating,
      title: row.title,
      body: row.body,
      status: row.status,
      version: row.version,
      published: row.status === ProductReviewStatus.APPROVED,
      not_published: row.status === ProductReviewStatus.REJECTED,
      pending_moderation: row.status === ProductReviewStatus.SUBMITTED,
      ...(includeAuthor ? { author_person_id: row.authorPersonId, order_id: row.orderId } : {}),
      responses: (row.responses ?? []).map((r) => ({
        id: r.id,
        body: r.body,
        created_at: r.createdAt.toISOString(),
      })),
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
    };
  }

  private presentQuestion(
    row: {
      id: string;
      catalogItemId: string;
      authorPersonId: string;
      body: string;
      answerBody: string | null;
      status: ProductQuestionStatus;
      version: number;
      createdAt: Date;
      updatedAt: Date;
    },
    countryCode: string,
    includeAuthor: boolean,
  ) {
    return {
      id: row.id,
      catalog_item_id: row.catalogItemId,
      country_code: countryCode,
      body: row.body,
      answer_body: row.answerBody,
      status: row.status,
      version: row.version,
      published: row.status === ProductQuestionStatus.APPROVED,
      not_published: row.status === ProductQuestionStatus.REJECTED,
      pending_moderation: row.status === ProductQuestionStatus.SUBMITTED,
      ...(includeAuthor ? { author_person_id: row.authorPersonId } : {}),
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
    };
  }
}
