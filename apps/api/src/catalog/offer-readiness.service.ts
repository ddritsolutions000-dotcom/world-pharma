import { Injectable } from '@nestjs/common';
import { OfferStatus, RegulatedClass } from '@prisma/client';
import { parseCatalogAttributes } from '@world-pharma/shared';
import { PrismaService } from '../app/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { evaluateProductQuality, type ProductQualityResult } from './product-quality';

@Injectable()
export class OfferReadinessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
  ) {}

  async evaluateOffer(offerId: string): Promise<ProductQualityResult & { offer_id: string; status: OfferStatus }> {
    const offer = await this.prisma.catalogOffer.findUnique({
      where: { id: offerId },
      include: {
        sellerOrg: true,
        country: true,
        prices: { where: { isCurrent: true } },
        variant: {
          include: {
            item: { include: { translations: true, brand: true, countries: true } },
          },
        },
      },
    });
    if (!offer) {
      return {
        offer_id: offerId,
        status: OfferStatus.DRAFT,
        catalog_ready: false,
        inventory_ready: false,
        publishable: false,
        blockers: ['PRODUCT_NAME_MISSING'],
      };
    }

    const countryRow = offer.variant.item.countries.find((row) => row.countryId === offer.countryId);
    const attrs = parseCatalogAttributes(countryRow?.attributes ?? {});
    const title = offer.variant.item.translations[0]?.title ?? null;
    const price = offer.prices[0];
    const stockQty = await this.inventory.availableUnits(offer.variantId, offer.sellerOrgId, offer.countryId);
    const serviceabilityReady =
      (await this.prisma.serviceabilityZone.count({
        where: { countryId: offer.countryId, active: true, medicineDelivery: true },
      })) > 0;

    const rxClassified = countryRow
      ? countryRow.regulatedClass !== RegulatedClass.UNCLASSIFIED || countryRow.rxRequired
      : false;

    const quality = evaluateProductQuality({
      kind: offer.variant.item.kind,
      title,
      manufacturer: attrs.manufacturer_name ?? offer.variant.item.brand?.name ?? null,
      composition: attrs.composition ?? null,
      compositionNotApplicable: Boolean(attrs.composition_not_applicable),
      strength: offer.variant.strength,
      strengthNotApplicable: offer.variant.item.kind !== 'MEDICINE',
      dosageForm: attrs.dosage_form ?? offer.variant.uom,
      packSize: offer.variant.packSize,
      sku: offer.variant.skuCode,
      rxClassified,
      sellerOrgId: offer.sellerOrgId,
      sellMinor: price?.sellMinor ?? null,
      currency: offer.currency,
      expectedCurrency: offer.country.defaultCurrency,
      stockQty,
      sellerCountryId: offer.sellerOrg.countryId,
      offerCountryId: offer.countryId,
      serviceabilityReady,
    });

    return { ...quality, offer_id: offer.id, status: offer.status };
  }
}
