import { CareNavApiError } from './care-nav-api';
import type { CareNavAssessment, CareNavSession, CareNavSessionStatus } from './care-nav-api';

export type CareNavViewError =
  | 'network'
  | 'unauthorized'
  | 'forbidden'
  | 'disabled_pack'
  | 'not_found'
  | 'conflict'
  | 'expired_session'
  | 'validation'
  | 'generic';

export type CareNavIntakeQuestion = {
  key: string;
  label: string;
  placeholder: string;
  required: boolean;
};

export const CARE_NAV_INTAKE_QUESTIONS: CareNavIntakeQuestion[] = [
  {
    key: 'duration',
    label: 'How long have you had these symptoms?',
    placeholder: 'e.g. 2 days',
    required: true,
  },
  {
    key: 'symptom_change',
    label: 'Are your symptoms getting worse, better, or staying the same?',
    placeholder: 'e.g. staying the same',
    required: true,
  },
];

export function classifyCareNavError(error: unknown): CareNavViewError {
  if (!(error instanceof CareNavApiError)) {
    return 'generic';
  }
  if (error.status === 0) {
    return 'network';
  }
  if (error.status === 401) {
    return 'unauthorized';
  }
  if (error.status === 403) {
    const msg = error.message.toLowerCase();
    if (msg.includes('not enabled') || msg.includes('care navigation is not enabled')) {
      return 'disabled_pack';
    }
    if (msg.includes('expired')) {
      return 'expired_session';
    }
    return 'forbidden';
  }
  if (error.status === 404) {
    return 'not_found';
  }
  if (error.status === 409) {
    return 'conflict';
  }
  if (error.status === 400) {
    return 'validation';
  }
  return 'generic';
}

export function isTerminalCareNavStatus(status: CareNavSessionStatus): boolean {
  return status === 'COMPLETED' || status === 'TERMINATED';
}

export function nextUnansweredQuestion(
  session: CareNavSession,
  questions: CareNavIntakeQuestion[] = CARE_NAV_INTAKE_QUESTIONS,
): CareNavIntakeQuestion | null {
  const answered = new Set((session.answers ?? []).map((row) => row.question_key));
  return questions.find((q) => !answered.has(q.key)) ?? null;
}

export function intakeProgress(session: CareNavSession): { answered: number; total: number } {
  const total = CARE_NAV_INTAKE_QUESTIONS.length;
  const answered = (session.answers ?? []).filter((row) =>
    CARE_NAV_INTAKE_QUESTIONS.some((q) => q.key === row.question_key),
  ).length;
  return { answered, total };
}

export function explanationCopy(key: string): string {
  const map: Record<string, string> = {
    'care_nav.explain.routine':
      'Based on the information you provided, a routine care visit may be appropriate. This is guidance only — not a diagnosis.',
    'care_nav.explain.fever':
      'Your responses suggest you should seek care soon. This tool does not diagnose conditions.',
    'care_nav.explain.abdominal':
      'Your responses suggest timely medical attention may be appropriate. This is not a diagnosis.',
    'care_nav.explain.red_flag':
      'Your responses include signs that may need urgent attention. Follow the emergency guidance below.',
  };
  return map[key] ?? 'Review the guidance below. This tool provides navigation support only — not medical diagnosis.';
}

export function emergencyGuidanceCopy(key: string | null | undefined): string | null {
  if (!key) {
    return null;
  }
  const map: Record<string, string> = {
    'care_nav.emergency.cardiac':
      'If you have chest pain or pressure, call your local emergency number or go to the nearest emergency department immediately.',
    'care_nav.emergency.breathing':
      'If you have severe difficulty breathing, call your local emergency number or go to the nearest emergency department immediately.',
    'care_nav.emergency.bleeding':
      'If you have severe or uncontrolled bleeding, call your local emergency number or seek emergency care immediately.',
    'care_nav.emergency.stroke':
      'If you suspect a stroke (face drooping, arm weakness, speech difficulty), call your local emergency number immediately.',
    'care_nav.emergency.mental_health':
      'If you are in crisis or thinking about harming yourself, contact your local emergency number or a crisis helpline immediately.',
  };
  return map[key] ?? 'Seek emergency care immediately if you feel unsafe or your symptoms are severe.';
}

export function urgencyLabel(urgency: CareNavAssessment['urgency']): string {
  const map: Record<CareNavAssessment['urgency'], string> = {
    ROUTINE: 'Routine',
    SOON: 'Soon',
    URGENT: 'Urgent',
    EMERGENT: 'Emergent',
  };
  return map[urgency] ?? urgency;
}

export function matchExplanationCopy(key: string): string {
  const primary = key.split(';')[0] ?? key;
  const map: Record<string, string> = {
    'care_nav.match.specialty_match':
      'Recommended because this provider supports the care type suggested by your triage guidance.',
    'care_nav.match.general_practice_fallback':
      'Recommended as a general practice provider available in your region.',
    'care_nav.match.country_eligible': 'Recommended because this provider is eligible in your country.',
    'care_nav.match.no_providers':
      'No eligible providers are available right now. You may try again later or contact support.',
    'care_nav.match.completed': 'These providers were matched using deterministic rules — not a diagnosis.',
  };
  return map[primary] ?? 'Provider recommendation based on operational eligibility rules.';
}

export function slotWindowIso(): { from: string; to: string } {
  const from = new Date();
  from.setUTCHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setUTCDate(to.getUTCDate() + 14);
  return { from: from.toISOString(), to: to.toISOString() };
}
