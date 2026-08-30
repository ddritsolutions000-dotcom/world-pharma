import { CareNavApiError } from './care-nav-api';
import {
  CARE_NAV_INTAKE_QUESTIONS,
  classifyCareNavError,
  explanationCopy,
  intakeProgress,
  isTerminalCareNavStatus,
  nextUnansweredQuestion,
} from './care-nav-utils';

describe('care-nav utils (mobile parity)', () => {
  const session = {
    id: 's',
    status: 'INTAKE' as const,
    country_id: 'c',
    chief_complaint_summary: 'x',
    urgency: null,
    specialty_code: null,
    red_flag: false,
    expires_at: 'x',
    created_at: 'x',
    completed_at: null,
    terminated_at: null,
    answers: [{ question_key: 'duration', answer_text: '2d', created_at: 'x' }],
  };

  it('classifies network, conflict, and disabled pack errors', () => {
    expect(classifyCareNavError(new CareNavApiError('network_failure', 0))).toBe('network');
    expect(classifyCareNavError(new CareNavApiError('conflict', 409))).toBe('conflict');
    expect(
      classifyCareNavError(new CareNavApiError('Care navigation is not enabled for this country', 403)),
    ).toBe('disabled_pack');
  });

  it('tracks intake progress and unanswered questions', () => {
    expect(nextUnansweredQuestion(session)?.key).toBe('symptom_change');
    expect(intakeProgress(session)).toEqual({ answered: 1, total: CARE_NAV_INTAKE_QUESTIONS.length });
    expect(
      nextUnansweredQuestion({
        ...session,
        answers: [
          { question_key: 'duration', answer_text: '2d', created_at: 'x' },
          { question_key: 'symptom_change', answer_text: 'same', created_at: 'y' },
        ],
      }),
    ).toBeNull();
  });

  it('detects terminal session status for non-editable UI', () => {
    expect(isTerminalCareNavStatus('COMPLETED')).toBe(true);
    expect(isTerminalCareNavStatus('INTAKE')).toBe(false);
  });

  it('uses non-diagnostic explanation copy', () => {
    expect(explanationCopy('care_nav.explain.routine')).toMatch(/not a diagnosis/i);
  });
});
