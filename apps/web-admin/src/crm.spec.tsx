import { Suspense } from 'react';
import { render, screen } from '@testing-library/react';
import { SessionProvider } from '@world-pharma/shell-web';
import { ThemeProvider } from '@world-pharma/ui-kit/web';
import { CrmApiError } from './crm-api';
import { CrmCustomerDetail } from './crm-customer-detail';
import { CrmCustomerList } from './crm-customer-list';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useSearchParams: () => new URLSearchParams('country=XX'),
}));

const sampleCustomer = {
  person_id: '22222222-2222-4222-8222-222222222222',
  status: 'ACTIVE',
  account_status: null,
  preferred_locale: 'en',
  country_code: 'XX',
  identifiers: [{ type: 'EMAIL', masked_value: 'r***@example.com', verified: true }],
};

const sample360 = {
  person_id: sampleCustomer.person_id,
  country_code: 'XX',
  profile: sampleCustomer,
  orders: [
    {
      id: '33333333-3333-4333-8333-333333333333',
      order_number: 'ORD-001',
      status: 'PAID',
      total_minor: '1000',
      currency: 'USD',
      created_at: new Date().toISOString(),
      has_prescription_link: false,
      items: [{ id: '44444444-4444-4444-8444-444444444444', title: 'Item', qty: 1, line_minor: '1000' }],
    },
  ],
  appointments: [],
  lab_bookings: [],
  imaging_bookings: [],
  support_tickets: [],
  marketing_preferences: { marketing_allowed: false, email_allowed: false },
  refill_requests: [],
};

function wrap(ui: React.ReactElement) {
  return render(
    <ThemeProvider defaultTheme="light">
      <SessionProvider initialAudience="admin">{ui}</SessionProvider>
    </ThemeProvider>,
  );
}

describe('crm-api helpers', () => {
  it('CrmApiError carries status', () => {
    const err = new CrmApiError('forbidden', 403);
    expect(err.status).toBe(403);
  });
});

describe('CrmCustomerList', () => {
  beforeEach(() => {
    (global.fetch as jest.Mock).mockImplementation(async () => ({
      ok: true,
      json: async () => ({ data: [sampleCustomer] }),
    }));
  });

  it('renders CRM heading and customer row', async () => {
    wrap(<CrmCustomerList />);
    expect(await screen.findByRole('heading', { name: /CRM — Customer lookup/i })).toBeInTheDocument();
    expect(await screen.findByText(/r\*\*\*@example\.com/)).toBeInTheDocument();
    expect(screen.getByText(/no health timeline/i)).toBeInTheDocument();
  });

  it('shows permission denied on 403', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ detail: 'forbidden' }),
    });
    wrap(<CrmCustomerList />);
    expect(await screen.findByText(/You do not have access/i)).toBeInTheDocument();
  });

  it('shows network error on 500', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ detail: 'server_error' }),
    });
    wrap(<CrmCustomerList />);
    expect(await screen.findByText(/Connection problem/i)).toBeInTheDocument();
  });
});

describe('CrmCustomerDetail', () => {
  beforeEach(() => {
    (global.fetch as jest.Mock).mockImplementation(async () => ({
      ok: true,
      json: async () => sample360,
    }));
  });

  it('renders customer 360 sections', async () => {
    wrap(
      <Suspense fallback={null}>
        <CrmCustomerDetail personId={sampleCustomer.person_id} />
      </Suspense>,
    );
    expect(await screen.findByRole('heading', { name: 'Customer 360' })).toBeInTheDocument();
    expect(await screen.findByText(/ORD-001/)).toBeInTheDocument();
    expect(screen.getByText(/Marketing allowed:/i)).toBeInTheDocument();
  });

  it('shows not found on 404', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ detail: 'not_found' }),
    });
    wrap(
      <Suspense fallback={null}>
        <CrmCustomerDetail personId={sampleCustomer.person_id} />
      </Suspense>,
    );
    expect(await screen.findByText('Customer not found')).toBeInTheDocument();
  });
});
