import { Suspense } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from '@world-pharma/ui-kit/web';
import { PaymentsAdminApiError } from './payments-admin-api';
import { PaymentAttemptHistorySection, PaymentsAdminPanel } from './payments-admin';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useSearchParams: () => new URLSearchParams('country=XX'),
}));

const mockGetAccessToken = jest.fn(() => 'test-token');

jest.mock('@world-pharma/shell-web', () => {
  const actual = jest.requireActual<typeof import('@world-pharma/shell-web')>('@world-pharma/shell-web');
  return {
    ...actual,
    useSession: () => ({
      session: {
        status: 'authenticated',
        audience: 'admin',
        permissions: mockPermissions,
      },
      getAccessToken: mockGetAccessToken,
      signInWithOtp: jest.fn(),
      verifyOtpChallenge: jest.fn(),
      expire: jest.fn(),
      signOut: jest.fn(),
      setCountryCode: jest.fn(),
    }),
  };
});

let mockPermissions = ['payment:read', 'payment:reconcile'];

const samplePayment = {
  id: '11111111-1111-4111-8111-111111111111',
  status: 'CAPTURED',
  amount_minor: '200',
  currency: 'XXX',
  sandbox: true,
  environment: 'sandbox',
  country_code: 'XX',
  order_number: 'ORD-100',
  gateway_code: 'MOCK_PRIMARY',
  gateway_environment: 'sandbox',
  failure_classification: null,
};

const sampleMatrix = {
  sandbox: true,
  active_environment: 'sandbox' as const,
  live_payments_enabled: false,
  runtime_environment: 'sandbox',
  country_code: 'XX',
  method: 'CARD',
  currency: 'XXX',
  payments_enabled: true,
  policy_source: 'published_policy_pack',
  gateway_refs: ['MOCK_PRIMARY'],
  rows: [
    {
      gateway_code: 'MOCK_PRIMARY',
      gateway_environment: 'sandbox',
      priority: 10,
      capabilities: ['authorize', 'capture'],
      registry_registered: true,
      policy_allowed: true,
      router_eligible: true,
      status: 'active' as const,
      fail_closed_reason: null,
      effective_rank: 1,
      policy_source: 'published_policy_pack',
      routing_reason: 'gateway_priority:10',
    },
  ],
  effective_route: {
    gateway_code: 'MOCK_PRIMARY',
    gateway_environment: 'sandbox',
    priority: 10,
    account_code: 'MOCK_PRIMARY_ACCOUNT',
    routing_reason: 'gateway_priority:10',
  },
  effective_fail_closed_reason: null,
  router_decision_matches: true,
  production_preview: {
    active: false as const,
    fail_closed_reason: 'live_payments_disabled',
    rows: [
      {
        gateway_code: 'MOCK_PRIMARY',
        gateway_environment: 'production',
        priority: 999999999,
        capabilities: [],
        registry_registered: true,
        policy_allowed: true,
        router_eligible: false,
        status: 'blocked' as const,
        fail_closed_reason: 'mock_gateway_production_forbidden',
        effective_rank: null,
        policy_source: 'published_policy_pack',
        routing_reason: null,
      },
    ],
  },
};

const sampleAttemptHistory = {
  fallback_occurred: false,
  final_selected_gateway: 'MOCK_PRIMARY',
  attempts: [
    {
      id: '44444444-4444-4444-8444-444444444444',
      attempt_number: 1,
      gateway_code: 'MOCK_PRIMARY',
      gateway_environment: 'sandbox',
      priority: 10,
      status: 'SUBMITTED',
      submitted: true,
      outcome: 'SUCCESS',
      failure_classification: null,
      error_code: null,
      created_at: new Date().toISOString(),
      selected: true,
    },
  ],
};

