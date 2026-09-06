import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from '@world-pharma/ui-kit/web';
import { PolicyPackOperatorPanel } from './policy-pack-admin';
import { PolicyPackAdminApiError } from './policy-pack-admin-api';

const mockGetAccessToken = jest.fn(() => 'test-token');
let mockPermissions = ['policy:read', 'policy:publish'];

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

const publishedId = '11111111-1111-4111-8111-111111111111';
const draftId = '22222222-2222-4222-8222-222222222222';

const operator = {
  services: { pharmacy: false, marketplace: false, teleconsult: false, lab_home: false, lab_center: false, imaging_center: false, imaging_referral_required: false, delivery: false, physical_report_delivery: false, whatsapp: false, wallet: false },
  i18n: { default_locale: 'en', locales: ['en'] },
  currency: { default: 'XXX', allowed: ['XXX'] },
  timezone_default: 'UTC',
  payments: { enabled: false, methods: [], gateway_refs: [], currencies: [] },
  tax_profile_id: null,
  ledger_legal_entity_id: null,
  ledger_accounting_currency: null,
  recording_allowed: false,
  data_residency_mode: 'shared' as const,
  healthcare_flags: { doctor_onboarding_enabled: false },
  crm_enabled: false,
  analytics_enabled: false,
  search_discovery_enabled: true,
};

const listBody = {
  country_code: 'XX',
  data: [
    {
      id: publishedId,
      version: 1,
      status: 'PUBLISHED' as const,
      published_at: '2026-08-31T00:00:00.000Z',
      created_at: '2026-08-31T00:00:00.000Z',
      checksum: 'abc',
      created_by_id: null,
      published_by_id: null,
    },
  ],
  published_id: publishedId,
  registered_gateway_codes: ['MOCK_PRIMARY', 'MOCK_FALLBACK'],
  payment_method_families: ['CARD', 'COD'],
  service_keys: ['pharmacy', 'marketplace'],
  healthcare_flag_keys: ['doctor_onboarding_enabled'],
  data_residency_modes: ['shared', 'pinned_region', 'dedicated_db'],
  live_payment_enabled: false,
  live_unlock_note:
    'Publishing a country pack cannot set PAYMENT_LIVE_ENABLED, create a production PSP, or bypass R14-A human gates.',
  baseline_operator: operator,
};

const publishedDetail = {
  ...listBody.data[0],
  country_code: 'XX',
  document: {
    services: operator.services,
    payments: operator.payments,
    tax_profile_id: null,
    recording_allowed: false,
    data_residency_mode: 'shared',
    healthcare: operator.healthcare_flags,
    crm: { enabled: false },
    analytics: { enabled: false },
    search: { discovery_enabled: true },
  },
  operator,
  operator_status: 'PUBLISHED',
  dual_control_required: false,
  live_payment_enabled: false,
  registered_gateway_codes: listBody.registered_gateway_codes,
  payment_method_families: listBody.payment_method_families,
};

const fetchMock = globalThis.fetch as unknown as jest.Mock;

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

