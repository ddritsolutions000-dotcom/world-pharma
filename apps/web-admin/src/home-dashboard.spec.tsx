import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SessionProvider } from '@world-pharma/shell-web';
import { ThemeProvider } from '@world-pharma/ui-kit/web';
import { HomeDashboard } from './home-dashboard';

jest.mock('next/navigation', () => ({
  usePathname: () => '/',
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

const FULL_PERMISSIONS = [
  'analytics:read',
  'finance:read',
  'support:read',
  'partner:manage',
  'policy:read',
  'payment:read',
  'review:moderate',
  'promo:read',
  'identity:audit_read',
  'logistics:read',
  'order:read',
];

const overviewSample = {
  country_code: 'XX',
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
      metric_date: '2026-08-29',
      order_paid_count: 3,
      order_gmv_minor: '10000',
      checkout_started_count: 8,
      cart_abandoned_count: 1,
      affiliate_click_count: 2,
      appointment_completed_count: 1,
      lab_booking_completed_count: 0,
      imaging_booking_completed_count: 0,
      product_view_count: 40,
    },
    {
      metric_date: '2026-08-30',
      order_paid_count: 4,
      order_gmv_minor: '15000',
      checkout_started_count: 10,
      cart_abandoned_count: 2,
      affiliate_click_count: 3,
      appointment_completed_count: 0,
      lab_booking_completed_count: 1,
      imaging_booking_completed_count: 0,
      product_view_count: 70,
    },
    {
      metric_date: '2026-08-31',
      order_paid_count: 5,
      order_gmv_minor: '20000',
      checkout_started_count: 12,
      cart_abandoned_count: 2,
      affiliate_click_count: 3,
      appointment_completed_count: 1,
      lab_booking_completed_count: 0,
      imaging_booking_completed_count: 0,
      product_view_count: 90,
    },
  ],
  requested_by: '11111111-1111-4111-8111-111111111111',
};

const r14aSample = {
  engineering_config_status: 'R14_A_ENGINEERING_CONFIG_READY',
  readiness_status: 'R14_A_READINESS_INCOMPLETE',
  next_required_action: 'HUMAN_GATE_COLLECTION_REQUIRED',
  live_production_status: 'R14_A_LIVE_PRODUCTION_BLOCKED',
  book_263_production_evidence: 'NOT_CLAIMED',
  live_payment_enabled: false,
  owner_evidenced_count: 0,
  placeholder_count: 7,
  live_unlock_blocked_reason: 'PAYMENT_LIVE_ENABLED_OFF',
  note: 'Placeholders are not evidence.',
  gates: [],
};

const sampleOrder = {
  id: 'order-1',
  order_number: 'DEMO-SBX-001',
  status: 'CONFIRMED',
  total_minor: '2500',
  currency: 'XXX',
  created_at: '2026-08-31T12:00:00.000Z',
};

const sampleTicket = {
  id: '11111111-1111-4111-8111-111111111111',
  person_id: '22222222-2222-4222-8222-222222222222',
  country_id: '33333333-3333-4333-8333-333333333333',
  queue_id: '44444444-4444-4444-8444-444444444444',
  queue_code: 'CUSTOMER_GENERAL',
  status: 'OPEN',
  subject: 'Order question',
  reference_type: 'order',
  reference_id: '55555555-5555-4555-8555-555555555555',
  assignee_person_id: null,
  created_at: '2026-08-31T10:00:00.000Z',
  updated_at: '2026-08-31T11:00:00.000Z',
};

function mockSession(permissions: string[] = FULL_PERMISSIONS) {
  mockUseSession.mockReturnValue({
    getAccessToken: () => 'test-token',
    session: {
      audience: 'admin',
      permissions,
      countryCode: 'IN',
      status: 'authenticated',
    },
    signInWithOtp: jest.fn(),
    verifyOtpChallenge: jest.fn(),
    expire: jest.fn(),
    signOut: jest.fn(),
    setCountryCode: jest.fn(),
  });
}

function installFetchMock(options?: { analyticsOk?: boolean }) {
  const analyticsOk = options?.analyticsOk ?? true;
  (global.fetch as jest.Mock).mockImplementation(async (url: string) => {
    if (url.includes('/health/ready')) {
      return { ok: true, json: async () => ({ status: 'ready' }) };
    }
    if (url.includes('/admin/analytics/overview')) {
      return analyticsOk
        ? { ok: true, json: async () => overviewSample }
        : { ok: false, status: 500, json: async () => ({ detail: 'server_error' }) };
    }
    if (url.includes('/admin/finance/breaks')) {
      return { ok: true, json: async () => ({ data: [{ id: 'break-1' }, { id: 'break-2' }] }) };
    }
    if (url.includes('/admin/support/tickets')) {
      return { ok: true, json: async () => ({ data: [sampleTicket] }) };
    }
    if (url.includes('/admin/partners/applications')) {
      return {
        ok: true,
        json: async () => ({
          data: [
            { id: 'app-1', status: 'UNDER_REVIEW', partner_type_code: 'VENDOR' },
            { id: 'app-2', status: 'APPROVED', partner_type_code: 'VENDOR' },
          ],
        }),
      };
    }
    if (url.includes('/admin/orders')) {
      return { ok: true, json: async () => ({ data: [sampleOrder] }) };
    }
    if (url.includes('/admin/shipments')) {
      return {
        ok: true,
        json: async () => ({
          data: [{ id: 'ship-1', status: 'READY', tracking_number: 'WP-TRACK-001' }],
        }),
      };
    }
    if (url.includes('/admin/payments/r14a-gates')) {
      return { ok: true, json: async () => r14aSample };
    }
    if (url.includes('/admin/security-events')) {
      return {
        ok: true,
        json: async () => ({
          data: [
            {
              id: 'evt-1',
              type: 'AUTH_FAILURE',
              outcome: 'BLOCKED',
              created_at: '2026-08-31T10:00:00.000Z',
            },
          ],
        }),
      };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  });
}

function wrap(ui: React.ReactElement) {
  return render(
    <ThemeProvider defaultTheme="light">
      <SessionProvider initialAudience="admin">{ui}</SessionProvider>
    </ThemeProvider>,
  );
}

describe('HomeDashboard', () => {
  beforeEach(() => {
    mockSession();
    installFetchMock();
  });

  it('shows loading state before first refresh completes', () => {
    wrap(<HomeDashboard />);
    expect(screen.getByText(/Loading operations center/i)).toBeInTheDocument();
  });

  it('renders work queue items and attention tiles for a full admin role', async () => {
    wrap(<HomeDashboard />);
    expect(await screen.findByRole('heading', { name: /Executive control plane/i })).toBeInTheDocument();
    expect(await screen.findByText('DEMO-SBX-001')).toBeInTheDocument();
    expect(screen.getByText('Order question')).toBeInTheDocument();
    expect(screen.getByText(/VENDOR application/i)).toBeInTheDocument();
    expect(screen.getByText('WP-TRACK-001')).toBeInTheDocument();
    expect(screen.getByText(/Open support tickets/i)).toBeInTheDocument();
    expect(screen.getByText(/Partner reviews/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Finance breaks/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Orders paid/i)).toBeInTheDocument();
    expect(screen.getByText(/AUTH_FAILURE/i)).toBeInTheDocument();
    expect(screen.getByText(/API ready/i)).toBeInTheDocument();
  });

  it('shows quick module links', async () => {
    wrap(<HomeDashboard />);
    await screen.findByRole('heading', { name: /Quick modules/i });
    expect(screen.getByRole('button', { name: /Analytics/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Finance/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Payments$/i })).toBeInTheDocument();
  });

  it('hides finance attention tile for analytics-only role', async () => {
    mockSession(['analytics:read']);
    wrap(<HomeDashboard />);
    await screen.findByRole('heading', { name: /Executive control plane/i });
    expect(screen.getByText(/Orders paid/i)).toBeInTheDocument();
    expect(screen.queryByText(/Finance breaks/i)).not.toBeInTheDocument();
  });

  it('shows analytics error when overview API fails', async () => {
    installFetchMock({ analyticsOk: false });
    wrap(<HomeDashboard />);
    expect(await screen.findByText(/Analytics snapshot could not be loaded/i)).toBeInTheDocument();
  });

  it('does not expose PHI or payment secrets on the dashboard', async () => {
    wrap(<HomeDashboard />);
    await screen.findByRole('heading', { name: /Executive control plane/i });
    const raw = document.body.textContent?.toLowerCase() ?? '';
    expect(raw.includes('diagnosis')).toBe(false);
    expect(raw.includes('prescription')).toBe(false);
    expect(raw.includes('sk_live')).toBe(false);
    expect(raw.includes('vault_path')).toBe(false);
    expect(raw.includes('webhook_secret')).toBe(false);
  });

  it('shows shipments in work queue when logistics:read is granted', async () => {
    mockSession(['logistics:read']);
    wrap(<HomeDashboard />);
    expect(await screen.findByText('WP-TRACK-001')).toBeInTheDocument();
  });

  it('refreshes when refresh is clicked', async () => {
    const user = userEvent.setup();
    wrap(<HomeDashboard />);
    await screen.findByRole('heading', { name: /Executive control plane/i });
    await user.click(screen.getByRole('button', { name: /^Refresh$/i }));
    expect(global.fetch).toHaveBeenCalled();
  });
});