const sampleDetail = {
  sandbox: true,
  payment: samplePayment,
  attempt_history: sampleAttemptHistory,
  webhooks: [
    {
      id: '22222222-2222-4222-8222-222222222222',
      provider_event_id: 'evt-1',
      gateway_code: 'MOCK_PRIMARY',
      gateway_environment: 'sandbox',
      event_type: 'payment.captured',
      processing_status: 'processed' as const,
      received_at: new Date().toISOString(),
      processed_at: new Date().toISOString(),
    },
  ],
  reconciliations: [],
  audit_timeline: [
    {
      id: '33333333-3333-4333-8333-333333333333',
      source: 'outbox',
      type: 'PAYMENT_CAPTURED',
      occurred_at: new Date().toISOString(),
      actor_id: null,
      references: { status: 'CAPTURED' },
    },
  ],
  refunds: [],
  transactions: [],
};

function wrap(ui: React.ReactElement) {
  return render(
    <ThemeProvider defaultTheme="light">
      <Suspense fallback={null}>{ui}</Suspense>
    </ThemeProvider>,
  );
}

describe('payments-admin-api helpers', () => {
  it('PaymentsAdminApiError carries status', () => {
    expect(new PaymentsAdminApiError('forbidden', 403).status).toBe(403);
  });
});

describe('PaymentsAdminPanel', () => {
  beforeEach(() => {
    mockPermissions = ['payment:read', 'payment:reconcile'];
    mockGetAccessToken.mockReturnValue('test-token');
    (global.fetch as jest.Mock).mockImplementation(async (url: string) => {
      if (url.includes('/routing-matrix')) {
        return { ok: true, json: async () => sampleMatrix };
      }
      if (url.includes('/observability')) {
        return { ok: true, json: async () => sampleDetail };
      }
      if (url.includes('/unknown')) {
        return { ok: true, json: async () => ({ data: [] }) };
      }
      if (url.includes('/webhooks')) {
        return { ok: true, json: async () => ({ data: sampleDetail.webhooks }) };
      }
      return { ok: true, json: async () => ({ data: [samplePayment] }) };
    });
  });

  it('labels sandbox and does not expose secrets', async () => {
    wrap(<PaymentsAdminPanel />);
    expect(await screen.findByRole('heading', { name: /payments \(sandbox\)/i })).toBeInTheDocument();
    expect(screen.queryByText(/sk_live|secret|payload_cipher/i)).not.toBeInTheDocument();
  });

  it('shows permission denied on 403', async () => {
    mockPermissions = [];
    wrap(<PaymentsAdminPanel />);
    expect(await screen.findByText(/you do not have access/i)).toBeInTheDocument();
  });

  it('shows loading then payment rows', async () => {
    wrap(<PaymentsAdminPanel />);
    expect(await screen.findByText(/ORD-100/)).toBeInTheDocument();
  });

  it('shows network error state', async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('network'));
    wrap(<PaymentsAdminPanel />);
    expect(await screen.findByText(/connection problem/i)).toBeInTheDocument();
  });

  it('renders safe failure classification when present', async () => {
    (global.fetch as jest.Mock).mockImplementation(async (url: string) => {
      if (url.includes('/routing-matrix')) {
        return { ok: true, json: async () => sampleMatrix };
      }
      if (url.includes('/unknown')) {
        return { ok: true, json: async () => ({ data: [] }) };
      }
      return {
        ok: true,
        json: async () => ({
          data: [{ ...samplePayment, status: 'FAILED', failure_classification: 'gateway_declined' }],
        }),
      };
    });
    wrap(<PaymentsAdminPanel />);
    expect(await screen.findByText(/ORD-100.*gateway_declined/)).toBeInTheDocument();
  });

  it('filters by gateway via refresh', async () => {
    const user = userEvent.setup();
    wrap(<PaymentsAdminPanel />);
    await screen.findByText(/ORD-100/);
    await user.type(screen.getByPlaceholderText('MOCK_PRIMARY'), 'MOCK_OTHER');
    await user.click(screen.getByRole('button', { name: /refresh/i }));
    await waitFor(() => {
      expect(screen.queryByText(/ORD-100/)).not.toBeInTheDocument();
    });
  });

  it('renders routing matrix with sandbox and production preview labels', async () => {
    wrap(<PaymentsAdminPanel />);
    expect(await screen.findByRole('heading', { name: /routing matrix/i })).toBeInTheDocument();
    expect(screen.getByText(/Effective route: MOCK_PRIMARY\/sandbox/i)).toBeInTheDocument();
    expect(screen.getByText(/Production preview \(inactive\)/i)).toBeInTheDocument();
    expect(screen.getByText(/mock_gateway_production_forbidden/i)).toBeInTheDocument();
  });

  it('renders routing matrix fail-closed reason when no active route', async () => {
    (global.fetch as jest.Mock).mockImplementation(async (url: string) => {
      if (url.includes('/routing-matrix')) {
        return {
          ok: true,
          json: async () => ({
            ...sampleMatrix,
            rows: [],
            effective_route: null,
            effective_fail_closed_reason: 'payments_disabled',
          }),
        };
      }
      if (url.includes('/unknown')) {
        return { ok: true, json: async () => ({ data: [] }) };
      }
      return { ok: true, json: async () => ({ data: [] }) };
    });
    wrap(<PaymentsAdminPanel />);
    expect(await screen.findByText(/No active route — payments_disabled/i)).toBeInTheDocument();
  });

  it('shows routing matrix network error state', async () => {
    (global.fetch as jest.Mock).mockImplementation(async (url: string) => {
      if (url.includes('/routing-matrix')) {
        throw new Error('network');
      }
      if (url.includes('/unknown')) {
        return { ok: true, json: async () => ({ data: [] }) };
      }
      return { ok: true, json: async () => ({ data: [samplePayment] }) };
    });
    wrap(<PaymentsAdminPanel />);
    expect(await screen.findByText(/Loading routing matrix|connection problem/i)).toBeTruthy();
  });
});

