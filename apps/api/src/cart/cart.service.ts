import { Injectable } from '@nestjs/common';
import {
  CartStatus,
  CatalogLifecycle,
  CheckoutStatus,
  ConversionEventKind,
  OfferStatus,
  Prisma,
  RegulatedClass,
  ShippingQuoteStatus,
  TaxQuoteStatus,
} from '@prisma/client';
import { uuidv7 } from '@world-pharma/shared';
import { PrismaService, runWithTenant } from '../app/prisma.service';
import { RedisService } from '../app/redis.service';
import { PricingService } from '../catalog/pricing.service';
import { Errors } from '../common/problem';
import { OutboxService } from '../events/outbox.service';
import type { Principal } from '../identity/current-principal';
import { InventoryService } from '../inventory/inventory.service';
import { PolicyResolver } from '../policy/resolver';
import { PromoEvaluatorService } from '../promo/promo-evaluator.service';
import { AffiliateAttributionService } from '../affiliate/affiliate-attribution.service';
import { PersonalizationService } from '../personalization/personalization.service';
import { ConversionEventService } from '../crm/conversion-event.service';
import { workerTenantContext } from '../tenancy/build-tenant-context';

const QUOTE_TTL_MS = 15 * 60 * 1000;
const MAX_LINES = 50;
const MAX_QTY = 99;

