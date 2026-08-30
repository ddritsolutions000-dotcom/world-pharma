import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SessionProvider } from '@world-pharma/shell-web';
import { ThemeProvider } from '@world-pharma/ui-kit/web';
import { AnalyticsApiError } from './analytics-api';
import { AnalyticsCommerce } from './analytics-commerce';
import { AnalyticsMarketingView } from './analytics-marketing-view';
import { AnalyticsOverview } from './analytics-overview';

jest.mock('next/navigation', () => ({
  usePathname: () => '/analytics',
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

const overviewSample = {
  country_code: 'TR',
  from: '2026-08-01',
  to: '2026-08-31',
  totals: {
    order_paid_count: 12,
    order_gmv_minor: '45000',
    checkout_started_count: 30,
    cart_abandoned_count: 5,
    affiliate_click_count: 8,
    appointment_completed_count: 2,
    lab_booking_completed_count: 1,
    imaging_booking_completed_count: 0,
    product_view_count: 200,
  },
  daily: [
    {
      metric_date: '2026-08-15',
      order_paid_count: 12,
      order_gmv_minor: '45000',
      checkout_started_count: 30,
      cart_abandoned_count: 5,
      affiliate_click_count: 8,
      appointment_completed_count: 2,
      lab_booking_completed_count: 1,
      imaging_booking_completed_count: 0,
      product_view_count: 200,
    },
  ],
  requested_by: '11111111-1111-4111-8111-111111111111',
};

const commerceSample = {
  country_code: 'TR',
  from: '2026-08-01',
  to: '2026-08-31',
  catalog_item_id: null,
  items: [
    {
      metric_date: '2026-08-15',
      catalog_item_id: '22222222-2222-4222-8222-222222222222',
      view_count: 40,
      add_to_cart_count: 10,
      purchase_count: 3,
    },
  ],
  requested_by: '11111111-1111-4111-8111-111111111111',
};

const marketingSample = {
  country_code: 'TR',
  from: '2026-08-01',
  to: '2026-08-31',
  daily: [
    {
      metric_date: '2026-08-15',
      campaign_send_count: 25,
      marketing_opt_in_count: 100,
    },
  ],
  requested_by: '11111111-1111-4111-8111-111111111111',
};

const mockUseSession = jest.fn();

jest.mock('@world-pharma/shell-web', () => {
  const actual = jest.requireActual('@world-pharma/shell-web');
  return {
    ...actual,
    useSession: () => mockUseSession(),
  };
});

function mockSession(permissions: string[] = ['analytics:read']) {
  mockUseSession.mockReturnValue({
    getAccessToken: () => 'test-token',
    session: {
      audience: 'admin',
      permissions,
      countryCode: 'TR',
      status: 'authenticated',
    },
    signInWithOtp: jest.fn(),
    verifyOtpChallenge: jest.fn(),
    expire: jest.fn(),
    signOut: jest.fn(),
    setCountryCode: jest.fn(),
  });
}

function wrap(ui: React.ReactElement) {
  return render(
    <ThemeProvider defaultTheme="light">
      <SessionProvider initialAudience="admin">{ui}</SessionProvider>
    </ThemeProvider>,
  );
}

describe('analytics-api helpers', () => {
  it('AnalyticsApiError carries status', () => {
    const err = new AnalyticsApiError('forbidden', 403);
    expect(err.status).toBe(403);
  });
});

describe('AnalyticsOverview', () => {
  beforeEach(() => {
    mockSession();
    (global.fetch as jest.Mock).mockImplementation(async (url: string) => {
      if (url.includes('/admin/analytics/overview')) {
        return { ok: true, json: async () => overviewSample };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });
  });

  it('renders overview KPI totals deterministically', async () => {
    wrap(<AnalyticsOverview />);
    expect(await screen.findByRole('heading', { name: /Analytics/i })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: /Totals \(TR\)/i })).toBeInTheDocument();
    expect(await screen.findByText(/Orders paid/i)).toBeInTheDocument();
    expect(screen.getAllByText('12').length).toBeGreaterThan(0);
    expect(screen.getAllByText('45,000').length).toBeGreaterThan(0);
    const raw = document.body.textContent?.toLowerCase() ?? '';
    expect(raw.includes('diagnosis')).toBe(false);
    expect(raw.includes('prescription')).toBe(false);
  });

  it('shows permission denied without analytics:read', async () => {
    mockSession([]);
    wrap(<AnalyticsOverview />);
    expect(await screen.findByText(/You do not have access/i)).toBeInTheDocument();
  });

  it('shows permission denied on API 403', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ detail: 'Analytics is not enabled for this country.' }),
    });
    wrap(<AnalyticsOverview />);
    expect(await screen.findByText(/You do not have access/i)).toBeInTheDocument();
  });

  it('shows network error with retry for invalid country scope', async () => {
    const user = userEvent.setup();
    wrap(<AnalyticsOverview />);
    await screen.findByRole('heading', { name: /Analytics/i });
    const countryInput = screen.getByLabelText(/Country code/i);
    await user.clear(countryInput);
    await user.type(countryInput, 'X');
    expect(await screen.findByText(/Country code must be two letters/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Retry/i })).toBeInTheDocument();
  });

  it('shows empty state when totals are zero', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ...overviewSample,
        totals: {
          order_paid_count: 0,
          order_gmv_minor: '0',
          checkout_started_count: 0,
          cart_abandoned_count: 0,
          affiliate_click_count: 0,
          appointment_completed_count: 0,
          lab_booking_completed_count: 0,
          imaging_booking_completed_count: 0,
          product_view_count: 0,
        },
        daily: [],
      }),
    });
    wrap(<AnalyticsOverview />);
    expect(await screen.findByText(/No overview metrics/i)).toBeInTheDocument();
  });
});

describe('AnalyticsCommerce', () => {
  beforeEach(() => {
    mockSession();
    (global.fetch as jest.Mock).mockImplementation(async (url: string) => {
      if (url.includes('/admin/analytics/commerce')) {
        return { ok: true, json: async () => commerceSample };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });
  });

  it('renders commerce funnel rows', async () => {
    wrap(<AnalyticsCommerce />);
    expect(await screen.findByRole('heading', { name: /Product funnel/i })).toBeInTheDocument();
    expect(screen.getByText('40')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });
});

describe('AnalyticsMarketingView', () => {
  beforeEach(() => {
    mockSession();
    (global.fetch as jest.Mock).mockImplementation(async (url: string) => {
      if (url.includes('/admin/analytics/marketing')) {
        return { ok: true, json: async () => marketingSample };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });
  });

  it('renders marketing rollup table', async () => {
    wrap(<AnalyticsMarketingView />);
    expect(await screen.findByRole('heading', { name: /Marketing rollups/i })).toBeInTheDocument();
    expect(screen.getByText('25')).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();
  });
});