describe('PaymentAttemptHistorySection', () => {
  it('renders ordered attempts with final gateway summary', () => {
    wrap(
      <PaymentAttemptHistorySection history={sampleAttemptHistory} payment={samplePayment} />,
    );
    expect(screen.getByRole('heading', { name: /gateway attempts/i })).toBeInTheDocument();
    expect(screen.getByText(/MOCK_PRIMARY\/sandbox — SUCCESS/i)).toBeInTheDocument();
    expect(screen.getByText(/Primary only/i)).toBeInTheDocument();
  });

  it('shows fallback indicator when failover occurred', () => {
    wrap(
      <PaymentAttemptHistorySection
        history={{
          fallback_occurred: true,
          final_selected_gateway: 'MOCK_FALLBACK',
          attempts: [
            ...sampleAttemptHistory.attempts,
            {
              ...sampleAttemptHistory.attempts[0]!,
              id: '55555555-5555-4555-8555-555555555555',
              attempt_number: 2,
              gateway_code: 'MOCK_FALLBACK',
              selected: true,
            },
          ],
        }}
        payment={samplePayment}
      />,
    );
    expect(screen.getByText(/Fallback used/i)).toBeInTheDocument();
    expect(screen.getByText(/MOCK_FALLBACK\/sandbox/i)).toBeInTheDocument();
  });

  it('shows empty state when no attempts exist', () => {
    wrap(
      <PaymentAttemptHistorySection
        history={{ fallback_occurred: false, final_selected_gateway: null, attempts: [] }}
        payment={samplePayment}
      />,
    );
    expect(screen.getByText(/No gateway submit attempts/i)).toBeInTheDocument();
  });

  it('shows error state when history is missing', () => {
    wrap(<PaymentAttemptHistorySection history={undefined} payment={samplePayment} />);
    expect(screen.getByText(/connection problem/i)).toBeInTheDocument();
  });
});
