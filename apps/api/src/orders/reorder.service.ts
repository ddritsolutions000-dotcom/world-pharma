import { Injectable } from '@nestjs/common';
import { CatalogLifecycle, OfferOwnership, OfferStatus, Prisma } from '@prisma/client';
import { uuidv7 } from '@world-pharma/shared';
import { PrismaService } from '../app/prisma.service';
import { MarketplaceEligibilityService } from '../catalog/marketplace-eligibility.service';
import { PricingService } from '../catalog/pricing.service';
import { minorJson } from '../catalog/money';
import { CartService } from '../cart/cart.service';
import { Errors } from '../common/problem';
import type { Principal } from '../identity/current-principal';
import { InventoryService } from '../inventory/inventory.service';
import { ServiceabilityZoneService } from '../logistics/serviceability-zone.service';
import { orderIdOrNumberWhere } from './order-lookup';
import { isReorderEligible } from './reorder-eligibility';

export type ReorderLineResult = {
  offer_id: string;
  title: string;
  qty: number;
  current_sell_minor?: string;
  rx_required?: boolean;
};

export type ReorderUnavailableLine = {
  offer_id: string;
  title: string;
  qty: number;
  reason_code: string;
  reason: string;
};

export type ReorderResult = {
  order_id: string;
  order_number: string;
  added: ReorderLineResult[];
  unavailable: ReorderUnavailableLine[];
  cart: Awaited<ReturnType<CartService['getCart']>>;
  sandbox: true;
  message: string;
};

type ProblemLike = { status?: number; code?: string; detail?: string; title?: string };

