import { evaluateProductQuality, validateImportRow } from './product-quality';

const base = {
  kind: 'MEDICINE' as const,
  title: 'Paracetamol 500',
  manufacturer: 'Acme Labs',
  composition: 'Paracetamol',
  strength: '500 mg',
  dosageForm: 'tablet',
  packSize: '10 tablets',
  sku: 'PCM-500-10',
  rxClassified: true,
  sellerOrgId: 'org-1',
  sellMinor: 12000,
  currency: 'XXX',
  expectedCurrency: 'XXX',
  stockQty: 8,
  sellerCountryId: 'c1',
  offerCountryId: 'c1',
  serviceabilityReady: true,
};

describe('evaluateProductQuality', () => {
  it('passes a complete medicine offer', () => {
    const result = evaluateProductQuality(base);
    expect(result.publishable).toBe(true);
    expect(result.catalog_ready).toBe(true);
    expect(result.inventory_ready).toBe(true);
    expect(result.blockers).toEqual([]);
  });

  it('blocks missing required medicine fields', () => {
    const result = evaluateProductQuality({
      ...base,
      title: '',
      manufacturer: '',
      composition: '',
      strength: '',
      packSize: '',
      sku: '',
      rxClassified: false,
      sellMinor: null,
      currency: null,
      stockQty: 0,
      serviceabilityReady: false,
    });
    expect(result.blockers).toEqual(
      expect.arrayContaining([
        'PRODUCT_NAME_MISSING',
        'MANUFACTURER_MISSING',
        'COMPOSITION_MISSING',
        'STRENGTH_MISSING',
        'PACK_SIZE_MISSING',
        'SKU_MISSING',
        'RX_STATUS_MISSING',
        'PRICE_MISSING',
        'CURRENCY_MISSING',
        'NO_STOCK',
        'SERVICEABILITY_MISSING',
      ]),
    );
    expect(result.publishable).toBe(false);
  });

  it('allows composition not-applicable when declared', () => {
    const result = evaluateProductQuality({
      ...base,
      composition: null,
      compositionNotApplicable: true,
    });
    expect(result.blockers).not.toContain('COMPOSITION_MISSING');
  });

  it('rejects currency mismatch against country config', () => {
    const result = evaluateProductQuality({ ...base, currency: 'ABC', expectedCurrency: 'XXX' });
    expect(result.blockers).toContain('CURRENCY_MISMATCH');
  });
});

describe('validateImportRow', () => {
  it('accepts a valid authorized feed row', () => {
    expect(
      validateImportRow({
        sourceRowKey: 'row-1',
        productId: 'p1',
        sku: 'SKU-1',
        priceMinor: 1000,
        currency: 'XXX',
        stockQty: 4,
        countryCode: 'P4',
        expectedCurrency: 'XXX',
        expectedCountryCode: 'P4',
        sellerKnown: true,
        variantKnown: true,
      }),
    ).toEqual([]);
  });

  it('rejects invalid currency, stock, and unknown seller', () => {
    const reasons = validateImportRow({
      sourceRowKey: 'row-2',
      sku: 'SKU-1',
      priceMinor: -1,
      currency: 'inr',
      stockQty: -3,
      countryCode: 'ZZ',
      expectedCurrency: 'XXX',
      expectedCountryCode: 'P4',
      sellerKnown: false,
      variantKnown: false,
    });
    expect(reasons).toEqual(
      expect.arrayContaining([
        'INVALID_PRICE',
        'INVALID_CURRENCY',
        'INVALID_STOCK',
        'UNKNOWN_COUNTRY',
        'UNKNOWN_SELLER',
        'INVALID_VARIANT',
      ]),
    );
  });
});
