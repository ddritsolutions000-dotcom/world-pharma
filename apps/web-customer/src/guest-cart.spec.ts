import {
  addGuestCartLine,
  clearGuestCart,
  guestCartQty,
  GUEST_CART_KEY,
  GuestCartError,
  readGuestCart,
  removeGuestCartLine,
  updateGuestCartQty,
} from './guest-cart';

describe('guest cart', () => {
  beforeEach(() => {
    window.localStorage.removeItem(GUEST_CART_KEY);
  });

  it('adds and totals lines for one country', () => {
    addGuestCartLine({
      offer_id: 'off-1',
      qty: 1,
      title: 'Demo syrup',
      currency: 'INR',
      sell_minor: '12000',
      country: 'IN',
      seller_org_id: 'seller-a',
    });
    addGuestCartLine({
      offer_id: 'off-1',
      qty: 2,
      title: 'Demo syrup',
      currency: 'INR',
      sell_minor: '12000',
      country: 'IN',
      seller_org_id: 'seller-a',
    });
    expect(guestCartQty('IN')).toBe(3);
    expect(readGuestCart('IN')).toHaveLength(1);
  });

  it('rejects a second seller in the same country', () => {
    addGuestCartLine({
      offer_id: 'off-1',
      qty: 1,
      title: 'A',
      currency: 'INR',
      sell_minor: '1',
      country: 'IN',
      seller_org_id: 'seller-a',
    });
    expect(() =>
      addGuestCartLine({
        offer_id: 'off-2',
        qty: 1,
        title: 'B',
        currency: 'INR',
        sell_minor: '1',
        country: 'IN',
        seller_org_id: 'seller-b',
      }),
    ).toThrow(GuestCartError);
  });

  it('updates qty and removes a line', () => {
    addGuestCartLine({
      offer_id: 'off-1',
      qty: 1,
      title: 'A',
      currency: 'INR',
      sell_minor: '1',
      country: 'IN',
    });
    updateGuestCartQty('IN', 'off-1', 4);
    expect(guestCartQty('IN')).toBe(4);
    removeGuestCartLine('IN', 'off-1');
    expect(readGuestCart('IN')).toEqual([]);
  });

  it('clears only the selected country', () => {
    addGuestCartLine({
      offer_id: 'off-1',
      qty: 1,
      title: 'IN item',
      currency: 'INR',
      sell_minor: '1',
      country: 'IN',
    });
    addGuestCartLine({
      offer_id: 'off-2',
      qty: 1,
      title: 'AE item',
      currency: 'AED',
      sell_minor: '1',
      country: 'AE',
    });
    clearGuestCart('IN');
    expect(readGuestCart('IN')).toEqual([]);
    expect(readGuestCart('AE')).toHaveLength(1);
  });
});
