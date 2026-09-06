import { partnerFieldLabel, parseCatalogAttributes, sanitizeApplicationFields, sanitizeCatalogAttributes } from './partner-fields';

describe('partnerFieldLabel', () => {
  it('returns known labels', () => {
    expect(partnerFieldLabel('legal_name')).toBe('Legal business name');
  });

  it('falls back to humanized code', () => {
    expect(partnerFieldLabel('custom_field')).toBe('custom field');
  });
});

describe('sanitizeApplicationFields', () => {
  it('keeps valid string fields and drops invalid keys', () => {
    expect(
      sanitizeApplicationFields({
        legal_name: ' Acme Ltd ',
        'bad-key': 'x',
        empty: '   ',
        num: 42,
      }),
    ).toEqual({ legal_name: 'Acme Ltd' });
  });
});

describe('parseCatalogAttributes', () => {
  it('parses manufacturer and composition from JSON attributes', () => {
    expect(
      parseCatalogAttributes({
        manufacturer_name: 'PharmaCo',
        country_of_manufacture: 'DE',
        highlights: ['Fast relief', 1],
        composition: 'Paracetamol 500mg',
      }),
    ).toEqual({
      manufacturer_name: 'PharmaCo',
      country_of_manufacture: 'DE',
      highlights: ['Fast relief'],
      composition: 'Paracetamol 500mg',
      composition_not_applicable: false,
      dosage_form: null,
      warnings: null,
      storage: null,
      usage_directions: null,
    });
  });
});

describe('sanitizeCatalogAttributes', () => {
  it('clips highlights and drops empty strings', () => {
    expect(
      sanitizeCatalogAttributes({
        manufacturer_name: '  Acme  ',
        highlights: ['A', '', 'B'.repeat(300)],
        composition: '  salt  ',
      }),
    ).toMatchObject({
      manufacturer_name: 'Acme',
      composition: 'salt',
    });
    const sanitized = sanitizeCatalogAttributes({ highlights: ['B'.repeat(300)] });
    expect(sanitized.highlights?.[0]?.length).toBe(200);
  });
});
