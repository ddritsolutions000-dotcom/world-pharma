import { Injectable } from '@nestjs/common';
import { OfferStatus, Prisma } from '@prisma/client';
import { uuidv7 } from '@world-pharma/shared';
import { PrismaService, runWithTenant } from '../app/prisma.service';
import { Errors } from '../common/problem';
import type { Principal } from '../identity/current-principal';
import { SecurityEventsService } from '../identity/security-events.service';
import { resolveCountryByCode, assertUuid } from '../cms/cms-country';
import { workerTenantContext } from '../tenancy/build-tenant-context';
import { PersonalizationService } from '../personalization/personalization.service';

@Injectable()
export class WishlistService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly securityEvents: SecurityEventsService,
    private readonly personalization: PersonalizationService,
  ) {}

  async list(principal: Principal, countryCode: string) {
    const country = await resolveCountryByCode(this.prisma, countryCode);
    return runWithTenant(
      workerTenantContext({ countryId: country.id, personId: principal.personId }),
      async () => {
        const rows = await this.prisma.wishlistItem.findMany({
          where: { personId: principal.personId, countryId: country.id },
          include: {
            catalogOffer: {
              include: {
                variant: {
                  include: {
                    item: { include: { translations: { take: 1 } } },
                  },
                },
                prices: { where: { isCurrent: true }, take: 1 },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        });
        return {
          data: rows.map((row) => this.present(row, country.isoAlpha2)),
        };
      },
    );
  }

  async add(
    principal: Principal,
    input: { country_code: string; catalog_offer_id: string },
    _idempotencyKey?: string,
  ) {
    const country = await resolveCountryByCode(this.prisma, input.country_code);
    assertUuid(input.catalog_offer_id, 'catalog_offer_id');
    const offer = await this.prisma.catalogOffer.findFirst({
      where: {
        id: input.catalog_offer_id,
        countryId: country.id,
        status: OfferStatus.PUBLISHED,
      },
      include: { variant: { select: { itemId: true } } },
    });
    if (!offer) {
      throw Errors.notFound('Catalog offer not found or unavailable');
    }
    try {
      return await runWithTenant(
        workerTenantContext({ countryId: country.id, personId: principal.personId }),
        async () => {
          const row = await this.prisma.wishlistItem.create({
            data: {
              id: uuidv7(),
              personId: principal.personId,
              countryId: country.id,
              catalogOfferId: offer.id,
            },
            include: {
              catalogOffer: {
                include: {
                  variant: {
                    include: {
                      item: { include: { translations: { take: 1 } } },
                    },
                  },
                  prices: { where: { isCurrent: true }, take: 1 },
                },
              },
            },
          });
          await this.securityEvents.emit({
            type: 'WISHLIST_ITEM_ADDED',
            outcome: 'success',
            personId: principal.personId,
            metadata: {
              wishlist_item_id: row.id,
              catalog_offer_id: offer.id,
              country_id: country.id,
            },
          });
          await this.personalization.recordHook({
            countryCode: country.isoAlpha2,
            personId: principal.personId,
            catalogItemId: offer.variant.itemId,
            catalogOfferId: offer.id,
            eventKind: 'PRODUCT_ADDED_TO_WISHLIST',
            source: 'wishlist',
            sourceKey: _idempotencyKey?.trim() || row.id,
          });
          return { ...this.present(row, country.isoAlpha2), created: true, duplicate: false };
        },
      );
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const existing = await runWithTenant(
          workerTenantContext({ countryId: country.id, personId: principal.personId }),
          () =>
            this.prisma.wishlistItem.findUnique({
              where: {
                personId_countryId_catalogOfferId: {
                  personId: principal.personId,
                  countryId: country.id,
                  catalogOfferId: offer.id,
                },
              },
              include: {
                catalogOffer: {
                  include: {
                    variant: {
                    include: {
                      item: { include: { translations: { take: 1 } } },
                    },
                  },
                    prices: { where: { isCurrent: true }, take: 1 },
                  },
                },
              },
            }),
        );
        if (!existing) {
          throw err;
        }
        return { ...this.present(existing, country.isoAlpha2), created: false, duplicate: true };
      }
      throw err;
    }
  }

  async remove(principal: Principal, countryCode: string, catalogOfferId: string) {
    const country = await resolveCountryByCode(this.prisma, countryCode);
    assertUuid(catalogOfferId, 'catalog_offer_id');
    return runWithTenant(
      workerTenantContext({ countryId: country.id, personId: principal.personId }),
      async () => {
        const row = await this.prisma.wishlistItem.findUnique({
          where: {
            personId_countryId_catalogOfferId: {
              personId: principal.personId,
              countryId: country.id,
              catalogOfferId,
            },
          },
        });
        if (!row) {
          throw Errors.notFound('Wishlist item not found');
        }
        await this.prisma.wishlistItem.delete({ where: { id: row.id } });
        await this.securityEvents.emit({
          type: 'WISHLIST_ITEM_REMOVED',
          outcome: 'success',
          personId: principal.personId,
          metadata: {
            wishlist_item_id: row.id,
            catalog_offer_id: catalogOfferId,
            country_id: country.id,
          },
        });
        return { removed: true, catalog_offer_id: catalogOfferId };
      },
    );
  }

  async clear(principal: Principal, countryCode: string) {
    const country = await resolveCountryByCode(this.prisma, countryCode);
    return runWithTenant(
      workerTenantContext({ countryId: country.id, personId: principal.personId }),
      async () => {
        const result = await this.prisma.wishlistItem.deleteMany({
          where: { personId: principal.personId, countryId: country.id },
        });
        return { cleared: true, removed_count: result.count };
      },
    );
  }

  private present(
    row: {
      id: string;
      catalogOfferId: string;
      createdAt: Date;
      catalogOffer: {
        id: string;
        status: OfferStatus;
        currency: string;
        variant: { skuCode: string; item: { slug: string; translations: Array<{ title: string }> } };
        prices: Array<{ sellMinor: bigint }>;
      };
    },
    countryCode: string,
  ) {
    const price = row.catalogOffer.prices[0];
    const available = row.catalogOffer.status === OfferStatus.PUBLISHED;
    return {
      id: row.id,
      catalog_offer_id: row.catalogOfferId,
      country_code: countryCode,
      product_slug: row.catalogOffer.variant.item.slug,
      product_title: row.catalogOffer.variant.item.translations[0]?.title ?? row.catalogOffer.variant.item.slug,
      sku_code: row.catalogOffer.variant.skuCode,
      currency: row.catalogOffer.currency,
      sell_minor: price ? price.sellMinor.toString() : null,
      available,
      created_at: row.createdAt.toISOString(),
    };
  }
}
