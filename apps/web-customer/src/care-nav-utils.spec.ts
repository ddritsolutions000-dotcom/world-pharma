import { CareNavApiError } from './care-nav-api';
import {
  CARE_NAV_INTAKE_QUESTIONS,
  classifyCareNavError,
  emergencyGuidanceCopy,
  explanationCopy,
  nextUnansweredQuestion,
} from './care-nav-utils';

describe('care-nav utils (web)', () => {
  it('classifies disabled pack from API error', () => {
    expect(
      classifyCareNavError(new CareNavApiError('Care navigation is not enabled for this country', 403)),
    ).toBe('disabled_pack');
  });

  it('finds next unanswered intake question', () => {
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
    expect(nextUnansweredQuestion(session)?.key).toBe('symptom_change');
    expect(CARE_NAV_INTAKE_QUESTIONS).toHaveLength(2);
  });

  it('maps explanation and emergency copy without diagnostic language', () => {
    expect(explanationCopy('care_nav.explain.routine')).toMatch(/not a diagnosis/i);
    expect(emergencyGuidanceCopy('care_nav.emergency.cardiac')).toMatch(/emergency/i);
  });
});
