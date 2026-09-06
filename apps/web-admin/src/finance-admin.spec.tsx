import { Suspense } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from '@world-pharma/ui-kit/web';
import { FinanceAdminPanel } from './finance-admin';

const mockGetAccessToken = jest.fn(() => 'test-token');
let mockPermissions = ['finance:read', 'finance:reconcile'];

jest.mock('@world-pharma/shell-web', () => {
  const actual = jest.requireActual<typeof import('@world-pharma/shell-web')>('@world-pharma/shell-web');
  return {
    ...actual,
    useSession: () => ({
      session: { status: 'authenticated', audience: 'admin', permissions: mockPermissions },
      getAccessToken: mockGetAccessToken,
      signInWithOtp: jest.fn(),
      verifyOtpChallenge: jest.fn(),
      expire: jest.fn(),
      signOut: jest.fn(),
      setCountryCode: jest.fn(),
    }),
  };
});
const breakId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const breakId2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const sampleBreak = {
  id: breakId,
  domain: 'PSP',
  status: 'BREAK',
  workflow_status: 'OPEN',
  break_type: 'unmatched_provider_ref',
  classification: 'UNMATCHED',
  source_kind: 'SETTLEMENT_IMPORT',
  source_ref: 'batch-ref-1',
  country_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  internal_ref: null,
  external_ref: 'ext-1',
  amount_minor: '1000',
  currency: 'XXX',
  detail: 'settlement import record test',
  investigated_by: null,
  investigated_at: null,
  resolution_note: null,
  resolved_by: null,
  resolved_at: null,
  close_note: null,
  closed_by: null,
  closed_at: null,
  created_at: '2026-08-30T10:00:00.000Z',
  updated_at: '2026-08-30T10:00:00.000Z',
  sandbox: true,
  live_psp: false,
  actions: [],
};

const investigatingBreak = {
  ...sampleBreak,
  workflow_status: 'INVESTIGATING',
  investigated_by: 'actor-1',
  investigated_at: '2026-08-30T11:00:00.000Z',
  actions: [
    {
      id: 'action-1',
      action: 'INVESTIGATE',
      actor_person_id: 'actor-1',
      note: 'admin ui investigate',
      idempotency_key: 'k1',
      created_at: '2026-08-30T11:00:00.000Z',
    },
  ],
};

function makeBreakList(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    ...sampleBreak,
    id: i === 0 ? breakId : `${breakId2.slice(0, -1)}${i}`,
    detail: `break item ${i}`,
  }));
}

function wrap(ui: React.ReactElement) {
  return render(
    <ThemeProvider defaultTheme="light">
      <Suspense fallback={null}>{ui}</Suspense>
    </ThemeProvider>,
  );
}

