import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ThemeProvider } from '@world-pharma/ui-kit/web';
import { StoreSearchBox } from './store-search-box';

const mockPush = jest.fn();
const mockFetchDiscoverySuggest = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('./discovery-api', () => ({
  fetchDiscoverySuggest: (...args: unknown[]) => mockFetchDiscoverySuggest(...args),
  DISCOVERY_TYPE_LABELS: {
    commerce: 'Products',
    help: 'Help',
    doctor: 'Doctors',
    lab: 'Labs',
    test: 'Tests',
    pharmacy: 'Pharmacies',
  },
}));

describe('StoreSearchBox', () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockFetchDiscoverySuggest.mockReset();
    mockFetchDiscoverySuggest.mockResolvedValue({
      data: [
        {
          type: 'commerce',
          id: '1',
          title: 'Paracetamol 500mg',
          subtitle: 'Demo Pharma',
          slug: 'paracetamol',
          href: '/p/paracetamol',
        },
      ],
    });
  });

  it('navigates to search page on submit', () => {
    render(
      <ThemeProvider defaultTheme="light">
        <StoreSearchBox country="XX" />
      </ThemeProvider>,
    );

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'para' } });
    fireEvent.submit(screen.getByRole('search'));

    expect(mockPush).toHaveBeenCalledWith('/search?q=para');
  });

  it('adds a medicines tab when that scope is selected', () => {
    render(
      <ThemeProvider defaultTheme="light">
        <StoreSearchBox country="XX" />
      </ThemeProvider>,
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Medicines' }));
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'para' } });
    fireEvent.submit(screen.getByRole('search'));

    expect(mockPush).toHaveBeenCalledWith('/search?q=para&tab=commerce');
  });

  it('shows suggestions after typing', async () => {
    render(
      <ThemeProvider defaultTheme="light">
        <StoreSearchBox country="XX" />
      </ThemeProvider>,
    );

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'para' } });

    await waitFor(() => {
      expect(mockFetchDiscoverySuggest).toHaveBeenCalled();
    });
    expect(await screen.findByText('Paracetamol 500mg')).toBeInTheDocument();
  });
});
