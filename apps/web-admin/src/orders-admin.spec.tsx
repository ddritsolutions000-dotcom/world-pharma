import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SessionProvider } from '@world-pharma/shell-web';
import { ThemeProvider } from '@world-pharma/ui-kit/web';
import { OrdersAdminPanel } from './orders-admin';

jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(''),
  usePathname: () => '/orders',
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

const mockUseSession = jest.fn();

jest.mock('@world-pharma/shell-web', () => {
  const actual = jest.requireActual('@world-pharma/shell-web');
  return {
    ...actual,
    useSession: () => mockUseSession(),
  };
});

const sampleOrder = {
  id: 'order-1',
  order_number: 'DEMO-SBX-001',
  status: 'ALLOCATED',
  total_minor: '2500',
  currency: 'XXX',
  items: [{ id: 'line-1', sku: 'DEMO-PARA-500', qty: 1, line_minor: '2500' }],
  history: [{ toStatus: 'ALLOCATED', reason: 'allocated', createdAt: '2026-08-31T12:00:00.000Z' }],
  shipments: [],
};

function installFetchMock() {
  (global.fetch as jest.Mock).mockImplementation(async (url: string, init?: RequestInit) => {
    if (url.includes('/admin/orders/order-1') && init?.method !== 'POST') {
      return { ok: true, json: async () => sampleOrder };
    }
    if (url.includes('/admin/orders/order-1/pick/start')) {
      return {
        ok: true,
        json: async () => ({ ...sampleOrder, status: 'PICKING' }),
      };
    }
    if (url.includes('/admin/orders')) {
      return { ok: true, json: async () => ({ data: [sampleOrder] }) };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  });
}

describe('OrdersAdminPanel', () => {
  beforeEach(() => {
    mockUseSession.mockReturnValue({
      getAccessToken: () => 'test-token',
      session: {
        status: 'authenticated',
        audience: 'admin',
        permissions: ['order:read', 'order:fulfill', 'order:cancel', 'order:admin'],
      },
      signOut: jest.fn(),
      expire: jest.fn(),
    });
    installFetchMock();
  });

  it('does not mention DHL or settlement payout', async () => {
    render(
      <ThemeProvider defaultTheme="light">
        <SessionProvider initialAudience="admin">
          <OrdersAdminPanel />
        </SessionProvider>
      </ThemeProvider>,
    );
    expect(await screen.findByRole('heading', { name: 'Orders' })).toBeInTheDocument();
    expect(screen.queryByText(/dhl|fedex|ups/i)).not.toBeInTheDocument();
  });

  it('loads order detail and runs fulfillment action', async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider defaultTheme="light">
        <SessionProvider initialAudience="admin">
          <OrdersAdminPanel />
        </SessionProvider>
      </ThemeProvider>,
    );
    expect(await screen.findByText('DEMO-SBX-001')).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: 'Manage' })[0]);
    expect(await screen.findByText('DEMO-PARA-500')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Start pick' }));
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/admin/orders/order-1/pick/start'),
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });
});