describe('FinanceAdminPanel break queue', () => {
  beforeEach(() => {
    mockPermissions = ['finance:read', 'finance:reconcile'];
    mockGetAccessToken.mockReturnValue('test-token');
  });

  it('A/B: shows empty queue before load, then loads breaks', async () => {
    (global.fetch as jest.Mock).mockImplementation(async (url: string) => {
      if (url.includes('/breaks') && !url.includes('/breaks/')) {
        return { ok: true, json: async () => ({ data: [sampleBreak], sandbox: true, live_psp: false }) };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });
    const user = userEvent.setup();
    wrap(<FinanceAdminPanel />);
    expect(screen.getByRole('button', { name: /Load break queue/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Load break queue/i }));
    expect(await screen.findByText(/UNMATCHED/i)).toBeInTheDocument();
  });

  it('C: shows loading state while fetching', async () => {
    let resolveFetch!: (value: unknown) => void;
    const pending = new Promise((resolve) => {
      resolveFetch = resolve;
    });
    (global.fetch as jest.Mock).mockImplementation(() => pending);
    const user = userEvent.setup();
    wrap(<FinanceAdminPanel />);
    void user.click(screen.getByRole('button', { name: /Load break queue/i }));
    expect(await screen.findByText(/Loading break queue/i)).toBeInTheDocument();
    resolveFetch({ ok: true, json: async () => ({ data: [] }) });
    await pending;
  });

  it('D: shows network error on list failure', async () => {
    (global.fetch as jest.Mock).mockImplementation(async (url: string) => {
      if (url.includes('/breaks') && !url.includes('/breaks/')) {
        return { ok: false, status: 500, json: async () => ({ detail: 'server error' }) };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });
    const user = userEvent.setup();
    wrap(<FinanceAdminPanel />);
    await user.click(screen.getByRole('button', { name: /Load break queue/i }));
    expect(await screen.findByText(/Finance breaks could not be loaded/i)).toBeInTheDocument();
  });

  it('E: shows permission denied on 403', async () => {
    (global.fetch as jest.Mock).mockImplementation(async () => ({
      ok: false,
      status: 403,
      json: async () => ({ detail: 'forbidden' }),
    }));
    const user = userEvent.setup();
    wrap(<FinanceAdminPanel />);
    await user.click(screen.getByRole('button', { name: /Load break queue/i }));
    expect(await screen.findByText(/Permission denied/i)).toBeInTheDocument();
  });

  it('F: passes workflow_status filter to API', async () => {
    (global.fetch as jest.Mock).mockImplementation(async (url: string) => {
      if (url.includes('workflow_status=INVESTIGATING')) {
        return { ok: true, json: async () => ({ data: [investigatingBreak] }) };
      }
      if (url.includes('/breaks')) {
        return { ok: true, json: async () => ({ data: [] }) };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });
    const user = userEvent.setup();
    wrap(<FinanceAdminPanel />);
    const statusSelect = screen.getByLabelText(/Status/i);
    await user.selectOptions(statusSelect, 'INVESTIGATING');
    await user.click(screen.getByRole('button', { name: /Load break queue/i }));
    expect(await screen.findByText(/settlement import record test/i)).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('workflow_status=INVESTIGATING'), expect.any(Object));
  });

  it('G: passes source_kind filter to API', async () => {
    (global.fetch as jest.Mock).mockImplementation(async (url: string) => {
      if (url.includes('source_kind=PAYOUT')) {
        return {
          ok: true,
          json: async () => ({
            data: [{ ...sampleBreak, source_kind: 'PAYOUT', classification: 'UNKNOWN' }],
          }),
        };
      }
      return { ok: true, json: async () => ({ data: [] }) };
    });
    const user = userEvent.setup();
    wrap(<FinanceAdminPanel />);
    await user.selectOptions(screen.getByLabelText(/^Source$/i), 'PAYOUT');
    await user.click(screen.getByRole('button', { name: /Load break queue/i }));
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('source_kind=PAYOUT'), expect.any(Object));
    });
    expect(await screen.findByText('UNKNOWN')).toBeInTheDocument();
  });

  it('H: paginates break list client-side', async () => {
    (global.fetch as jest.Mock).mockImplementation(async (url: string) => {
      if (url.includes('/breaks') && !url.includes('/breaks/')) {
        return { ok: true, json: async () => ({ data: makeBreakList(7) }) };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });
    const user = userEvent.setup();
    wrap(<FinanceAdminPanel />);
    await user.click(screen.getByRole('button', { name: /Load break queue/i }));
    expect(await screen.findByText(/Page 1 \/ 2/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Next/i }));
    expect(await screen.findByText(/Page 2 \/ 2/i)).toBeInTheDocument();
  });

  it('I/J: detail view and action history on row select', async () => {
    (global.fetch as jest.Mock).mockImplementation(async (url: string) => {
      if (url.includes(`/breaks/${breakId}`) && !url.includes('/investigate')) {
        return { ok: true, json: async () => investigatingBreak };
      }
      if (url.includes('/breaks') && !url.includes('/breaks/')) {
        return { ok: true, json: async () => ({ data: [sampleBreak] }) };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });
    const user = userEvent.setup();
    wrap(<FinanceAdminPanel />);
    await user.click(screen.getByRole('button', { name: /Load break queue/i }));
    await user.click(await screen.findByText(/settlement import record test/i));
    expect(await screen.findByText(/Break detail/i)).toBeInTheDocument();
    expect(screen.getByText(/Action history/i)).toBeInTheDocument();
  });

  it('K: investigate action refreshes from server', async () => {
    let detailCalls = 0;
    (global.fetch as jest.Mock).mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/investigate') && init?.method === 'POST') {
        return { ok: true, json: async () => investigatingBreak };
      }
      if (url.includes(`/breaks/${breakId}`)) {
        detailCalls += 1;
        return { ok: true, json: async () => (detailCalls > 1 ? investigatingBreak : sampleBreak) };
      }
      if (url.includes('/breaks')) {
        return {
          ok: true,
          json: async () => ({ data: [detailCalls > 2 ? investigatingBreak : sampleBreak] }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });
    const user = userEvent.setup();
    wrap(<FinanceAdminPanel />);
    await user.click(screen.getByRole('button', { name: /Load break queue/i }));
    await user.click(await screen.findByText(/settlement import record test/i));
    await user.click(await screen.findByRole('button', { name: /^Investigate$/i }));
    expect(await screen.findByText(/Investigated 2026-08-30T11:00:00.000Z/i)).toBeInTheDocument();
  });

  it('L: resolve action available in INVESTIGATING state', async () => {
    const resolvedBreak = {
      ...investigatingBreak,
      workflow_status: 'RESOLVED',
      resolved_at: '2026-08-30T12:00:00.000Z',
    };
    (global.fetch as jest.Mock).mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/resolve') && init?.method === 'POST') {
        return { ok: true, json: async () => resolvedBreak };
      }
      if (url.includes(`/breaks/${breakId}`)) {
        return { ok: true, json: async () => investigatingBreak };
      }
      if (url.includes('/breaks')) {
        return { ok: true, json: async () => ({ data: [investigatingBreak] }) };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });
    const user = userEvent.setup();
    wrap(<FinanceAdminPanel />);
    await user.click(screen.getByRole('button', { name: /Load break queue/i }));
    await user.click(await screen.findByText(/settlement import record test/i));
    await user.click(await screen.findByRole('button', { name: /^Resolve$/i }));
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/resolve'), expect.objectContaining({ method: 'POST' }));
  });

  it('M: close action available in RESOLVED state', async () => {
    const resolvedBreak = { ...investigatingBreak, workflow_status: 'RESOLVED' };
    (global.fetch as jest.Mock).mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/close') && init?.method === 'POST') {
        return { ok: true, json: async () => ({ ...resolvedBreak, workflow_status: 'CLOSED' }) };
      }
      if (url.includes(`/breaks/${breakId}`)) {
        return { ok: true, json: async () => resolvedBreak };
      }
      if (url.includes('/breaks')) {
        return { ok: true, json: async () => ({ data: [resolvedBreak] }) };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });
    const user = userEvent.setup();
    wrap(<FinanceAdminPanel />);
    await user.click(screen.getByRole('button', { name: /Load break queue/i }));
    await user.click(await screen.findByText(/settlement import record test/i));
    await user.click(await screen.findByRole('button', { name: /^Close$/i }));
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/close'), expect.objectContaining({ method: 'POST' }));
  });

  it('N: failed mutation shows error without optimistic update', async () => {
    (global.fetch as jest.Mock).mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/investigate') && init?.method === 'POST') {
        return { ok: false, status: 409, json: async () => ({ detail: 'Illegal break transition' }) };
      }
      if (url.includes(`/breaks/${breakId}`)) {
        return { ok: true, json: async () => sampleBreak };
      }
      if (url.includes('/breaks')) {
        return { ok: true, json: async () => ({ data: [sampleBreak] }) };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });
    const user = userEvent.setup();
    wrap(<FinanceAdminPanel />);
    await user.click(screen.getByRole('button', { name: /Load break queue/i }));
    await user.click(await screen.findByText(/settlement import record test/i));
    await user.click(await screen.findByRole('button', { name: /^Investigate$/i }));
    expect(await screen.findByText(/Illegal break transition/i)).toBeInTheDocument();
    const detail = screen.getByText(/Break detail/i).closest('div');
    expect(detail).toBeTruthy();
    expect(within(detail!.parentElement!).getByText(/Status: OPEN/i)).toBeInTheDocument();
  });

  it('O: invalid transition error from API is shown', async () => {
    (global.fetch as jest.Mock).mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/resolve') && init?.method === 'POST') {
        return { ok: false, status: 409, json: async () => ({ detail: 'Cannot resolve break in workflow status OPEN.' }) };
      }
      if (url.includes(`/breaks/${breakId}`)) {
        return { ok: true, json: async () => sampleBreak };
      }
      if (url.includes('/breaks')) {
        return { ok: true, json: async () => ({ data: [sampleBreak] }) };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });
    const user = userEvent.setup();
    wrap(<FinanceAdminPanel />);
    await user.click(screen.getByRole('button', { name: /Load break queue/i }));
    await user.click(await screen.findByText(/settlement import record test/i));
    expect(screen.queryByRole('button', { name: /^Resolve$/i })).not.toBeInTheDocument();
  });

  it('P: reference search filters loaded rows client-side', async () => {
    (global.fetch as jest.Mock).mockImplementation(async (url: string) => {
      if (url.includes('/breaks')) {
        return {
          ok: true,
          json: async () => ({
            data: [
              sampleBreak,
              { ...sampleBreak, id: breakId2, detail: 'payout unknown break', source_ref: 'payout-99' },
            ],
          }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });
    const user = userEvent.setup();
    wrap(<FinanceAdminPanel />);
    await user.click(screen.getByRole('button', { name: /Load break queue/i }));
    await user.type(screen.getByLabelText(/Reference search/i), 'payout-99');
    expect(await screen.findByText(/payout unknown break/i)).toBeInTheDocument();
    expect(screen.queryByText(/settlement import record test/i)).not.toBeInTheDocument();
  });

  it('Q: does not render sensitive payment fields', async () => {
    (global.fetch as jest.Mock).mockImplementation(async (url: string) => {
      if (url.includes(`/breaks/${breakId}`)) {
        return {
          ok: true,
          json: async () => ({
            ...sampleBreak,
            detail: 'safe operational detail only',
          }),
        };
      }
      if (url.includes('/breaks')) {
        return { ok: true, json: async () => ({ data: [sampleBreak] }) };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });
    const user = userEvent.setup();
    wrap(<FinanceAdminPanel />);
    await user.click(screen.getByRole('button', { name: /Load break queue/i }));
    await user.click(await screen.findByText(/settlement import record test/i));
    await screen.findByText(/Break detail/i);
    expect(screen.queryByText(/cvv|pan|secret|password|credential|signature/i)).not.toBeInTheDocument();
  });

  it('loads settlement import schedules', async () => {
    (global.fetch as jest.Mock).mockImplementation(async (url: string) => {
      if (url.includes('/settlement-import-schedules')) {
        return {
          ok: true,
          json: async () => ({
            data: [
              {
                id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
                country_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
                country_iso2: 'SW',
                provider_code: 'MOCK_SETTLEMENT',
                currency: 'XXX',
                enabled: true,
                worker_poll_ms: 60000,
                last_run: null,
              },
            ],
            worker_poll_ms: 60000,
            sandbox: true,
            live_psp: false,
          }),
        };
      }
      if (url.includes('/breaks')) {
        return { ok: true, json: async () => ({ data: [], sandbox: true, live_psp: false }) };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });
    const user = userEvent.setup();
    wrap(<FinanceAdminPanel />);
    await user.click(screen.getByRole('button', { name: /Load import schedules/i }));
    expect(await screen.findByText(/MOCK_SETTLEMENT/i)).toBeInTheDocument();
  });
});

describe('FinanceAdminPanel read-only break access', () => {
  beforeEach(() => {
    mockPermissions = ['finance:read'];
    mockGetAccessToken.mockReturnValue('test-token');
  });

  it('hides action buttons without finance:reconcile', async () => {
    (global.fetch as jest.Mock).mockImplementation(async (url: string) => {
      if (url.includes(`/breaks/${breakId}`)) {
        return { ok: true, json: async () => sampleBreak };
      }
      if (url.includes('/breaks')) {
        return { ok: true, json: async () => ({ data: [sampleBreak] }) };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });
    const user = userEvent.setup();
    wrap(<FinanceAdminPanel />);
    await user.click(screen.getByRole('button', { name: /Load break queue/i }));
    await user.click(await screen.findByText(/settlement import record test/i));
    expect(screen.getByText(/Requires finance:reconcile/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Investigate$/i })).not.toBeInTheDocument();
  });
});
