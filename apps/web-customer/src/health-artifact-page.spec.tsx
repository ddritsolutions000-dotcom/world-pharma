import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SessionProvider } from '@world-pharma/shell-web';
import { ThemeProvider } from '@world-pharma/ui-kit/web';
import { HealthArtifactScreen } from './health-artifact-page';
import * as healthApi from './health-api';

jest.mock('next/navigation', () => ({
  useParams: () => ({ id: 'art-1' }),
}));

jest.mock('./health-api');

const mockMetadata = healthApi.fetchHealthArtifactMetadata as jest.MockedFunction<
  typeof healthApi.fetchHealthArtifactMetadata
>;
const mockPayload = healthApi.fetchHealthArtifactPayload as jest.MockedFunction<
  typeof healthApi.fetchHealthArtifactPayload
>;

function wrap(ui: React.ReactElement) {
  return render(
    <ThemeProvider defaultTheme="light">
      <SessionProvider initialAudience="customer">{ui}</SessionProvider>
    </ThemeProvider>,
  );
}

describe('HealthArtifactScreen', () => {
  beforeEach(() => {
    mockMetadata.mockReset();
    mockPayload.mockReset();
  });

  it('renders metadata and lab payload when authorized', async () => {
    mockMetadata.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        id: 'art-1',
        artifact_type: 'LAB_REPORT',
        title: 'CBC panel',
        published_at: '2026-08-29T10:00:00.000Z',
        sandbox: true,
        source_module: 'lab',
        source_id: 'booking-1',
        status: 'PUBLISHED',
        payload_available: true,
      },
    });
    mockPayload.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        artifact_type: 'LAB_REPORT',
        payload: {
          lab_booking_id: 'booking-1',
          lab_report_id: 'report-1',
          accession_number: 'A-100',
          version_number: 1,
          published_at: '2026-08-29T10:00:00.000Z',
          summary: 'Within reference range',
          results: [{ analyte_name: 'Hemoglobin', value: '13.5', unit: 'g/dL' }],
        },
      },
    });

    wrap(<HealthArtifactScreen />);
    await waitFor(() => {
      expect(screen.getByText('CBC panel')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByText(/Hemoglobin: 13.5 g\/dL/)).toBeInTheDocument();
    });
  });

  it('shows not found when metadata returns 404', async () => {
    mockMetadata.mockResolvedValue({
      ok: false,
      status: 404,
      error: 'Health artifact not found',
      kind: 'error',
    });
    wrap(<HealthArtifactScreen />);
    await waitFor(() => {
      expect(screen.getByText('Record not found')).toBeInTheDocument();
    });
    expect(mockPayload).not.toHaveBeenCalled();
  });

  it('shows forbidden on metadata 403', async () => {
    mockMetadata.mockResolvedValue({
      ok: false,
      status: 403,
      error: 'Permission denied.',
      kind: 'forbidden',
    });
    wrap(<HealthArtifactScreen />);
    await waitFor(() => {
      expect(screen.getByText('You do not have access')).toBeInTheDocument();
    });
  });

  it('shows unavailable payload state on 404 payload', async () => {
    mockMetadata.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        id: 'art-1',
        artifact_type: 'LAB_REPORT',
        title: 'CBC panel',
        published_at: '2026-08-29T10:00:00.000Z',
        sandbox: true,
        source_module: 'lab',
        source_id: 'booking-1',
        status: 'PUBLISHED',
        payload_available: true,
      },
    });
    mockPayload.mockResolvedValue({
      ok: false,
      status: 404,
      error: 'Artifact not available',
      kind: 'error',
    });
    wrap(<HealthArtifactScreen />);
    await waitFor(() => {
      expect(screen.getByText('Report not available')).toBeInTheDocument();
    });
  });

  it('retries payload load after network failure', async () => {
    mockMetadata.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        id: 'art-1',
        artifact_type: 'LAB_REPORT',
        title: 'CBC panel',
        published_at: '2026-08-29T10:00:00.000Z',
        sandbox: true,
        source_module: 'lab',
        source_id: 'booking-1',
        status: 'PUBLISHED',
        payload_available: true,
      },
    });
    mockPayload
      .mockResolvedValueOnce({ ok: false, status: 0, error: 'Network unavailable.', kind: 'network' })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        data: {
          artifact_type: 'LAB_REPORT',
          payload: {
            lab_booking_id: 'booking-1',
            lab_report_id: 'report-1',
            accession_number: 'A-100',
            version_number: 1,
            published_at: '2026-08-29T10:00:00.000Z',
            summary: null,
            results: [],
          },
        },
      });
    const user = userEvent.setup();
    wrap(<HealthArtifactScreen />);
    await waitFor(() => {
      expect(screen.getByText(/Connection problem/i)).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => {
      expect(mockPayload).toHaveBeenCalledTimes(2);
    });
  });
});
