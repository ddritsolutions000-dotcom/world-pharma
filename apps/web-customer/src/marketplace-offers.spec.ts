import { cheapestOffer, distinctSellerCount, offersForPack, packLabel, uniquePackLabels, cheapestInStockOffer, sellerSelectionReason } from './marketplace-offers';

const a = {
  id: 'a',
  seller_org_id: 's1',
  seller_display_name: 'Pharmacy A',
  pack_size: '10 tablets',
  currency: 'INR',
  price: { sell_minor: '20000' },
};
const b = {
  id: 'b',
  seller_org_id: 's2',
  seller_display_name: 'Pharmacy B',
  pack_size: '10 tablets',
  currency: 'INR',
  price: { sell_minor: '18000' },
};
const c = {
  id: 'c',
  seller_org_id: 's1',
  seller_display_name: 'Pharmacy A',
  pack_size: '15 tablets',
  currency: 'INR',
  price: { sell_minor: '25000' },
};

describe('marketplace offers', () => {
  it('picks the cheapest published seller', () => {
    expect(cheapestOffer([a, b])?.id).toBe('b');
  });

  it('groups packs and sellers', () => {
    expect(uniquePackLabels([a, b, c])).toEqual(['10 tablets', '15 tablets']);
    expect(offersForPack([a, b, c], '10 tablets')).toEqual([a, b]);
    expect(packLabel({ pack_size: null })).toBe('Standard pack');
    expect(distinctSellerCount([a, b, c])).toBe(2);
  });

  it('prefers in-stock offers for default selection', () => {
    const expensiveInStock = { ...a, inventory: { available: true, qty: 5 } };
    const cheapOos = { ...b, inventory: { available: false, qty: 0 } };
    expect(cheapestInStockOffer([expensiveInStock, cheapOos])?.id).toBe('a');
  });

  it('explains seller selection when multiple pharmacies exist', () => {
    const inStockB = { ...b, inventory: { available: true, qty: 8 } };
    expect(sellerSelectionReason(inStockB, [a, inStockB])).toMatch(/lowest price/i);
  });
});
