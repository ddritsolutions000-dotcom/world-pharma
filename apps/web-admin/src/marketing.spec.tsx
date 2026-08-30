import { Suspense } from 'react';
import { render, screen } from '@testing-library/react';
import { SessionProvider } from '@world-pharma/shell-web';
import { ThemeProvider } from '@world-pharma/ui-kit/web';
import { MarketingApiError } from './marketing-api';
import { MarketingCampaignDetail } from './marketing-campaign-detail';
import { MarketingHub } from './marketing-list';
import { MarketingSegmentDetail } from './marketing-segment-detail';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useSearchParams: () => new URLSearchParams('country=XX'),
}));

const sampleSegment = {
  id: '11111111-1111-4111-8111-111111111111',
  country_code: 'XX',
  code: 'all-customers',
  name: 'All customers',
  status: 'ACTIVE',
  rules: { type: 'all' },
  version: 1,
  preview_count: 42,
};

const sampleCampaign = {
  id: '22222222-2222-4222-8222-222222222222',
  country_code: 'XX',
  code: 'welcome',
  name: 'Welcome',
  status: 'DRAFT',
  channel: 'IN_APP',
  title: 'Hello',
  body: 'Operational update',
  segment_id: sampleSegment.id,
  version: 1,
  segment: { id: sampleSegment.id, code: sampleSegment.code, name: sampleSegment.name },
};

function wrap(ui: React.ReactElement) {
  return render(
    <ThemeProvider defaultTheme="light">
      <SessionProvider initialAudience="admin">{ui}</SessionProvider>
    </ThemeProvider>,
  );
}

describe('marketing-api helpers', () => {
  it('MarketingApiError carries status', () => {
    const err = new MarketingApiError('forbidden', 403);
    expect(err.status).toBe(403);
  });
});

describe('MarketingHub', () => {
  beforeEach(() => {
    (global.fetch as jest.Mock).mockImplementation(async (url: string) => {
      if (url.includes('/segments')) {
        return { ok: true, json: async () => ({ data: [sampleSegment] }) };
      }
      return { ok: true, json: async () => ({ data: [sampleCampaign] }) };
    });
  });

  it('renders marketing heading and lists', async () => {
    wrap(<MarketingHub />);
    expect(await screen.findByRole('heading', { name: /Marketing/i })).toBeInTheDocument();
    expect(await screen.findByText(/Welcome/)).toBeInTheDocument();
    expect(await screen.findByText(/All customers/)).toBeInTheDocument();
    expect(screen.getByText(/Consent-gated in-app campaigns only/i)).toBeInTheDocument();
  });

  it('shows permission denied on 403', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ detail: 'forbidden' }),
    });
    wrap(<MarketingHub />);
    expect(await screen.findByText(/You do not have access/i)).toBeInTheDocument();
  });
});

describe('MarketingCampaignDetail', () => {
  beforeEach(() => {
    (global.fetch as jest.Mock).mockImplementation(async (url: string) => {
      if (url.includes('/sends')) {
        return { ok: true, json: async () => ({ data: [] }) };
      }
      return { ok: true, json: async () => sampleCampaign };
    });
  });

  it('renders campaign detail and workflow controls', async () => {
    wrap(
      <Suspense fallback={null}>
        <MarketingCampaignDetail campaignId={sampleCampaign.id} />
      </Suspense>,
    );
    expect(await screen.findByRole('heading', { name: /Welcome/i })).toBeInTheDocument();
    expect(await screen.findByText(/Operational update/)).toBeInTheDocument();
    expect(screen.getByText(/Send log/i)).toBeInTheDocument();
  });
});

describe('MarketingSegmentDetail', () => {
  beforeEach(() => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => sampleSegment,
    });
  });

  it('renders segment rules preview count', async () => {
    wrap(
      <Suspense fallback={null}>
        <MarketingSegmentDetail segmentId={sampleSegment.id} />
      </Suspense>,
    );
    expect(await screen.findByRole('heading', { name: /All customers/i })).toBeInTheDocument();
    expect(await screen.findByText(/preview audience 42/i)).toBeInTheDocument();
  });
});
