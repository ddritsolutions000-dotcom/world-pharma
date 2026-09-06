export type MarketplaceOffer = {
  id: string;
  seller_org_id?: string;
  seller_display_name?: string;
  pack_size?: string | null;
  strength?: string | null;
  sku?: string;
  currency: string;
  price: { sell_minor: string; list_minor?: string | null } | null;
  inventory?: { available: boolean; qty?: number };
};

export function offerInStock(offer: MarketplaceOffer | undefined): boolean {
  return Boolean(offer?.inventory?.available);
}

export function offerStockLabel(offer: MarketplaceOffer | undefined): string {
  if (!offer?.inventory) return 'Availability unknown';
  if (!offer.inventory.available) return 'Out of stock';
  const qty = offer.inventory.qty ?? 0;
  if (qty <= 3) return `Only ${qty} left`;
  return 'In stock';
}

export function cheapestInStockOffer(offers: MarketplaceOffer[] | null | undefined): MarketplaceOffer | undefined {
  const inStock = (offers ?? []).filter(offerInStock);
  return cheapestOffer(inStock.length ? inStock : offers ?? []);
}

export function sellerSelectionReason(
  selected: MarketplaceOffer | undefined,
  offers: MarketplaceOffer[] | null | undefined,
): string | null {
  if (!selected || distinctSellerCount(offers) <= 1) return null;
  const inStock = (offers ?? []).filter(offerInStock);
  if (!inStock.length) return 'No pharmacy currently has stock for this pack.';
  const cheapest = cheapestOffer(inStock);
  if (cheapest?.id === selected.id) {
    return 'Selected as the lowest price among in-stock pharmacies for this pack.';
  }
  return 'You selected this pharmacy. Switch sellers anytime before checkout.';
}

export function packLabel(offer: Pick<MarketplaceOffer, 'pack_size' | 'sku'>): string {
  return offer.pack_size?.trim() || offer.sku?.trim() || 'Standard pack';
}

export function uniquePackLabels(offers: MarketplaceOffer[] | null | undefined): string[] {
  return [...new Set((offers ?? []).map(packLabel))];
}

export function cheapestOffer(offers: MarketplaceOffer[] | null | undefined): MarketplaceOffer | undefined {
  const list = offers ?? [];
  if (!list.length) return undefined;
  return [...list].sort((a, b) => {
    const av = Number(a.price?.sell_minor ?? Number.POSITIVE_INFINITY);
    const bv = Number(b.price?.sell_minor ?? Number.POSITIVE_INFINITY);
    return av - bv;
  })[0];
}

export function offersForPack(offers: MarketplaceOffer[] | null | undefined, pack: string): MarketplaceOffer[] {
  return (offers ?? []).filter((offer) => packLabel(offer) === pack);
}

export function distinctSellerCount(offers: MarketplaceOffer[] | null | undefined): number {
  return new Set((offers ?? []).map((offer) => offer.seller_org_id || offer.seller_display_name || offer.id)).size;
}
