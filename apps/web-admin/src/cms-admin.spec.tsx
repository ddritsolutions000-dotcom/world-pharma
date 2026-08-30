import { Suspense } from 'react';
import { render, screen } from '@testing-library/react';
import { SessionProvider } from '@world-pharma/shell-web';
import { ThemeProvider } from '@world-pharma/ui-kit/web';
import { CmsAdminList } from './cms-admin-list';
import { isEditableStatus } from './cms-admin-api';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useSearchParams: () => new URLSearchParams('country=XX'),
}));

function wrap(ui: React.ReactElement) {
  return render(
    <ThemeProvider defaultTheme="light">
      <SessionProvider initialAudience="admin">{ui}</SessionProvider>
    </ThemeProvider>,
  );
}

describe('cms-admin-api helpers', () => {
  it('treats DRAFT and IN_REVIEW as editable', () => {
    expect(isEditableStatus('DRAFT')).toBe(true);
    expect(isEditableStatus('IN_REVIEW')).toBe(true);
    expect(isEditableStatus('PUBLISHED')).toBe(false);
    expect(isEditableStatus('ARCHIVED')).toBe(false);
  });
});

describe('CmsAdminList', () => {
  beforeEach(() => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            id: '11111111-1111-4111-8111-111111111111',
            country_id: '22222222-2222-4222-8222-222222222222',
            content_type: 'ARTICLE',
            slug: 'help-topic',
            locale: 'en',
            status: 'DRAFT',
            title: 'Help topic',
            summary: '',
            body: 'Body',
            author_person_id: '33333333-3333-4333-8333-333333333333',
            published_version: 0,
            version: 1,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
      }),
    });
  });

  it('renders CMS list heading and OD-CMS-01 notice', async () => {
    wrap(<CmsAdminList />);
    expect(await screen.findByRole('heading', { name: 'CMS content' })).toBeInTheDocument();
    expect(screen.getByText(/OD-CMS-01 dual-control is not implemented/i)).toBeInTheDocument();
    expect(await screen.findByText('Help topic')).toBeInTheDocument();
  });

  it('shows permission denied on 403', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ detail: 'forbidden' }),
    });
    wrap(<CmsAdminList />);
    expect(await screen.findByText(/You do not have access/i)).toBeInTheDocument();
  });

  it('shows network error on failure', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ detail: 'server_error' }),
    });
    wrap(<CmsAdminList />);
    expect(await screen.findByText(/Connection problem/i)).toBeInTheDocument();
  });
});

describe('CmsAdminCreate permission gate', () => {
  it('denies create without cms:write permission', async () => {
    const { CmsAdminCreate } = await import('./cms-admin-editor');
    render(
      <ThemeProvider defaultTheme="light">
        <SessionProvider initialAudience="admin">
          <Suspense fallback={null}>
            <CmsAdminCreate />
          </Suspense>
        </SessionProvider>
      </ThemeProvider>,
    );
    expect(await screen.findByText(/You do not have access/i)).toBeInTheDocument();
  });
});
