import { render, screen } from '@testing-library/react';
import { JoinInboxPanel } from './join-inbox-panel';
import * as joinApi from './join-api';

jest.mock('./join-api');

const mockFetch = joinApi.fetchJoinInbox as jest.MockedFunction<typeof joinApi.fetchJoinInbox>;

describe('JoinInboxPanel', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('renders application notifications', async () => {
    mockFetch.mockResolvedValue({
      data: [
        {
          id: 'n1',
          channel: 'in_app',
          title: 'Partner application updated',
          body: 'Open the app for details.',
          read: false,
          created_at: '2026-08-30T10:00:00.000Z',
          reference_type: 'partner_application',
          reference_id: 'app-1',
        },
      ],
    });
    render(<JoinInboxPanel token="t1" onError={jest.fn()} onOpenApplication={jest.fn()} />);
    expect(await screen.findByText(/Partner application updated/i)).toBeInTheDocument();
  });
});
