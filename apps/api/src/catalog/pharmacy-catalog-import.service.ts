import { Injectable } from '@nestjs/common';
import {
  OfferOwnership,
  OfferStatus,
  PharmacyCatalogImportRowStatus,
  PharmacyCatalogImportStatus,
  Prisma,
} from '@prisma/client';
import { uuidv7 } from '@world-pharma/shared';
import { PrismaService } from '../app/prisma.service';
import { Errors } from '../common/problem';
import type { Principal } from '../identity/current-principal';
import { PricingService } from './pricing.service';
import { toMinor } from './money';
import { validateImportRow } from './product-quality';
import { assertCanManageSeller } from './access';

export type CatalogImportRowDto = {
  source_row_key: string;
  product_id?: string | null;
  sku?: string | null;
  price_minor?: number | null;
  currency?: string | null;
  stock_qty?: number | null;
  country_code?: string | null;
  variant_id?: string | null;
};

@Injectable()
export class PharmacyCatalogImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
  ) {}

  async importBatch(
    principal: Principal,
    input: {
      sellerOrgId: string;
      countryCode: string;
      sourceId: string;
      sourceVersion: string;
      rows: CatalogImportRowDto[];
    },
  ) {
    await assertCanManageSeller(this.prisma, principal, input.sellerOrgId);
    const country = await this.prisma.country.findUnique({
      where: { isoAlpha2: input.countryCode.toUpperCase() },
    });
    if (!country) {
      throw Errors.notFound('Country is not available.');
    }
    const seller = await this.prisma.organization.findUnique({ where: { id: input.sellerOrgId } });
    if (!seller) {
      throw Errors.notFound('Seller organization not found.');
    }

    const existing = await this.prisma.pharmacyCatalogImportBatch.findUnique({
      where: {
        sellerOrgId_sourceId_sourceVersion: {
          sellerOrgId: input.sellerOrgId,
          sourceId: input.sourceId,
          sourceVersion: input.sourceVersion,
        },
      },
      include: { rows: true },
    });
    if (existing) {
      return this.present(existing);
    }

    const batchId = uuidv7();
    return this.prisma.$transaction(async (tx) => {
      const batch = await tx.pharmacyCatalogImportBatch.create({
        data: {
          id: batchId,
          sellerOrgId: input.sellerOrgId,
          countryId: country.id,
          sourceId: input.sourceId,
          sourceVersion: input.sourceVersion,
          status: PharmacyCatalogImportStatus.VALIDATING,
          createdById: principal.personId,
        },
      });

      let accepted = 0;
      let rejected = 0;
      for (const row of input.rows) {
        const variant = row.variant_id
          ? await tx.catalogVariant.findUnique({ where: { id: row.variant_id } })
          : row.sku
            ? await tx.catalogVariant.findUnique({ where: { skuCode: row.sku } })
            : null;
        const productKnown = row.product_id
          ? Boolean(await tx.catalogItem.findUnique({ where: { id: row.product_id } }))
          : Boolean(variant);
        const reasons = validateImportRow({
          sourceRowKey: row.source_row_key,
          productId: row.product_id ?? variant?.itemId ?? null,
          sku: row.sku ?? variant?.skuCode ?? null,
          priceMinor: row.price_minor ?? null,
          currency: row.currency ?? null,
          stockQty: row.stock_qty ?? null,
          countryCode: (row.country_code ?? input.countryCode).toUpperCase(),
          expectedCurrency: country.defaultCurrency,
          expectedCountryCode: country.isoAlpha2,
          sellerKnown: true,
          variantKnown: Boolean(variant),
        });
        if (!productKnown && !reasons.includes('PRODUCT_MISSING')) {
          reasons.push('PRODUCT_MISSING');
        }

        if (reasons.length > 0) {
          rejected += 1;
          await tx.pharmacyCatalogImportRow.create({
            data: {
              id: uuidv7(),
              batchId: batch.id,
              sourceRowKey: row.source_row_key,
              productId: row.product_id ?? null,
              sku: row.sku ?? null,
              priceMinor: row.price_minor != null ? BigInt(row.price_minor) : null,
              currency: row.currency?.toUpperCase() ?? null,
              stockQty: row.stock_qty ?? null,
              countryCode: row.country_code?.toUpperCase() ?? null,
              payload: row as Prisma.InputJsonValue,
              status: PharmacyCatalogImportRowStatus.REJECTED,
              rejectReasons: reasons,
            },
          });
          continue;
        }

        const offer = await this.ensureDraftOffer(tx, {
          variantId: variant!.id,
          sellerOrgId: input.sellerOrgId,
          countryId: country.id,
          currency: country.defaultCurrency,
          priceMinor: row.price_minor!,
          actorId: principal.personId,
        });
        accepted += 1;
        await tx.pharmacyCatalogImportRow.create({
          data: {
            id: uuidv7(),
            batchId: batch.id,
            sourceRowKey: row.source_row_key,
            productId: variant!.itemId,
            sku: variant!.skuCode,
            priceMinor: BigInt(row.price_minor!),
            currency: country.defaultCurrency,
            stockQty: row.stock_qty ?? 0,
            countryCode: country.isoAlpha2,
            payload: row as Prisma.InputJsonValue,
            status: PharmacyCatalogImportRowStatus.ACCEPTED,
            rejectReasons: [],
            offerId: offer.id,
          },
        });
      }

      const status =
        rejected === 0
          ? PharmacyCatalogImportStatus.ACCEPTED
          : accepted === 0
            ? PharmacyCatalogImportStatus.REJECTED
            : PharmacyCatalogImportStatus.PARTIAL;

      const updated = await tx.pharmacyCatalogImportBatch.update({
        where: { id: batch.id },
        data: { status, acceptedCount: accepted, rejectedCount: rejected },
        include: { rows: true },
      });
      return this.present(updated);
    });
  }

  private async ensureDraftOffer(
    tx: Prisma.TransactionClient,
    input: {
      variantId: string;
      sellerOrgId: string;
      countryId: string;
      currency: string;
      priceMinor: number;
      actorId: string;
    },
  ) {
    const existing = await tx.catalogOffer.findUnique({
      where: {
        variantId_sellerOrgId_countryId: {
          variantId: input.variantId,
          sellerOrgId: input.sellerOrgId,
          countryId: input.countryId,
        },
      },
    });
    if (existing) {
      if (existing.status === OfferStatus.PUBLISHED) {
        return existing;
      }
      await this.pricing.createVersion(tx, {
        offerId: existing.id,
        currency: input.currency,
        costMinor: toMinor(input.priceMinor),
        listMinor: null,
        sellMinor: toMinor(input.priceMinor),
        validFrom: new Date(),
        validTo: null,
      });
      return existing;
    }
    const offerId = uuidv7();
    const created = await tx.catalogOffer.create({
      data: {
        id: offerId,
        variantId: input.variantId,
        sellerOrgId: input.sellerOrgId,
        countryId: input.countryId,
        ownership: OfferOwnership.VENDOR_OWNED,
        status: OfferStatus.DRAFT,
        currency: input.currency,
      },
    });
    await this.pricing.createVersion(tx, {
      offerId,
      currency: input.currency,
      costMinor: toMinor(input.priceMinor),
      listMinor: null,
      sellMinor: toMinor(input.priceMinor),
      validFrom: new Date(),
      validTo: null,
    });
    return created;
  }

  async getBatch(principal: Principal, batchId: string) {
    const batch = await this.prisma.pharmacyCatalogImportBatch.findUnique({
      where: { id: batchId },
      include: { rows: true },
    });
    if (!batch) {
      throw Errors.notFound('Import batch not found.');
    }
    await assertCanManageSeller(this.prisma, principal, batch.sellerOrgId);
    return this.present(batch);
  }

  async listDuplicates(countryId?: string) {
    const rows = await this.prisma.productDuplicateCandidate.findMany({
      where: countryId ? { countryId } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows.map((row) => ({
      id: row.id,
      country_id: row.countryId,
      item_id: row.itemId,
      match_item_id: row.matchItemId,
      match_keys: row.matchKeys,
      status: row.status,
      notes: row.notes,
    }));
  }

  async reviewDuplicate(
    principal: Principal,
    id: string,
    status: 'DISMISSED' | 'CONFIRMED_DISTINCT',
    notes?: string,
  ) {
    const row = await this.prisma.productDuplicateCandidate.findUnique({ where: { id } });
    if (!row) {
      throw Errors.notFound('Duplicate candidate not found.');
    }
    return this.prisma.productDuplicateCandidate.update({
      where: { id },
      data: {
        status,
        notes: notes ?? null,
        reviewedById: principal.personId,
        reviewedAt: new Date(),
      },
    });
  }

  private present(
    batch: Prisma.PharmacyCatalogImportBatchGetPayload<{ include: { rows: true } }>,
  ) {
    return {
      id: batch.id,
      seller_org_id: batch.sellerOrgId,
      country_id: batch.countryId,
      source_id: batch.sourceId,
      source_version: batch.sourceVersion,
      status: batch.status,
      imported_at: batch.importedAt.toISOString(),
      accepted_count: batch.acceptedCount,
      rejected_count: batch.rejectedCount,
      rows: batch.rows.map((row) => ({
        id: row.id,
        source_row_key: row.sourceRowKey,
        sku: row.sku,
        status: row.status,
        reject_reasons: row.rejectReasons,
        offer_id: row.offerId,
      })),
    };
  }
}
