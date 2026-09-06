import { render, screen } from '@testing-library/react';
import { SessionProvider } from '@world-pharma/shell-web';
import { ThemeProvider } from '@world-pharma/ui-kit/web';
import { CarePlanPage } from './care-plan-page';

jest.mock('next/navigation', () => ({
  usePathname: () => '/care-plan',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('./use-selected-country', () => ({
  useSelectedCountry: () => ({ country: 'IN', countryName: 'India' }),
}));

jest.mock('./care-plan-api', () => ({
  fetchCarePlanCatalog: async () => ({
    sandbox: true,
    data: [
      {
        id: 'diabetes',
        name: 'Diabetes Care Plan',
        price_label: '₹549/year',
        discount_bps: 1500,
        free_delivery: false,
        featured: true,
        perks: ['15% off medicines at checkout'],
      },
    ],
  }),
  fetchMyCarePlan: async () => ({ ok: false, kind: 'error' }),
  subscribeCarePlan: async () => ({ ok: false, kind: 'error' }),
  cancelCarePlan: async () => ({ ok: false, kind: 'error' }),
}));

describe('CarePlanPage', () => {
  it('renders catalog plans for guests', async () => {
    render(
      <ThemeProvider defaultTheme="light">
        <SessionProvider>
          <CarePlanPage />
        </SessionProvider>
      </ThemeProvider>,
    );
    expect(await screen.findByText('Diabetes Care Plan')).toBeInTheDocument();
    expect(screen.getByText('Health Plans')).toBeInTheDocument();
  });
});
