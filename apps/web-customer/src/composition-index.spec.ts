import { compositionSlug } from './composition-index';

describe('compositionSlug', () => {
  it('normalizes salt names for index URLs', () => {
    expect(compositionSlug('Paracetamol 500 mg')).toBe('paracetamol-500-mg');
    expect(compositionSlug('  Vitamin D3  ')).toBe('vitamin-d3');
  });
});
