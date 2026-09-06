import { mergeGuestCartForCountry } from './guest-cart-merge';
import { addGuestCartLine, GUEST_CART_KEY, readGuestCart } from './guest-cart';
import { addCartItem } from './commerce-api';

jest.mock('./commerce-api', () => ({
  addCartItem: jest.fn(),
  notifyCartChanged: jest.fn(),
}));

const addCartItemMock = addCartItem as jest.MockedFunction<typeof addCartItem>;

describe('mergeGuestCartForCountry', () => {
  beforeEach(() => {
    window.localStorage.removeItem(GUEST_CART_KEY);
    addCartItemMock.mockReset();
  });

  it('keeps conflicting guest lines and merges the rest', async () => {
    addGuestCartLine({
      offer_id: 'off-ok',
      qty: 1,
      title: 'A',
      currency: 'INR',
      sell_minor: '1',
      country: 'IN',
      seller_org_id: 'seller-a',
    });
    addGuestCartLine({
      offer_id: 'off-conflict',
      qty: 1,
      title: 'B',
      currency: 'INR',
      sell_minor: '1',
      country: 'IN',
      seller_org_id: 'seller-a',
    });
    addCartItemMock.mockImplementation(async (_token, _country, offerId) => {
      if (offerId === 'off-conflict') {
        throw Object.assign(new Error('conflict'), { code: 'CART_SELLER_CONFLICT', status: 409 });
      }
      return {};
    });

    const result = await mergeGuestCartForCountry('tok', 'IN');
    expect(result.merged).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.conflict).toBe(true);
    expect(readGuestCart('IN').map((row) => row.offer_id)).toEqual(['off-conflict']);
  });
});
