import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SessionProvider } from '@world-pharma/shell-web';
import { ThemeProvider } from '@world-pharma/ui-kit/web';
import { CareNavigationScreen } from './care-nav-page';
import { CareNavApiError } from './care-nav-api';

jest.mock('./care-nav-api', () => {
  const actual = jest.requireActual<typeof import('./care-nav-api')>('./care-nav-api');
  return {
    ...actual,
    createCareNavSession: jest.fn(),
    submitCareNavAnswer: jest.fn(),
    completeCareNavIntake: jest.fn(),
    fetchCareNavSession: jest.fn(),
    fetchCareNavAssessment: jest.fn(),
  };
});

import * as careNavApi from './care-nav-api';

const mockCreate = careNavApi.createCareNavSession as jest.MockedFunction<typeof careNavApi.createCareNavSession>;
const mockAnswer = careNavApi.submitCareNavAnswer as jest.MockedFunction<typeof careNavApi.submitCareNavAnswer>;
const mockComplete = careNavApi.completeCareNavIntake as jest.MockedFunction<typeof careNavApi.completeCareNavIntake>;

const sessionBase = {
  id: 'sess-1',
  status: 'INTAKE' as const,
  country_id: 'country-1',
  chief_complaint_summary: 'headache',
  urgency: null,
  specialty_code: null,
  red_flag: false,
  expires_at: '2026-08-30T00:00:00.000Z',
  created_at: '2026-08-29T10:00:00.000Z',
  completed_at: null,
  terminated_at: null,
  answers: [] as careNavApi.CareNavAnswer[],
};

function wrap(ui: React.ReactElement) {
  return render(
    <ThemeProvider defaultTheme="light">
      <SessionProvider initialAudience="customer">{ui}</SessionProvider>
    </ThemeProvider>,
  );
}

