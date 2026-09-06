import { presentCatalogItem, presentCatalogList } from './catalog-admin-present';

describe('presentCatalogList', () => {
  it('maps Prisma admin item payloads to table rows', () => {
    const rows = presentCatalogList([
      {
        id: 'itm-1',
        slug: 'para-500',
        status: 'PUBLISHED',
        kind: 'MEDICINE',
        brand: { name: 'Demo' },
        translations: [{ title: 'Paracetamol 500', description: 'Fever relief' }],
        countries: [{ rxRequired: false, attributes: { manufacturer_name: 'Demo Labs', composition: 'PCM' } }],
        variants: [{ id: 'var-1', skuCode: 'DEMO-PARA-500' }],
      },
    ]);
    expect(rows[0]).toMatchObject({
      title: 'Paracetamol 500',
      description: 'Fever relief',
      brand_name: 'Demo',
      attributes: expect.objectContaining({ manufacturer_name: 'Demo Labs', composition: 'PCM' }),
      sku: 'DEMO-PARA-500',
      variant_id: 'var-1',
    });
    expect(presentCatalogItem({ slug: 'x' }, 0).title).toBe('x');
  });
});
