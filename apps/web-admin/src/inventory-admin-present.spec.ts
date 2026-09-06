import { presentLocations, presentLots, presentReceipts } from './inventory-admin-present';

describe('inventory-admin-present', () => {
  it('maps Prisma camelCase locations and lot envelopes', () => {
    expect(
      presentLocations([{ id: 'loc-1', name: 'Gurgaon DC', kind: 'WAREHOUSE', postalCode: '122001' }]),
    ).toEqual([
      {
        id: 'loc-1',
        name: 'Gurgaon DC',
        kind: 'WAREHOUSE',
        city: '',
        postal_code: '122001',
      },
    ]);
    expect(
      presentLots({
        data: [{ id: 'lot-1', sku: 'PARA-500', available: 12, onHand: 12, status: 'ACTIVE', lotCode: 'L1' }],
      }),
    ).toMatchObject([{ id: 'lot-1', sku: 'PARA-500', available: 12, on_hand: 12, lot_code: 'L1' }]);
  });

  it('counts goods-receipt lines', () => {
    expect(presentReceipts([{ id: 'g1', status: 'DRAFT', locationId: 'loc-1', lines: [{}, {}] }])).toEqual([
      { id: 'g1', status: 'DRAFT', location_id: 'loc-1', line_count: 2 },
    ]);
  });
});