describe('PolicyPackOperatorPanel', () => {
  beforeEach(() => {
    mockPermissions = ['policy:read', 'policy:publish'];
    fetchMock.mockReset();
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      const path = String(url);
      const method = init?.method ?? 'GET';
      if (path.includes('/policy-packs?country=') && method === 'GET') {
        return jsonResponse(listBody);
      }
      if (path.includes(`/policy-packs/${publishedId}`) && !path.includes('/diff') && !path.includes('/validate') && method === 'GET') {
        return jsonResponse(publishedDetail);
      }
      if (path.includes('/policy-packs/validate') && method === 'POST') {
        return jsonResponse({
          ok: true,
          errors: [],
          operator_status: 'VALIDATED',
          dual_control_required: false,
          live_payment_enabled: false,
          diff: [
            { path: 'services.pharmacy', before: false, after: true },
            { path: 'payments.enabled', before: false, after: true },
          ],
          operator: {
            ...operator,
            services: { ...operator.services, pharmacy: true },
            payments: { enabled: true, methods: ['CARD'], gateway_refs: ['MOCK_PRIMARY'], currencies: [] },
          },
        });
      }
      if (path.includes('/policy-packs/rollback') && method === 'POST') {
        return jsonResponse({ document: { payments: { enabled: false } } });
      }
      if (path.includes(`/policy-packs/${draftId}/publish`) && method === 'POST') {
        return jsonResponse({ document: { payments: { enabled: true } } });
      }
      if (path.includes(`/policy-packs/${draftId}/diff`) && method === 'GET') {
        return jsonResponse({
          pack_id: draftId,
          country_code: 'XX',
          entries: [{ path: 'payments.enabled', before: false, after: true }],
        });
      }
      if (path.includes('/policy-packs') && method === 'POST' && !path.includes('/validate') && !path.includes('/publish') && !path.includes('/rollback')) {
        return jsonResponse({
          ...publishedDetail,
          id: draftId,
          version: 2,
          status: 'DRAFT',
          operator_status: 'DRAFT',
        });
      }
      return jsonResponse({ detail: 'not_mocked', code: 'NOT_FOUND' }, 404);
    });
  });

  it('forbids users without policy:read', async () => {
    mockPermissions = [];
    render(
      <ThemeProvider defaultTheme="light">
        <PolicyPackOperatorPanel />
      </ThemeProvider>,
    );
    expect(await screen.findByText(/you do not have access/i)).toBeTruthy();
  });

  it('loads published pack, validates, drafts, publishes, and rolls back without exposing secrets or live unlock', async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider defaultTheme="light">
        <PolicyPackOperatorPanel />
      </ThemeProvider>,
    );

    expect(await screen.findByRole('heading', { name: /country policy pack/i })).toBeTruthy();
    expect(await screen.findByText(/live payments off/i)).toBeTruthy();
    expect(screen.getAllByText(/cannot set PAYMENT_LIVE_ENABLED/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/sk_live|api_key|password=/i)).toBeNull();
    expect(await screen.findByText('PUBLISHED')).toBeTruthy();

    await user.click(screen.getByLabelText('pharmacy'));
    await user.click(screen.getByLabelText('payments.enabled'));
    await user.click(screen.getByLabelText('CARD'));
    await user.click(screen.getByLabelText('MOCK_PRIMARY'));
    await user.click(screen.getByRole('button', { name: 'Validate' }));

    expect((await screen.findAllByText('Validated')).length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: /diff vs published/i })).toBeTruthy();
    expect(screen.getAllByText('services.pharmacy').length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(await screen.findByText(/Draft v2 created/i)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Publish' }));
    await waitFor(() => expect(screen.getAllByText('Published').length).toBeGreaterThan(0));

    await user.click(screen.getByRole('button', { name: 'Rollback' }));
    expect(await screen.findByText(/Rolled back/i)).toBeTruthy();
  });

  it('includes localization and empty ledger refs on validate without live unlock or credentials', async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider defaultTheme="light">
        <PolicyPackOperatorPanel />
      </ThemeProvider>,
    );
    expect(await screen.findByLabelText('Default locale')).toBeTruthy();
    await user.clear(screen.getByLabelText('Default locale'));
    await user.type(screen.getByLabelText('Default locale'), 'de');
    await user.clear(screen.getByLabelText('Locales'));
    await user.type(screen.getByLabelText('Locales'), 'de,en');
    await user.clear(screen.getByLabelText('Catalog currency default'));
    await user.type(screen.getByLabelText('Catalog currency default'), 'EUR');
    await user.clear(screen.getByLabelText('Catalog currencies allowed'));
    await user.type(screen.getByLabelText('Catalog currencies allowed'), 'EUR');
    await user.clear(screen.getByLabelText('Timezone default'));
    await user.type(screen.getByLabelText('Timezone default'), 'Europe/Berlin');
    await user.click(screen.getByRole('button', { name: 'Validate' }));
    await waitFor(() => {
      const validateCall = fetchMock.mock.calls.find(
        (call) => String(call[0]).includes('/policy-packs/validate') && call[1]?.method === 'POST',
      );
      expect(validateCall).toBeTruthy();
      const payload = JSON.parse(String(validateCall?.[1]?.body ?? '{}')) as {
        document: {
          i18n: { default_locale: string; locales: string[] };
          currency: { default: string; allowed: string[] };
          timezone: { default: string };
          ledger: { legal_entity_id: string | null };
        };
      };
      expect(payload.document.i18n.default_locale).toBe('de');
      expect(payload.document.i18n.locales).toEqual(['de', 'en']);
      expect(payload.document.currency).toEqual({ default: 'EUR', allowed: ['EUR'] });
      expect(payload.document.timezone.default).toBe('Europe/Berlin');
      expect(payload.document.ledger.legal_entity_id).toBeNull();
    });
    expect(screen.queryByText(/sk_live|api_key|password=/i)).toBeNull();
    expect(screen.getAllByText(/cannot set PAYMENT_LIVE_ENABLED/i).length).toBeGreaterThan(0);
  });

  it('hides mutating actions without policy:publish', async () => {
    mockPermissions = ['policy:read'];
    render(
      <ThemeProvider defaultTheme="light">
        <PolicyPackOperatorPanel />
      </ThemeProvider>,
    );
    expect(await screen.findByText(/policy:publish is required/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Publish' })).toBeNull();
  });

  it('surfaces API errors without inventing a second engine', async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      const path = String(url);
      if (path.includes('/policy-packs?country=') && (init?.method ?? 'GET') === 'GET') {
        return jsonResponse(listBody);
      }
      if (path.endsWith(`/policy-packs/${publishedId}`)) {
        return jsonResponse(publishedDetail);
      }
      return Promise.resolve({
        ok: false,
        status: 403,
        json: async () => ({ detail: 'forbidden', code: 'FORBIDDEN' }),
      });
    });
    mockPermissions = ['policy:read', 'policy:publish'];
    const user = userEvent.setup();
    render(
      <ThemeProvider defaultTheme="light">
        <PolicyPackOperatorPanel />
      </ThemeProvider>,
    );
    await screen.findByRole('button', { name: 'Validate' });
    await user.click(screen.getByRole('button', { name: 'Validate' }));
    expect(await screen.findByText('forbidden')).toBeTruthy();
    expect(PolicyPackAdminApiError).toBeTruthy();
  });
});
