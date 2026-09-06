import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from '@world-pharma/ui-kit/web';
import { PartnersAdmin } from './partners-admin';

const mockGetAccessToken = jest.fn(() => 'admin-token');
let mockPermissions = ['partner:manage', 'kyc:review', 'kyc:document_read'];

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

const appId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const docId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function wrap(ui: React.ReactElement) {
  return render(<ThemeProvider defaultTheme="light">{ui}</ThemeProvider>);
}

describe('PartnersAdmin', () => {
  beforeEach(() => {
    mockPermissions = ['partner:manage', 'kyc:review', 'kyc:document_read'];
    (global.fetch as jest.Mock).mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/admin/partners/applications') && !url.includes(appId)) {
        return {
          ok: true,
          json: async () => ({
            data: [{ id: appId, status: 'DOCUMENTS_SUBMITTED', partner_type_code: 'VENDOR' }],
          }),
        };
      }
      if (url.includes(`/applications/${appId}`) && !url.includes('documents')) {
        return {
          ok: true,
          json: async () => ({
            id: appId,
            status: 'DOCUMENTS_SUBMITTED',
            partner_type_code: 'VENDOR',
            partner: { id: 'p1', person_id: 'person-1' },
            history: [],
          }),
        };
      }
      if (url.includes(`/applications/${appId}/documents`)) {
        return {
          ok: true,
          json: async () => ({
            data: [{ id: docId, document_type_code: 'BUSINESS_REGISTRATION', status: 'UPLOADED' }],
          }),
        };
      }
      if (url.includes(`/documents/${docId}/review`) && init?.method === 'POST') {
        return { ok: true, json: async () => ({ id: docId, status: 'VERIFIED' }) };
      }
      if (url.includes(`/documents/${docId}`)) {
        return {
          ok: true,
          json: async () => ({
            original_name: 'reg.pdf',
            content_type: 'application/pdf',
            watermark: 'CONFIDENTIAL',
          }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });
  });

  it('lists applications and opens review detail', async () => {
    const user = userEvent.setup();
    wrap(<PartnersAdmin />);
    expect(await screen.findByText('VENDOR')).toBeInTheDocument();
    expect(screen.getByText(/Submitted — under company review/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Review' }));
    expect(await screen.findByText(/BUSINESS_REGISTRATION/i)).toBeInTheDocument();
  });

  it('shows document verify and reject controls', async () => {
    const user = userEvent.setup();
    wrap(<PartnersAdmin />);
    await user.click(await screen.findByRole('button', { name: 'Review' }));
    expect(screen.getByRole('button', { name: /Verify document/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Reject document/i })).toBeInTheDocument();
  });

  it('does not expose base64 document content in list UI', async () => {
    const user = userEvent.setup();
    wrap(<PartnersAdmin />);
    await user.click(await screen.findByRole('button', { name: 'Review' }));
    const raw = document.body.textContent ?? '';
    expect(raw.includes('content_base64')).toBe(false);
  });
});
