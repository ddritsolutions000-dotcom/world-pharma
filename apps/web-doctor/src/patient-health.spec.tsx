import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SessionProvider } from '@world-pharma/shell-web';
import { ThemeProvider } from '@world-pharma/ui-kit/web';
import { DoctorPatientPickerPanel } from './patient-picker-panel';
import { DoctorPatientHealthPanel } from './patient-health-page';
import * as healthApi from './health-api';

jest.mock('./health-api');

const mockPatients = healthApi.fetchDoctorHealthPatients as jest.MockedFunction<
  typeof healthApi.fetchDoctorHealthPatients
>;
const mockTimeline = healthApi.fetchDoctorPatientTimeline as jest.MockedFunction<
  typeof healthApi.fetchDoctorPatientTimeline
>;

function wrap(ui: React.ReactElement) {
  return render(
    <ThemeProvider defaultTheme="light">
      <SessionProvider initialAudience="doctor">{ui}</SessionProvider>
    </ThemeProvider>,
  );
}

describe('DoctorPatientPickerPanel', () => {
  beforeEach(() => {
    mockPatients.mockReset();
  });

  it('does not auto-select a patient', async () => {
    mockPatients.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        patients: [
          {
            patient_person_id: 'patient-aaa-bbbb-cccc',
            relationship_id: 'rel-1',
            kind: 'PRIMARY_CARE',
            status: 'ACTIVE',
            organization_id: null,
          },
        ],
      },
    });
    wrap(<DoctorPatientPickerPanel />);
    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: /patient/i })).toHaveValue('');
    });
    expect(screen.getByText(/Choose a patient above/i)).toBeInTheDocument();
  });

  it('shows empty state when no patients', async () => {
    mockPatients.mockResolvedValue({ ok: true, status: 200, data: { patients: [] } });
    wrap(<DoctorPatientPickerPanel />);
    await waitFor(() => {
      expect(screen.getByText('No patients available')).toBeInTheDocument();
    });
  });
});

describe('DoctorPatientHealthPanel', () => {
  beforeEach(() => {
    mockTimeline.mockReset();
  });

  it('shows consent required when timeline is denied', async () => {
    mockTimeline.mockResolvedValue({
      ok: false,
      status: 403,
      error: 'Active consent is required.',
      kind: 'forbidden',
    });
    wrap(<DoctorPatientHealthPanel patientPersonId="patient-1" countryCode="XX" />);
    await waitFor(() => {
      expect(screen.getByText('Consent required')).toBeInTheDocument();
    });
  });

  it('shows timeline metadata from API', async () => {
    mockTimeline.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        items: [
          {
            id: 'evt-1',
            event_type: 'ARTIFACT_PUBLISHED',
            artifact_id: 'art-1',
            artifact_type: 'LAB_REPORT',
            source_module: 'lab',
            source_id: 'booking-1',
            title: 'CBC panel',
            status: 'ACTIVE',
            occurred_at: '2026-08-29T10:00:00.000Z',
            sandbox: true,
          },
        ],
        next_cursor: null,
      },
    });
    wrap(<DoctorPatientHealthPanel patientPersonId="patient-1" countryCode="XX" />);
    await waitFor(() => {
      expect(screen.getByText('CBC panel')).toBeInTheDocument();
    });
    expect(screen.getByRole('link', { name: /View CBC panel/i })).toHaveAttribute(
      'href',
      '/patients/patient-1/health/artifacts/art-1?country=XX',
    );
  });

  it('retries on network error', async () => {
    mockTimeline
      .mockResolvedValueOnce({ ok: false, status: 0, error: 'Network unavailable.', kind: 'network' })
      .mockResolvedValueOnce({ ok: true, status: 200, data: { items: [], next_cursor: null } });
    const user = userEvent.setup();
    wrap(<DoctorPatientHealthPanel patientPersonId="patient-1" countryCode="XX" />);
    await waitFor(() => {
      expect(screen.getByText(/Connection problem/i)).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => {
      expect(mockTimeline).toHaveBeenCalledTimes(2);
    });
  });
});
