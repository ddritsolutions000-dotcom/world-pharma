import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '@world-pharma/ui-kit/web';
import { OrderItemReviewPanel } from './order-item-review';

jest.mock('./use-selected-country', () => ({
  useSelectedCountry: () => ({ country: 'IN', countryName: 'India' }),
}));

jest.mock('./commerce-api', () => ({
  fetchOwnProductReview: jest.fn().mockResolvedValue({ review: null }),
  submitProductReview: jest.fn(),
}));

describe('OrderItemReviewPanel', () => {
  it('renders review form for delivered order items', async () => {
    render(
      <ThemeProvider defaultTheme="light">
        <OrderItemReviewPanel
          token="tok"
          orderId="ord-1"
          items={[
            {
              id: 'line-1',
              sku: 'SKU1',
              title: 'Demo Medicine',
              catalog_item_id: 'item-1',
              product_slug: 'demo-medicine',
            },
          ]}
        />
      </ThemeProvider>,
    );
    expect(await screen.findByText('Rate your products')).toBeInTheDocument();
    expect(screen.getByText('Demo Medicine')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /submit review/i })).toBeInTheDocument();
  });
});