@Injectable()
export class CartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
    private readonly inventory: InventoryService,
    private readonly outbox: OutboxService,
    private readonly policy: PolicyResolver,
    private readonly redis: RedisService,
    private readonly promoEvaluator: PromoEvaluatorService,
    private readonly affiliateAttribution: AffiliateAttributionService,
    private readonly personalization: PersonalizationService,
    private readonly conversionEvents: ConversionEventService,
  ) {}

  getCart(principal: Principal, countryCode: string) {
    return this.withCountry(countryCode, async (country) => {
      const cart = await this.ensureCart(principal.personId, country.id);
      return this.presentCart(cart.id);
    });
  }

  addItem(
    principal: Principal,
    countryCode: string,
    input: { offerId: string; qty: number; prescriptionCaseId?: string },
    idempotencyKey: string,
  ) {
    return this.idempotent(principal.personId, idempotencyKey, 'POST', '/me/cart/items', async () => {
      const qty = this.requireQty(input.qty);
      const country = await this.requireCountry(countryCode);
      await this.assertStorefront(country.isoAlpha2);
      const offer = await this.loadSellableOffer(input.offerId, country.id);
      const cart = await this.ensureCart(principal.personId, country.id);
      if (cart.sellerOrgId && cart.sellerOrgId !== offer.sellerOrgId) {
        throw Errors.problem(
          409,
          'CART_SELLER_CONFLICT',
          'Seller conflict',
          'This cart already has a different seller.',
        );
      }
      const existing = await this.prisma.cartItem.findUnique({
        where: { cartId_offerId: { cartId: cart.id, offerId: offer.id } },
      });
      const nextQty = (existing && !existing.deletedAt ? existing.qty : 0) + qty;
      if ((await this.activeLineCount(cart.id, existing && !existing.deletedAt ? existing.id : undefined)) >= MAX_LINES) {
        throw Errors.problem(422, 'QTY_MAX', 'Quantity limit', 'Cart line limit reached.');
      }
      const cap = offer.variant.item.countries.find((row) => row.countryId === country.id)?.maxQtyPerOrder;
      if (cap && nextQty > cap) {
        throw Errors.problem(422, 'QTY_MAX', 'Quantity limit', 'Quantity exceeds the country order cap.');
      }
      const available = await this.inventory.availableUnits(offer.variantId, offer.sellerOrgId, country.id);
      if (available < nextQty) {
        throw Errors.problem(409, 'OUT_OF_STOCK', 'Out of stock', 'Requested quantity is not available.');
      }
      const firstLine = !cart.sellerOrgId;
      await this.prisma.$transaction(async (tx) => {
        await tx.cart.update({
          where: { id: cart.id },
          data: {
            sellerOrgId: offer.sellerOrgId,
            status: CartStatus.ACTIVE,
            // Normal add clears Rx handoff flags so non-Rx inventory rules apply.
            skipInventoryHold: false,
            dispensingCaseId: null,
            dispenseEventId: null,
          },
        });
        if (existing) {
          await tx.cartItem.update({
            where: { id: existing.id },
            data: {
              qty: nextQty,
              deletedAt: null,
              prescriptionCaseId: input.prescriptionCaseId ?? existing.prescriptionCaseId,
            },
          });
        } else {
          await tx.cartItem.create({
            data: {
              id: uuidv7(),
              cartId: cart.id,
              offerId: offer.id,
              variantId: offer.variantId,
              qty: nextQty,
              prescriptionCaseId: input.prescriptionCaseId,
            },
          });
        }
        if (firstLine) {
          await this.outbox.enqueue(tx, {
            type: 'CART_CREATED',
            aggregateType: 'Cart',
            aggregateId: cart.id,
            producer: 'cart',
            countryId: country.id,
            actorId: principal.personId,
            payload: { country_id: country.id },
            occurrenceKey: `cart-created:${cart.id}`,
          });
        }
        await this.outbox.enqueue(tx, {
          type: existing && !existing.deletedAt ? 'CART_ITEM_UPDATED' : 'CART_ITEM_ADDED',
          aggregateType: 'Cart',
          aggregateId: cart.id,
          producer: 'cart',
          countryId: country.id,
          actorId: principal.personId,
          payload: { offer_id: offer.id, qty: nextQty },
          occurrenceKey: `${idempotencyKey}:event`,
        });
      });
      await this.dropCartCache(principal.personId, country.id);
      await this.personalization.recordHook({
        countryCode: country.isoAlpha2,
        personId: principal.personId,
        catalogItemId: offer.variant.item.id,
        catalogOfferId: offer.id,
        eventKind: 'PRODUCT_ADDED_TO_CART',
        source: 'cart',
        sourceKey: idempotencyKey,
      });
      return this.presentCart(cart.id);
    });
  }

  /**
   * R5-D: replace cart contents for a DISPENSED case.
   * Sets skipInventoryHold so quote/order do not soft-reserve or PICK again (ED-R5D-01 B).
   */
  async seedRxHandoffCart(
    principal: Principal,
    input: {
      countryCode: string;
      sellerOrgId: string;
      dispensingCaseId: string;
      dispenseEventId: string;
      lines: Array<{ offerId: string; qty: number; prescriptionCaseId?: string }>;
      idempotencyKey: string;
    },
  ) {
    return this.idempotent(principal.personId, input.idempotencyKey, 'POST', '/me/rx-handoff/seed', async () => {
      const country = await this.requireCountry(input.countryCode);
      await this.assertStorefront(country.isoAlpha2);
      const cart = await this.ensureCart(principal.personId, country.id);
      await this.prisma.$transaction(async (tx) => {
        await tx.cartItem.updateMany({
          where: { cartId: cart.id, deletedAt: null },
          data: { deletedAt: new Date() },
        });
        await tx.cart.update({
          where: { id: cart.id },
          data: {
            sellerOrgId: input.sellerOrgId,
            status: CartStatus.ACTIVE,
            skipInventoryHold: true,
            dispensingCaseId: input.dispensingCaseId,
            dispenseEventId: input.dispenseEventId,
          },
        });
        for (const line of input.lines) {
          const offer = await this.loadSellableOffer(line.offerId, country.id);
          if (offer.sellerOrgId !== input.sellerOrgId) {
            throw Errors.problem(409, 'CART_SELLER_CONFLICT', 'Seller conflict', 'Offer seller must match pharmacy.');
          }
          // ED-R5D-01 Option B: do NOT check availableUnits — stock already consumed at dispense.
          // Revive soft-deleted (cartId, offerId) rows — unique constraint ignores deletedAt.
          const existing = await tx.cartItem.findUnique({
            where: { cartId_offerId: { cartId: cart.id, offerId: offer.id } },
          });
          const qty = this.requireQty(line.qty);
          const prescriptionCaseId = line.prescriptionCaseId ?? input.dispensingCaseId;
          if (existing) {
            await tx.cartItem.update({
              where: { id: existing.id },
              data: {
                qty,
                variantId: offer.variantId,
                prescriptionCaseId,
                deletedAt: null,
              },
            });
          } else {
            await tx.cartItem.create({
              data: {
                id: uuidv7(),
                cartId: cart.id,
                offerId: offer.id,
                variantId: offer.variantId,
                qty,
                prescriptionCaseId,
              },
            });
          }
        }
      });
      await this.dropCartCache(principal.personId, country.id);
      return this.presentCart(cart.id);
    });
  }

  patchItem(principal: Principal, itemId: string, qty: number, idempotencyKey: string) {
    return this.idempotent(principal.personId, idempotencyKey, 'PATCH', `/me/cart/items/${itemId}`, async () => {
      const item = await this.ownedItem(principal.personId, itemId);
      const next = this.requireQty(qty);
      const offer = await this.loadSellableOffer(item.offerId, item.cart.countryId);
      const available = await this.inventory.availableUnits(
        offer.variantId,
        offer.sellerOrgId,
        item.cart.countryId,
      );
      if (available < next) {
        throw Errors.problem(409, 'OUT_OF_STOCK', 'Out of stock', 'Requested quantity is not available.');
      }
      await this.prisma.$transaction(async (tx) => {
        await tx.cartItem.update({ where: { id: item.id }, data: { qty: next, deletedAt: null } });
        await this.outbox.enqueue(tx, {
          type: 'CART_ITEM_UPDATED',
          aggregateType: 'Cart',
          aggregateId: item.cartId,
          producer: 'cart',
          countryId: item.cart.countryId,
          actorId: principal.personId,
          payload: { item_id: item.id, qty: next },
          occurrenceKey: `${idempotencyKey}:event`,
        });
      });
      await this.dropCartCache(principal.personId, item.cart.countryId);
      return this.presentCart(item.cartId);
    });
  }

  removeItem(principal: Principal, itemId: string, idempotencyKey: string) {
    return this.idempotent(principal.personId, idempotencyKey, 'DELETE', `/me/cart/items/${itemId}`, async () => {
      const item = await this.ownedItem(principal.personId, itemId);
      await this.prisma.$transaction(async (tx) => {
        await tx.cartItem.update({ where: { id: item.id }, data: { deletedAt: new Date() } });
        const remaining = await tx.cartItem.count({ where: { cartId: item.cartId, deletedAt: null } });
        if (remaining === 0) {
          await tx.cart.update({ where: { id: item.cartId }, data: { sellerOrgId: null } });
        }
        await this.outbox.enqueue(tx, {
          type: 'CART_ITEM_REMOVED',
          aggregateType: 'Cart',
          aggregateId: item.cartId,
          producer: 'cart',
          countryId: item.cart.countryId,
          actorId: principal.personId,
          payload: { item_id: item.id },
          occurrenceKey: `${idempotencyKey}:event`,
        });
      });
      await this.dropCartCache(principal.personId, item.cart.countryId);
      return this.presentCart(item.cartId);
    });
  }

  listAddresses(principal: Principal) {
    return this.prisma.customerAddress.findMany({
      where: { customerPersonId: principal.personId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createAddress(
    principal: Principal,
    input: {
      countryCode: string;
      recipientName: string;
      phone?: string;
      region?: string;
      city: string;
      postalCode?: string;
      line1: string;
      line2?: string;
      isDefault?: boolean;
    },
  ) {
    const country = await this.requireCountry(input.countryCode);
    if (!input.recipientName?.trim() || !input.city?.trim() || !input.line1?.trim()) {
      throw Errors.validation('recipient_name, city and line1 are required.');
    }
    if (input.isDefault) {
      await this.prisma.customerAddress.updateMany({
        where: { customerPersonId: principal.personId },
        data: { isDefault: false },
      });
    }
    return this.prisma.customerAddress.create({
      data: {
        id: uuidv7(),
        customerPersonId: principal.personId,
        countryId: country.id,
        recipientName: input.recipientName.trim(),
        phone: input.phone,
        region: input.region,
        city: input.city.trim(),
        postalCode: input.postalCode,
        line1: input.line1.trim(),
        line2: input.line2,
        isDefault: input.isDefault ?? false,
      },
    });
  }

  async updateAddress(
    principal: Principal,
    addressId: string,
    input: {
      recipientName?: string;
      phone?: string;
      region?: string;
      city?: string;
      postalCode?: string;
      line1?: string;
      line2?: string;
      isDefault?: boolean;
    },
  ) {
    const existing = await this.prisma.customerAddress.findFirst({
      where: { id: addressId, customerPersonId: principal.personId },
    });
    if (!existing) {
      throw Errors.notFound('Address not found.');
    }
    if (input.isDefault) {
      await this.prisma.customerAddress.updateMany({
        where: { customerPersonId: principal.personId },
        data: { isDefault: false },
      });
    }
    return this.prisma.customerAddress.update({
      where: { id: addressId },
      data: {
        recipientName: input.recipientName?.trim(),
        phone: input.phone,
        region: input.region,
        city: input.city?.trim(),
        postalCode: input.postalCode,
        line1: input.line1?.trim(),
        line2: input.line2,
        isDefault: input.isDefault,
      },
    });
  }

  async deleteAddress(principal: Principal, addressId: string) {
    const existing = await this.prisma.customerAddress.findFirst({
      where: { id: addressId, customerPersonId: principal.personId },
    });
    if (!existing) {
      throw Errors.notFound('Address not found.');
    }
    await this.prisma.customerAddress.delete({ where: { id: addressId } });
    return { ok: true };
  }

  startCheckout(principal: Principal, countryCode: string, idempotencyKey: string, affiliateCode?: string) {
    return this.idempotent(principal.personId, idempotencyKey, 'POST', '/me/checkout/sessions', async () => {
      const country = await this.requireCountry(countryCode);
      const resolvedAffiliate = await this.affiliateAttribution.resolveCheckoutCode(
        affiliateCode ?? null,
        country.id,
      );
      const cart = await this.ensureCart(principal.personId, country.id);
      const count = await this.prisma.cartItem.count({ where: { cartId: cart.id, deletedAt: null } });
      if (!count || !cart.sellerOrgId) {
        throw Errors.validation('Cart is empty.');
      }
      const created = await this.prisma.$transaction(async (tx) => {
        const session = await tx.checkoutSession.create({
          data: {
            id: uuidv7(),
            customerPersonId: principal.personId,
            countryId: cart.countryId,
            cartId: cart.id,
            sellerOrgId: cart.sellerOrgId!,
            status: CheckoutStatus.VALIDATING,
            idempotencyKey,
            affiliateCode: resolvedAffiliate,
            expiresAt: new Date(Date.now() + QUOTE_TTL_MS),
            skipInventoryHold: cart.skipInventoryHold,
            dispensingCaseId: cart.dispensingCaseId,
            dispenseEventId: cart.dispenseEventId,
          },
        });
        await this.outbox.enqueue(tx, {
          type: 'CHECKOUT_STARTED',
          aggregateType: 'CheckoutSession',
          aggregateId: session.id,
          producer: 'cart',
          countryId: cart.countryId,
          actorId: principal.personId,
          payload: {
            cart_id: cart.id,
            skip_inventory_hold: cart.skipInventoryHold,
            dispensing_case_id: cart.dispensingCaseId,
          },
          occurrenceKey: `checkout-started:${session.id}`,
        });
        return session;
      });
      await this.conversionEvents
        .recordHook({
          countryCode: country.isoAlpha2,
          personId: principal.personId,
          sessionId: created.id,
          eventKind: ConversionEventKind.CHECKOUT_STARTED,
          source: 'checkout_session',
          sourceKey: created.id,
          metadata: { cart_id: cart.id },
        })
        .catch(() => undefined);
      return this.quoteSession(principal, created.id, `${idempotencyKey}:quote`, false);
    });
  }

  async attachAddress(principal: Principal, sessionId: string, addressId: string) {
    const session = await this.ownedSession(principal.personId, sessionId);
    const address = await this.prisma.customerAddress.findFirst({
      where: { id: addressId, customerPersonId: principal.personId },
    });
    if (!address) {
      throw Errors.notFound('Address not found.');
    }
    if (address.countryId !== session.countryId) {
      throw Errors.problem(409, 'CART_COUNTRY_CONFLICT', 'Country conflict', 'Address country does not match the cart.');
    }
    await this.prisma.checkoutSession.update({
      where: { id: session.id },
      data: { addressId: address.id, status: CheckoutStatus.REVALIDATION_REQUIRED },
    });
    return this.presentSession(session.id, undefined, principal.personId);
  }

  async setPromo(principal: Principal, sessionId: string, promoCode: string | undefined) {
    const session = await this.ownedSession(principal.personId, sessionId);
    await this.prisma.checkoutSession.update({
      where: { id: session.id },
      data: { promoCode: promoCode?.trim() || null, status: CheckoutStatus.REVALIDATION_REQUIRED },
    });
    return this.presentSession(session.id, undefined, principal.personId);
  }

  quoteSession(principal: Principal, sessionId: string, idempotencyKey: string, revalidate: boolean) {
    return this.idempotent(
      principal.personId,
      idempotencyKey,
      'POST',
      `/me/checkout/sessions/${sessionId}/quote`,
      async () => {
        await this.expireIfNeeded(sessionId);
        const session = await this.ownedSession(principal.personId, sessionId);
        if (session.status === CheckoutStatus.EXPIRED || session.status === CheckoutStatus.CANCELLED) {
          throw Errors.problem(409, 'CHECKOUT_EXPIRED', 'Checkout expired', 'Start a new checkout session.');
        }
        if (session.reservationIds.length) {
          await this.inventory.releaseByIds(session.reservationIds, principal.personId);
        }
        const cart = await this.prisma.cart.findUniqueOrThrow({
          where: { id: session.cartId },
          include: { items: { where: { deletedAt: null } } },
        });
        const built = await this.buildQuote(cart, session.promoCode, session.affiliateCode);
        const reservationIds: string[] = [];
        const skipHold = session.skipInventoryHold || cart.skipInventoryHold;
        // ED-R5D-01 Option B: Rx handoff skips soft reserve (stock already PICK'd at R5-C).
        if (!skipHold) {
          for (const line of built.lines) {
            const reservation = await this.inventory.reserveForCheckout({
              variantId: line.variant_id,
              ownerOrgId: cart.sellerOrgId!,
              countryId: cart.countryId,
              qty: line.qty,
              actorPersonId: principal.personId,
              idempotencyKey: `checkout:${session.id}:${line.offer_id}:${built.fingerprint}`,
              ttlSeconds: 900,
            });
            reservationIds.push(reservation.id);
          }
        }
        const quotePayload = {
          ...built,
          rx_handoff: skipHold,
          dispensing_case_id: session.dispensingCaseId ?? cart.dispensingCaseId,
          dispense_event_id: session.dispenseEventId ?? cart.dispenseEventId,
          ed_r5d_01: skipHold ? 'option_b_skip_order_pick' : null,
        };
        await this.prisma.$transaction(async (tx) => {
          await tx.promoApplication.deleteMany({ where: { sessionId: session.id } });
          if (built.promo) {
            await tx.promoApplication.create({
              data: {
                id: uuidv7(),
                sessionId: session.id,
                campaignId: built.promo.campaign_id,
                discountMinor: BigInt(built.promo.discount_minor),
                funding: built.promo.funding,
              },
            });
          }
          await tx.affiliateAttributionSnapshot.deleteMany({ where: { sessionId: session.id } });
          if (session.affiliateCode) {
            await tx.affiliateAttributionSnapshot.create({
              data: {
                id: uuidv7(),
                sessionId: session.id,
                affiliateCode: session.affiliateCode,
                previewMinor: BigInt(built.affiliate.preview_minor),
                clinicalBlocked: built.affiliate.clinical_blocked,
              },
            });
          }
          const quote = await tx.checkoutQuote.create({
            data: {
              id: uuidv7(),
              sessionId: session.id,
              fingerprint: built.fingerprint,
              currency: built.currency,
              sellMinor: BigInt(built.sell_minor),
              discountMinor: BigInt(built.discount_minor),
              taxMinor: 0n,
              shippingMinor: 0n,
              totalMinor: BigInt(built.total_minor),
              taxStatus: TaxQuoteStatus.UNKNOWN,
              shippingStatus: ShippingQuoteStatus.UNAVAILABLE,
              payload: quotePayload as unknown as Prisma.InputJsonValue,
              expiresAt: new Date(Date.now() + QUOTE_TTL_MS),
            },
          });
          await tx.checkoutSession.update({
            where: { id: session.id },
            data: {
              status: CheckoutStatus.READY_FOR_PAYMENT,
              reservationIds,
              expiresAt: quote.expiresAt,
              skipInventoryHold: skipHold,
              dispensingCaseId: session.dispensingCaseId ?? cart.dispensingCaseId,
              dispenseEventId: session.dispenseEventId ?? cart.dispenseEventId,
            },
          });
          await this.outbox.enqueue(tx, {
            type: revalidate ? 'CHECKOUT_REVALIDATED' : 'CHECKOUT_STARTED',
            aggregateType: 'CheckoutSession',
            aggregateId: session.id,
            producer: 'cart',
            countryId: session.countryId,
            actorId: principal.personId,
            payload: {
              fingerprint: built.fingerprint,
              total_minor: built.total_minor,
              skip_inventory_hold: skipHold,
            },
            occurrenceKey: `${idempotencyKey}:quoted`,
          });
        });
        return this.presentSession(session.id, undefined, principal.personId);
      },
    );
  }

  async validateSession(principal: Principal, sessionId: string) {
    const presented = await this.presentSession(sessionId, undefined, principal.personId);
    const fingerprint = (presented.quote as { fingerprint?: string } | null)?.fingerprint;
    if (!fingerprint) {
      throw Errors.problem(409, 'QUOTE_STALE', 'Quote stale', 'Request a new quote.');
    }
    const session = await this.ownedSession(principal.personId, sessionId);
    const cart = await this.prisma.cart.findUniqueOrThrow({
      where: { id: session.cartId },
      include: { items: { where: { deletedAt: null } } },
    });
    const built = await this.buildQuote(cart, session.promoCode, session.affiliateCode);
    if (built.fingerprint !== fingerprint) {
      await this.prisma.checkoutSession.update({
        where: { id: session.id },
        data: { status: CheckoutStatus.REVALIDATION_REQUIRED },
      });
      throw Errors.problem(409, 'PRICE_CHANGED', 'Price changed', 'Revalidate the checkout quote.');
    }
    return presented;
  }

  payDisabled(): never {
    throw Errors.problem(
      409,
      'PAYMENTS_DISABLED',
      'Payments disabled',
      'Payment is not available in this phase. No PSP was contacted and no order was created.',
    );
  }

  private async buildQuote(
    cart: {
      countryId: string;
      sellerOrgId: string | null;
      items: { offerId: string; variantId: string; qty: number; prescriptionCaseId: string | null }[];
    },
    promoCode: string | null,
    affiliateCode: string | null,
  ) {
    if (!cart.items.length) {
      throw Errors.validation('Cart is empty.');
    }
    const country = await this.prisma.country.findUniqueOrThrow({ where: { id: cart.countryId } });
    await this.assertStorefront(country.isoAlpha2);
    const lines: Array<{
      offer_id: string;
      variant_id: string;
      qty: number;
      sku: string;
      sell_minor: string;
      price_version_id: string;
      price_version: number;
      commercial_rule_id: string | null;
    }> = [];
    let sell = 0n;
    let currency = 'XXX';
    let clinical = false;
    for (const item of cart.items) {
      const offer = await this.loadSellableOffer(item.offerId, cart.countryId);
      const assortment = offer.variant.item.countries.find((row) => row.countryId === cart.countryId);
      if (assortment?.regulatedClass === RegulatedClass.CONTROLLED) {
        throw Errors.problem(
          422,
          'COMPLIANCE_HOLD',
          'Compliance hold',
          'LEGAL/COMPLIANCE REVIEW REQUIRED before selling controlled items.',
        );
      }
      if (assortment?.rxRequired && !item.prescriptionCaseId) {
        throw Errors.problem(422, 'RX_REQUIRED', 'Prescription required', 'Attach a prescription case before checkout.');
      }
      if (assortment?.maxQtyPerOrder && item.qty > assortment.maxQtyPerOrder) {
        throw Errors.problem(422, 'QTY_MAX', 'Quantity limit', 'Quantity exceeds the country order cap.');
      }
      if (assortment?.regulatedClass === RegulatedClass.RX) {
        clinical = true;
      }
      const quoted = await this.pricing.quote(offer.id, BigInt(item.qty));
      sell += BigInt(quoted.totals.sell_minor);
      currency = quoted.currency;
      lines.push({
        offer_id: offer.id,
        variant_id: offer.variantId,
        qty: item.qty,
        sku: offer.variant.skuCode,
        sell_minor: quoted.totals.sell_minor,
        price_version_id: quoted.price_version_id,
        price_version: quoted.price_version,
        commercial_rule_id: quoted.commercial_rule_id,
      });
    }
    const promo = await this.computePromo(promoCode, country.id, sell);
    const discount = promo ? BigInt(promo.discount_minor) : 0n;
    const fingerprint = `${lines.map((line) => `${line.offer_id}:${line.qty}:${line.price_version_id}`).join('|')}|${promo?.code ?? ''}|${affiliateCode ?? ''}`;
    return {
      currency,
      sell_minor: sell.toString(),
      discount_minor: discount.toString(),
      tax_minor: '0',
      shipping_minor: '0',
      total_minor: (sell - discount).toString(),
      tax_status: 'UNKNOWN',
      shipping_status: 'UNAVAILABLE',
      shipping_quoted: false,
      tax_quoted: false,
      settlement: false,
      lines,
      promo,
      affiliate: {
        code: affiliateCode,
        preview_minor: '0',
        clinical_blocked: true,
        payable: false,
        clinical,
      },
      fingerprint,
    };
  }

  private async computePromo(code: string | null, countryId: string, sellMinor: bigint) {
    if (!code) {
      return null;
    }
    const normalized = code.trim().toUpperCase();
    const campaign = await runWithTenant(workerTenantContext({ countryId }), () =>
      this.prisma.promoCampaign.findUnique({ where: { code: normalized } }),
    );
    if (!campaign) {
      throw Errors.problem(422, 'PROMO_INVALID', 'Promo invalid', 'Promo code is not recognized.');
    }
    return this.promoEvaluator.evaluateCampaign(campaign, countryId, sellMinor);
  }

  async presentCart(cartId: string) {
    const cart = await this.prisma.cart.findUniqueOrThrow({
      where: { id: cartId },
      include: {
        items: {
          where: { deletedAt: null },
          include: { offer: { include: { variant: { include: { item: { include: { translations: true } } } } } } },
        },
        country: true,
      },
    });
    const items = [];
    for (const item of cart.items) {
      const quoted = await this.pricing.quote(item.offerId, BigInt(item.qty)).catch(() => null);
      items.push({
        id: item.id,
        offer_id: item.offerId,
        variant_id: item.variantId,
        qty: item.qty,
        sku: item.offer.variant.skuCode,
        title: item.offer.variant.item.translations[0]?.title ?? item.offer.variant.skuCode,
        seller_org_id: item.offer.sellerOrgId,
        currency: quoted?.currency ?? item.offer.currency,
        sell_minor: quoted?.totals.sell_minor ?? null,
      });
    }
    return {
      id: cart.id,
      country_id: cart.countryId,
      country_code: cart.country.isoAlpha2,
      seller_org_id: cart.sellerOrgId,
      status: cart.status,
      skip_inventory_hold: cart.skipInventoryHold,
      dispensing_case_id: cart.dispensingCaseId,
      dispense_event_id: cart.dispenseEventId,
      items,
    };
  }

  private async presentSession(sessionId: string, _quoteId: string | undefined, personId: string) {
    const session = await this.prisma.checkoutSession.findUniqueOrThrow({
      where: { id: sessionId },
      include: {
        quotes: { orderBy: { createdAt: 'desc' }, take: 1 },
        address: true,
      },
    });
    if (session.customerPersonId !== personId) {
      throw Errors.forbidden('You cannot access another customer’s checkout.');
    }
    const quote = session.quotes[0];
    return {
      id: session.id,
      status: session.status,
      cart_id: session.cartId,
      seller_org_id: session.sellerOrgId,
      skip_inventory_hold: session.skipInventoryHold,
      dispensing_case_id: session.dispensingCaseId,
      dispense_event_id: session.dispenseEventId,
      expires_at: session.expiresAt,
      address: session.address,
      payments_enabled: false,
      payment_message: 'Payment stays policy-gated. Use POST /pay with Idempotency-Key when the country pack enables sandbox payments.',
      quote: quote
        ? {
            id: quote.id,
            fingerprint: quote.fingerprint,
            currency: quote.currency,
            sell_minor: quote.sellMinor.toString(),
            discount_minor: quote.discountMinor.toString(),
            tax_minor: quote.taxMinor.toString(),
            shipping_minor: quote.shippingMinor.toString(),
            total_minor: quote.totalMinor.toString(),
            tax_status: quote.taxStatus,
            shipping_status: quote.shippingStatus,
            expires_at: quote.expiresAt,
            payload: quote.payload,
          }
        : null,
    };
  }

  private async ensureCart(personId: string, countryId: string) {
    const existing = await this.prisma.cart.findUnique({
      where: { customerPersonId_countryId: { customerPersonId: personId, countryId } },
    });
    if (existing) {
      return existing;
    }
    const country = await this.prisma.country.findUnique({ where: { id: countryId } });
    return this.prisma.cart.create({
      data: {
        id: uuidv7(),
        customerPersonId: personId,
        countryId,
        currency: country?.defaultCurrency ?? null,
        status: CartStatus.ACTIVE,
      },
    });
  }

  private async loadSellableOffer(offerId: string, countryId: string) {
    const offer = await this.prisma.catalogOffer.findUnique({
      where: { id: offerId },
      include: { variant: { include: { item: { include: { countries: true, translations: true } } } } },
    });
    if (!offer || offer.countryId !== countryId || offer.status !== OfferStatus.PUBLISHED) {
      throw Errors.problem(409, 'OFFER_EXPIRED', 'Offer unavailable', 'Offer is not published in this country.');
    }
    if (offer.variant.item.status !== CatalogLifecycle.PUBLISHED) {
      throw Errors.problem(409, 'OFFER_EXPIRED', 'Offer unavailable', 'Product is not published.');
    }
    const assortment = offer.variant.item.countries.find((row) => row.countryId === countryId);
    if (!assortment?.available) {
      throw Errors.serviceDisabled('Product is not available in this country.');
    }
    return offer;
  }

  private async assertStorefront(isoAlpha2: string) {
    const resolved = await this.policy.resolvePublished(isoAlpha2);
    const ok =
      this.policy.canUseService(resolved?.document ?? null, 'pharmacy') ||
      this.policy.canUseService(resolved?.document ?? null, 'marketplace');
    if (!ok) {
      throw Errors.serviceDisabled('Storefront is not enabled in this country.');
    }
  }

  private async requireCountry(code: string) {
    const country = await this.prisma.country.findUnique({ where: { isoAlpha2: code.toUpperCase() } });
    if (!country) {
      throw Errors.notFound('Country is not available.');
    }
    return country;
  }

  private async withCountry<T>(code: string, run: (country: { id: string; isoAlpha2: string }) => Promise<T>) {
    return run(await this.requireCountry(code));
  }

  private requireQty(qty: number) {
    if (!Number.isInteger(qty) || qty < 1) {
      throw Errors.validation('qty must be a positive integer.');
    }
    if (qty > MAX_QTY) {
      throw Errors.problem(422, 'QTY_MAX', 'Quantity limit', `Quantity cannot exceed ${MAX_QTY}.`);
    }
    return qty;
  }

  private activeLineCount(cartId: string, excludeId?: string) {
    return this.prisma.cartItem.count({
      where: { cartId, deletedAt: null, ...(excludeId ? { id: { not: excludeId } } : {}) },
    });
  }

  private async ownedItem(personId: string, itemId: string) {
    const item = await this.prisma.cartItem.findUnique({ where: { id: itemId }, include: { cart: true } });
    if (!item || item.cart.customerPersonId !== personId || item.deletedAt) {
      throw Errors.forbidden('You cannot access another customer’s cart.');
    }
    return item;
  }

  private async ownedSession(personId: string, sessionId: string) {
    const session = await this.prisma.checkoutSession.findUnique({ where: { id: sessionId } });
    if (!session || session.customerPersonId !== personId) {
      throw Errors.forbidden('You cannot access another customer’s checkout.');
    }
    return session;
  }

  private async expireIfNeeded(sessionId: string) {
    const session = await this.prisma.checkoutSession.findUnique({ where: { id: sessionId } });
    if (!session || session.expiresAt > new Date()) {
      return;
    }
    if (session.reservationIds.length) {
      await this.inventory.releaseByIds(session.reservationIds, session.customerPersonId);
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.checkoutSession.update({
        where: { id: sessionId },
        data: { status: CheckoutStatus.EXPIRED, reservationIds: [] },
      });
      await this.outbox.enqueue(tx, {
        type: 'CHECKOUT_EXPIRED',
        aggregateType: 'CheckoutSession',
        aggregateId: sessionId,
        producer: 'cart',
        countryId: session.countryId,
        payload: {},
        occurrenceKey: `checkout-expired:${sessionId}`,
      });
    });
  }

  private async idempotent<T>(personId: string, key: string, method: string, path: string, run: () => Promise<T>): Promise<T> {
    if (!key) {
      throw Errors.validation('Idempotency-Key is required.');
    }
    const prior = await this.prisma.idempotencyRecord.findUnique({
      where: { personId_key: { personId, key } },
    });
    if (prior) {
      return prior.body as T;
    }
    const result = await run();
    await this.prisma.idempotencyRecord.create({
      data: {
        id: uuidv7(),
        personId,
        key,
        method,
        path,
        statusCode: 200,
        body: result as Prisma.InputJsonValue,
      },
    });
    return result;
  }

  private async dropCartCache(personId: string, countryId: string) {
    try {
      if (this.redis.client.status === 'wait') {
        await this.redis.client.connect();
      }
      await this.redis.client.del(`cart:${personId}:${countryId}`);
    } catch {
      // best-effort
    }
  }
}