@Injectable()
export class ReorderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly carts: CartService,
    private readonly inventory: InventoryService,
    private readonly marketplace: MarketplaceEligibilityService,
    private readonly pricing: PricingService,
    private readonly serviceability: ServiceabilityZoneService,
  ) {}

  reorderFromOrder(
    principal: Principal,
    orderIdOrNumber: string,
    input: { country_code: string; postal_code?: string },
    idempotencyKey: string,
  ): Promise<ReorderResult> {
    return this.withIdempotency(
      principal.personId,
      idempotencyKey,
      'POST',
      `/me/orders/${orderIdOrNumber}/reorder`,
      () => this.executeReorder(principal, orderIdOrNumber, input, idempotencyKey),
    );
  }

  private async executeReorder(
    principal: Principal,
    orderIdOrNumber: string,
    input: { country_code: string; postal_code?: string },
    idempotencyKey: string,
  ): Promise<ReorderResult> {
    if (!input.country_code?.trim()) {
      throw Errors.validation('country_code is required.');
    }
    const country = await this.prisma.country.findUnique({
      where: { isoAlpha2: input.country_code.trim().toUpperCase() },
    });
    if (!country) {
      throw Errors.notFound('Country is not available.');
    }

    const order = await this.prisma.order.findFirst({
      where: orderIdOrNumberWhere(orderIdOrNumber),
      include: { items: true },
    });
    if (!order || order.customerPersonId !== principal.personId) {
      throw Errors.forbidden('You cannot access another customer’s order.');
    }
    if (!isReorderEligible(order.status)) {
      throw Errors.problem(
        409,
        'REORDER_NOT_ELIGIBLE',
        'Reorder unavailable',
        `Reorder is only available for delivered orders (current status: ${order.status}).`,
      );
    }
    if (order.countryId !== country.id) {
      throw Errors.problem(
        409,
        'REORDER_COUNTRY_MISMATCH',
        'Country mismatch',
        'Reorder country must match the order market.',
      );
    }

    const postalCode = input.postal_code?.trim();
    if (postalCode) {
      await this.serviceability.assertMedicineDelivery(country.isoAlpha2, postalCode);
    }

    const added: ReorderLineResult[] = [];
    const unavailable: ReorderUnavailableLine[] = [];

    for (const line of order.items) {
      const preview = await this.previewLine(line, country.id, country.isoAlpha2, postalCode);
      if (preview.unavailable) {
        unavailable.push(preview.unavailable);
        continue;
      }

      try {
        await this.carts.addItem(
          principal,
          country.isoAlpha2,
          { offerId: line.offerId, qty: line.qty },
          `${idempotencyKey}:line:${line.offerId}`,
        );
        added.push({
          offer_id: line.offerId,
          title: line.title,
          qty: line.qty,
          current_sell_minor: preview.currentSellMinor,
          rx_required: line.rxRequired,
        });
      } catch (err) {
        const mapped = this.mapProblem(err);
        unavailable.push({
          offer_id: line.offerId,
          title: line.title,
          qty: line.qty,
          reason_code: mapped.code,
          reason: mapped.reason,
        });
      }
    }

    const cart = await this.carts.getCart(principal, country.isoAlpha2);
    return {
      order_id: order.id,
      order_number: order.orderNumber,
      added,
      unavailable,
      cart,
      sandbox: true,
      message:
        unavailable.length === 0
          ? 'Items added to cart at current prices. Continue to checkout.'
          : added.length === 0
            ? 'No items could be added. Review unavailable lines.'
            : 'Some items were added; others are unavailable at current seller, stock, or serviceability.',
    };
  }

  private async previewLine(
    line: { offerId: string; variantId: string; title: string; qty: number; rxRequired: boolean },
    countryId: string,
    countryIso2: string,
    postalCode?: string,
  ): Promise<{ unavailable?: ReorderUnavailableLine; currentSellMinor?: string }> {
    const offer = await this.prisma.catalogOffer.findUnique({
      where: { id: line.offerId },
      include: { variant: { include: { item: { include: { countries: true } } } } },
    });
    if (!offer || offer.countryId !== countryId || offer.status !== OfferStatus.PUBLISHED) {
      return {
        unavailable: {
          offer_id: line.offerId,
          title: line.title,
          qty: line.qty,
          reason_code: 'OFFER_UNAVAILABLE',
          reason: 'This offer is no longer published.',
        },
      };
    }
    if (offer.variant.item.status !== CatalogLifecycle.PUBLISHED) {
      return {
        unavailable: {
          offer_id: line.offerId,
          title: line.title,
          qty: line.qty,
          reason_code: 'PRODUCT_UNAVAILABLE',
          reason: 'This product is no longer available.',
        },
      };
    }
    const assortment = offer.variant.item.countries.find((row) => row.countryId === countryId);
    if (!assortment?.available) {
      return {
        unavailable: {
          offer_id: line.offerId,
          title: line.title,
          qty: line.qty,
          reason_code: 'PRODUCT_UNAVAILABLE',
          reason: 'Product is not available in this country.',
        },
      };
    }
    if (
      offer.ownership === OfferOwnership.VENDOR_OWNED ||
      offer.ownership === OfferOwnership.MARKETPLACE
    ) {
      const purchasable = await this.marketplace.isCustomerPurchasableSeller(offer.sellerOrgId);
      if (!purchasable) {
        return {
          unavailable: {
            offer_id: line.offerId,
            title: line.title,
            qty: line.qty,
            reason_code: 'SELLER_UNAVAILABLE',
            reason: 'Original seller is not eligible for marketplace orders.',
          },
        };
      }
    }
    const available = await this.inventory.availableUnits(offer.variantId, offer.sellerOrgId, countryId);
    if (available < line.qty) {
      return {
        unavailable: {
          offer_id: line.offerId,
          title: line.title,
          qty: line.qty,
          reason_code: 'OUT_OF_STOCK',
          reason:
            available <= 0
              ? 'Out of stock at the original seller.'
              : `Only ${available} unit(s) available (requested ${line.qty}).`,
        },
      };
    }
    if (postalCode) {
      try {
        await this.serviceability.assertMedicineDelivery(countryIso2, postalCode);
      } catch (err) {
        const mapped = this.mapProblem(err);
        return {
          unavailable: {
            offer_id: line.offerId,
            title: line.title,
            qty: line.qty,
            reason_code: mapped.code,
            reason: mapped.reason,
          },
        };
      }
    }
    let currentSellMinor: string | undefined;
    try {
      const price = await this.pricing.currentPrice(offer.id);
      currentSellMinor = minorJson(price.sellMinor);
    } catch {
      currentSellMinor = undefined;
    }
    return { currentSellMinor };
  }

  private mapProblem(err: unknown): { code: string; reason: string } {
    const p = err as ProblemLike;
    if (p?.code && (p.detail || p.title)) {
      return { code: p.code, reason: String(p.detail ?? p.title) };
    }
    if (err instanceof Error) {
      return { code: 'REORDER_FAILED', reason: err.message };
    }
    return { code: 'REORDER_FAILED', reason: 'Item could not be added to cart.' };
  }

  private async withIdempotency<T>(
    personId: string,
    key: string,
    method: string,
    path: string,
    run: () => Promise<T>,
  ): Promise<T> {
    if (!key?.trim()) {
      throw Errors.validation('Idempotency-Key is required.');
    }
    const prior = await this.prisma.idempotencyRecord.findUnique({
      where: { personId_key: { personId, key: key.trim() } },
    });
    if (prior) {
      return prior.body as T;
    }
    const result = await run();
    await this.prisma.idempotencyRecord.create({
      data: {
        id: uuidv7(),
        personId,
        key: key.trim(),
        method,
        path,
        statusCode: 200,
        body: result as Prisma.InputJsonValue,
      },
    });
    return result;
  }
}
