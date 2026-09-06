export type ProductQualityKind = 'MEDICINE' | 'OTC' | 'DEVICE' | 'CONSUMABLE' | 'BUNDLE' | string;

export type ProductQualityInput = {
  kind: ProductQualityKind;
  title: string | null;
  manufacturer: string | null;
  composition: string | null;
  compositionNotApplicable?: boolean;
  strength: string | null;
  strengthNotApplicable?: boolean;
  dosageForm: string | null;
  packSize: string | null;
  sku: string | null;
  rxClassified: boolean;
  sellerOrgId: string | null;
  sellMinor: bigint | number | null;
  currency: string | null;
  expectedCurrency: string | null;
  stockQty: number;
  sellerCountryId: string | null;
  offerCountryId: string | null;
  serviceabilityReady: boolean;
};

export type ProductQualityResult = {
  catalog_ready: boolean;
  inventory_ready: boolean;
  publishable: boolean;
  blockers: string[];
};

function missing(value: string | null | undefined): boolean {
  return !value || !value.trim();
}

/**
 * Server-side medicine/offer data-quality gates.
 * Does not invent medical content. Missing fields become blockers.
 */
export function evaluateProductQuality(input: ProductQualityInput): ProductQualityResult {
  const blockers: string[] = [];
  const medicine = input.kind === 'MEDICINE';

  if (missing(input.title)) blockers.push('PRODUCT_NAME_MISSING');
  if (missing(input.sku)) blockers.push('SKU_MISSING');
  if (missing(input.packSize)) blockers.push('PACK_SIZE_MISSING');

  if (medicine && missing(input.manufacturer)) blockers.push('MANUFACTURER_MISSING');
  if (medicine && !input.compositionNotApplicable && missing(input.composition)) {
    blockers.push('COMPOSITION_MISSING');
  }
  if (medicine && !input.strengthNotApplicable && missing(input.strength)) {
    blockers.push('STRENGTH_MISSING');
  }
  if (medicine && !input.rxClassified) {
    blockers.push('RX_STATUS_MISSING');
  }

  if (!input.sellerOrgId) blockers.push('SELLER_MISSING');
  if (input.sellMinor == null || Number(input.sellMinor) <= 0) blockers.push('PRICE_MISSING');
  if (missing(input.currency)) {
    blockers.push('CURRENCY_MISSING');
  } else if (input.expectedCurrency && input.currency !== input.expectedCurrency) {
    blockers.push('CURRENCY_MISMATCH');
  }
  if (input.stockQty <= 0) blockers.push('NO_STOCK');
  if (!input.sellerCountryId || !input.offerCountryId) blockers.push('COUNTRY_MISSING');
  if (!input.serviceabilityReady) blockers.push('SERVICEABILITY_MISSING');

  const inventoryReady = input.stockQty > 0 && Boolean(input.sellerOrgId);
  const catalogReady = !blockers.some((code) =>
    [
      'PRODUCT_NAME_MISSING',
      'SKU_MISSING',
      'PACK_SIZE_MISSING',
      'MANUFACTURER_MISSING',
      'COMPOSITION_MISSING',
      'STRENGTH_MISSING',
      'RX_STATUS_MISSING',
      'PRICE_MISSING',
      'CURRENCY_MISSING',
      'CURRENCY_MISMATCH',
      'SELLER_MISSING',
    ].includes(code),
  );

  return {
    catalog_ready: catalogReady,
    inventory_ready: inventoryReady,
    publishable: blockers.length === 0,
    blockers,
  };
}

export type ImportRowInput = {
  sourceRowKey: string;
  productId?: string | null;
  sku?: string | null;
  priceMinor?: number | null;
  currency?: string | null;
  stockQty?: number | null;
  countryCode?: string | null;
  expectedCurrency: string;
  expectedCountryCode: string;
  sellerKnown: boolean;
  variantKnown: boolean;
};

export function validateImportRow(input: ImportRowInput): string[] {
  const reasons: string[] = [];
  if (missing(input.sourceRowKey)) reasons.push('SOURCE_ROW_KEY_MISSING');
  if (missing(input.sku)) reasons.push('SKU_MISSING');
  if (missing(input.productId) && !input.variantKnown) reasons.push('PRODUCT_MISSING');
  if (input.priceMinor == null || input.priceMinor <= 0) reasons.push('INVALID_PRICE');
  if (missing(input.currency)) {
    reasons.push('CURRENCY_MISSING');
  } else if (!/^[A-Z]{3}$/.test(input.currency ?? '')) {
    reasons.push('INVALID_CURRENCY');
  } else if (input.currency !== input.expectedCurrency) {
    reasons.push('INVALID_CURRENCY');
  }
  if (input.stockQty == null || input.stockQty < 0) reasons.push('INVALID_STOCK');
  if (missing(input.countryCode)) {
    reasons.push('COUNTRY_MISSING');
  } else if (input.countryCode !== input.expectedCountryCode) {
    reasons.push('UNKNOWN_COUNTRY');
  }
  if (!input.sellerKnown) reasons.push('UNKNOWN_SELLER');
  if (!input.variantKnown) reasons.push('INVALID_VARIANT');
  return reasons;
}
