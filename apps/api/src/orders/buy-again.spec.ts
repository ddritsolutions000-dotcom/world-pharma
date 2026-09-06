import { aggregateBuyAgain } from './buy-again';

describe('aggregateBuyAgain', () => {
  it('groups repeat SKUs and skips cancelled orders', () => {
    const rows = aggregateBuyAgain([
      {
        createdAt: new Date('2026-08-01T00:00:00.000Z'),
        status: 'DELIVERED',
        items: [
          {
            offerId: 'offer-para',
            variantId: 'var-para',
            sku: 'DEMO-PARA-500',
            title: 'Paracetamol 500',
            qty: 2,
            rxRequired: false,
          },
        ],
      },
      {
        createdAt: new Date('2026-08-20T00:00:00.000Z'),
        status: 'SHIPPED',
        items: [
          {
            offerId: 'offer-para',
            variantId: 'var-para',
            sku: 'DEMO-PARA-500',
            title: 'Paracetamol 500',
            qty: 1,
            rxRequired: false,
          },
        ],
      },
      {
        createdAt: new Date('2026-08-21T00:00:00.000Z'),
        status: 'CANCELLED',
        items: [
          {
            offerId: 'offer-vit',
            variantId: 'var-vit',
            sku: 'DEMO-VIT-D3',
            title: 'Vitamin D3',
            qty: 1,
            rxRequired: false,
          },
        ],
      },
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.offer_id).toBe('offer-para');
    expect(rows[0]?.times_ordered).toBe(2);
    expect(rows[0]?.last_qty).toBe(1);
    expect(rows[0]?.last_ordered_at).toBe('2026-08-20T00:00:00.000Z');
  });
});