describe('CareNavigationScreen', () => {
  beforeEach(() => {
    mockCreate.mockReset();
    mockAnswer.mockReset();
    mockComplete.mockReset();
  });

  it('shows entry then creates session and completes routine triage', async () => {
    const user = userEvent.setup();
    mockCreate.mockResolvedValue({ ...sessionBase });
    mockAnswer
      .mockResolvedValueOnce({ ...sessionBase, answers: [{ question_key: 'duration', answer_text: '2 days', created_at: 'x' }] })
      .mockResolvedValueOnce({
        ...sessionBase,
        answers: [
          { question_key: 'duration', answer_text: '2 days', created_at: 'x' },
          { question_key: 'symptom_change', answer_text: 'same', created_at: 'y' },
        ],
      });
    mockComplete.mockResolvedValue({
      ...sessionBase,
      status: 'TRIAGED',
      assessment: {
        id: 'a1',
        rules_version: 'r10a-rules-v1',
        urgency: 'ROUTINE',
        red_flag: false,
        specialty_codes: ['general_practice'],
        explanation_key: 'care_nav.explain.routine',
        emergency_guidance_key: null,
        booking_handoff_allowed: true,
        created_at: '2026-08-29T10:05:00.000Z',
      },
    });

    wrap(<CareNavigationScreen />);
    await user.click(screen.getByRole('button', { name: /Start care navigation/i }));
    await user.type(screen.getByLabelText(/main concern/i), 'mild headache');
    await user.click(screen.getByRole('button', { name: /Continue/i }));

    await waitFor(() => {
      expect(screen.getByText(/Question 1 of 2/i)).toBeInTheDocument();
    });
    await user.type(screen.getByLabelText(/How long have you had these symptoms/i), '2 days');
    await user.click(screen.getByRole('button', { name: /Save answer/i }));

    await waitFor(() => {
      expect(screen.getByText(/Question 2 of 2/i)).toBeInTheDocument();
    });
    await user.type(screen.getByLabelText(/getting worse/i), 'staying the same');
    await user.click(screen.getByRole('button', { name: /Save answer/i }));

    await waitFor(() => {
      expect(screen.getByText('Next steps')).toBeInTheDocument();
    });
    expect(screen.getAllByText(/not a diagnosis/i).length).toBeGreaterThan(0);
  });

  it('shows red-flag guidance before continuation messaging', async () => {
    const user = userEvent.setup();
    mockCreate.mockResolvedValue({ ...sessionBase, chief_complaint_summary: 'chest pain' });
    mockAnswer
      .mockResolvedValueOnce({
        ...sessionBase,
        answers: [{ question_key: 'duration', answer_text: '1 hour', created_at: 'x' }],
      })
      .mockResolvedValueOnce({
        ...sessionBase,
        answers: [
          { question_key: 'duration', answer_text: '1 hour', created_at: 'x' },
          { question_key: 'symptom_change', answer_text: 'worse', created_at: 'y' },
        ],
      });
    mockComplete.mockResolvedValue({
      ...sessionBase,
      status: 'TRIAGED',
      red_flag: true,
      assessment: {
        id: 'a2',
        rules_version: 'r10a-rules-v1',
        urgency: 'EMERGENT',
        red_flag: true,
        specialty_codes: ['emergency_care'],
        explanation_key: 'care_nav.explain.red_flag',
        emergency_guidance_key: 'care_nav.emergency.cardiac',
        booking_handoff_allowed: false,
        created_at: '2026-08-29T10:05:00.000Z',
      },
    });

    wrap(<CareNavigationScreen />);
    await user.click(screen.getByRole('button', { name: /Start care navigation/i }));
    await user.type(screen.getByLabelText(/main concern/i), 'chest pain and shortness of breath');
    await user.click(screen.getByRole('button', { name: /Continue/i }));
    await waitFor(() => screen.getByLabelText(/How long have you had these symptoms/i));
    await user.type(screen.getByLabelText(/How long have you had these symptoms/i), '1 hour');
    await user.click(screen.getByRole('button', { name: /Save answer/i }));
    await waitFor(() => screen.getByLabelText(/getting worse/i));
    await user.type(screen.getByLabelText(/getting worse/i), 'worse');
    await user.click(screen.getByRole('button', { name: /Save answer/i }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Urgent guidance' })).toBeInTheDocument();
    });
    expect(screen.getByText(/emergency number/i)).toBeInTheDocument();
    expect(screen.getByText(/not available for urgent guidance/i)).toBeInTheDocument();
  });

  it('shows disabled pack state on 403', async () => {
    const user = userEvent.setup();
    mockCreate.mockRejectedValue(
      new CareNavApiError('Care navigation is not enabled for this country', 403, 'FORBIDDEN'),
    );
    wrap(<CareNavigationScreen />);
    await user.click(screen.getByRole('button', { name: /Start care navigation/i }));
    await user.type(screen.getByLabelText(/main concern/i), 'cough');
    await user.click(screen.getByRole('button', { name: /Continue/i }));
    await waitFor(() => {
      expect(screen.getByText(/Care navigation unavailable/i)).toBeInTheDocument();
    });
  });

  it('shows network error state', async () => {
    const user = userEvent.setup();
    mockCreate.mockRejectedValue(new CareNavApiError('network_failure', 0));
    wrap(<CareNavigationScreen />);
    await user.click(screen.getByRole('button', { name: /Start care navigation/i }));
    await user.type(screen.getByLabelText(/main concern/i), 'cough');
    await user.click(screen.getByRole('button', { name: /Continue/i }));
    await waitFor(() => {
      expect(screen.getByText(/Connection problem/i)).toBeInTheDocument();
    });
  });

  it('shows conflict state on 409', async () => {
    const user = userEvent.setup();
    mockCreate.mockResolvedValue({ ...sessionBase });
    mockAnswer
      .mockResolvedValueOnce({ ...sessionBase, answers: [{ question_key: 'duration', answer_text: '2 days', created_at: 'x' }] })
      .mockResolvedValueOnce({
        ...sessionBase,
        answers: [
          { question_key: 'duration', answer_text: '2 days', created_at: 'x' },
          { question_key: 'symptom_change', answer_text: 'same', created_at: 'y' },
        ],
      });
    mockComplete.mockRejectedValue(new CareNavApiError('Intake can only be completed from INTAKE status', 409));
    wrap(<CareNavigationScreen />);
    await user.click(screen.getByRole('button', { name: /Start care navigation/i }));
    await user.type(screen.getByLabelText(/main concern/i), 'cough');
    await user.click(screen.getByRole('button', { name: /Continue/i }));
    await waitFor(() => screen.getByLabelText(/How long have you had these symptoms/i));
    await user.type(screen.getByLabelText(/How long have you had these symptoms/i), '2 days');
    await user.click(screen.getByRole('button', { name: /Save answer/i }));
    await waitFor(() => screen.getByLabelText(/getting worse/i));
    await user.type(screen.getByLabelText(/getting worse/i), 'same');
    await user.click(screen.getByRole('button', { name: /Save answer/i }));
    await waitFor(() => {
      expect(screen.getByText(/Session cannot be updated/i)).toBeInTheDocument();
    });
  });
});
