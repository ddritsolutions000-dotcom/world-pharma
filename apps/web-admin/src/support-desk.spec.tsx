import { Suspense } from 'react';
import { render, screen } from '@testing-library/react';
import { SessionProvider } from '@world-pharma/shell-web';
import { ThemeProvider } from '@world-pharma/ui-kit/web';
import {
  allowedNextStatuses,
  isTerminalTicketStatus,
  SupportDeskApiError,
} from './support-desk-api';
import { SupportDeskList } from './support-desk-list';
import { SupportDeskTicket } from './support-desk-ticket';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useSearchParams: () => new URLSearchParams('country=XX'),
}));

const sampleTicket = {
  id: '11111111-1111-4111-8111-111111111111',
  person_id: '22222222-2222-4222-8222-222222222222',
  country_id: '33333333-3333-4333-8333-333333333333',
  queue_id: '44444444-4444-4444-8444-444444444444',
  queue_code: 'CUSTOMER_GENERAL',
  queue_name: 'Customer General',
  status: 'OPEN',
  subject: 'Order question',
  reference_type: 'order',
  reference_id: '55555555-5555-4555-8555-555555555555',
  assignee_person_id: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  messages: [
    {
      id: '66666666-6666-4666-8666-666666666666',
      visibility: 'CUSTOMER' as const,
      author_person_id: '22222222-2222-4222-8222-222222222222',
      created_at: new Date().toISOString(),
      body: 'Where is my order?',
    },
  ],
};

function wrap(ui: React.ReactElement) {
  return render(
    <ThemeProvider defaultTheme="light">
      <SessionProvider initialAudience="admin">{ui}</SessionProvider>
    </ThemeProvider>,
  );
}

describe('support-desk-api helpers', () => {
  it('marks CLOSED as terminal', () => {
    expect(isTerminalTicketStatus('CLOSED')).toBe(true);
    expect(isTerminalTicketStatus('OPEN')).toBe(false);
  });

  it('returns allowed transitions for OPEN', () => {
    expect(allowedNextStatuses('OPEN')).toEqual(['ASSIGNED', 'CLOSED']);
  });

  it('returns no transitions for CLOSED', () => {
    expect(allowedNextStatuses('CLOSED')).toEqual([]);
  });

  it('SupportDeskApiError carries status', () => {
    const err = new SupportDeskApiError('forbidden', 403);
    expect(err.status).toBe(403);
  });
});

describe('SupportDeskList', () => {
  beforeEach(() => {
    (global.fetch as jest.Mock).mockImplementation(async (url: string) => {
      if (url.includes('/queues')) {
        return {
          ok: true,
          json: async () => ({
            data: [{ id: sampleTicket.queue_id, country_id: sampleTicket.country_id, code: 'CUSTOMER_GENERAL', name: 'Customer General', active: true }],
          }),
        };
      }
      return {
        ok: true,
        json: async () => ({ data: [sampleTicket] }),
      };
    });
  });

  it('renders queue heading and ticket row', async () => {
    wrap(<SupportDeskList />);
    expect(await screen.findByRole('heading', { name: 'Support Desk' })).toBeInTheDocument();
    expect(await screen.findByText('Order question')).toBeInTheDocument();
    expect(screen.getByText(/no clinical payloads/i)).toBeInTheDocument();
  });

  it('shows permission denied on 403', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ detail: 'forbidden' }),
    });
    wrap(<SupportDeskList />);
    expect(await screen.findByText(/You do not have access/i)).toBeInTheDocument();
  });

  it('shows network error on 500', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ detail: 'server_error' }),
    });
    wrap(<SupportDeskList />);
    expect(await screen.findByText(/Connection problem/i)).toBeInTheDocument();
  });
});

describe('SupportDeskTicket', () => {
  beforeEach(() => {
    (global.fetch as jest.Mock).mockImplementation(async (url: string) => {
      if (url.includes('/queues')) {
        return {
          ok: true,
          json: async () => ({
            data: [{ id: sampleTicket.queue_id, country_id: sampleTicket.country_id, code: 'CUSTOMER_GENERAL', name: 'Customer General', active: true }],
          }),
        };
      }
      return { ok: true, json: async () => sampleTicket };
    });
  });

  it('renders ticket detail and messages', async () => {
    wrap(
      <Suspense fallback={null}>
        <SupportDeskTicket ticketId={sampleTicket.id} />
      </Suspense>,
    );
    expect(await screen.findByRole('heading', { name: 'Order question' })).toBeInTheDocument();
    expect(await screen.findByText('Where is my order?')).toBeInTheDocument();
    expect(screen.getByText(/Reference: order/i)).toBeInTheDocument();
  });

  it('shows not found on 404', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ detail: 'not_found' }),
    });
    wrap(
      <Suspense fallback={null}>
        <SupportDeskTicket ticketId={sampleTicket.id} />
      </Suspense>,
    );
    expect(await screen.findByText('Ticket not found')).toBeInTheDocument();
  });

  it('shows read-only notice without support:manage', async () => {
    wrap(
      <Suspense fallback={null}>
        <SupportDeskTicket ticketId={sampleTicket.id} />
      </Suspense>,
    );
    expect(await screen.findByText(/Read-only — requires support:manage/i)).toBeInTheDocument();
  });

  it('shows closed ticket immutability notice', async () => {
    (global.fetch as jest.Mock).mockImplementation(async (url: string) => {
      if (url.includes('/queues')) {
        return {
          ok: true,
          json: async () => ({
            data: [{ id: sampleTicket.queue_id, country_id: sampleTicket.country_id, code: 'CUSTOMER_GENERAL', name: 'Customer General', active: true }],
          }),
        };
      }
      return { ok: true, json: async () => ({ ...sampleTicket, status: 'CLOSED' }) };
    });
    wrap(
      <Suspense fallback={null}>
        <SupportDeskTicket ticketId={sampleTicket.id} />
      </Suspense>,
    );
    expect(await screen.findByText(/closed and cannot be modified/i)).toBeInTheDocument();
  });

  it('surfaces 409 conflict from API client', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({ detail: 'Terminal tickets cannot change status' }),
    });
    const { setSupportTicketStatus } = await import('./support-desk-api');
    await expect(
      setSupportTicketStatus('token', sampleTicket.id, { status: 'CLOSED', country_code: 'XX' }),
    ).rejects.toMatchObject({ status: 409, message: 'Terminal tickets cannot change status' });
  });
});
