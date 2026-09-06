import { evaluatePossibleDuplicate } from './catalog-duplicate';

describe('evaluatePossibleDuplicate', () => {
  const base = {
    title: 'Paracetamol 500',
    manufacturer: 'Acme Labs',
    composition: 'Paracetamol',
    strength: '500 mg',
    packSize: '10 tablets',
    sku: 'PCM-500-10',
  };

  it('flags POSSIBLE_DUPLICATE on matching manufacturer + name + strength', () => {
    const result = evaluatePossibleDuplicate(base, { ...base, sku: 'OTHER' });
    expect(result.possible).toBe(true);
    expect(result.match_keys).toEqual(
      expect.arrayContaining(['manufacturer', 'product_name', 'strength']),
    );
  });

  it('does not flag uncertain partial matches', () => {
    const result = evaluatePossibleDuplicate(base, {
      title: 'Ibuprofen',
      manufacturer: 'Acme Labs',
      composition: 'Ibuprofen',
      strength: '200 mg',
      packSize: '10 tablets',
      sku: 'IBU-200',
    });
    expect(result.possible).toBe(false);
  });
});
