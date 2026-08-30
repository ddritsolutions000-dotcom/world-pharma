import { CareTriageEnginePort, type TriageInput, type TriageResult } from './care-triage-engine.port';

const RULES_VERSION = 'r10a-rules-v1';

const RED_FLAG_PATTERNS: Array<{ pattern: RegExp; guidanceKey: string }> = [
  { pattern: /chest\s+pain|crushing\s+chest/i, guidanceKey: 'care_nav.emergency.cardiac' },
  { pattern: /shortness\s+of\s+breath|cannot\s+breathe|difficulty\s+breathing/i, guidanceKey: 'care_nav.emergency.breathing' },
  { pattern: /severe\s+bleeding|uncontrolled\s+bleed/i, guidanceKey: 'care_nav.emergency.bleeding' },
  { pattern: /stroke|face\s+drooping|slurred\s+speech|sudden\s+weakness/i, guidanceKey: 'care_nav.emergency.stroke' },
  { pattern: /suicidal|self[- ]harm|want\s+to\s+die/i, guidanceKey: 'care_nav.emergency.mental_health' },
];

function combinedText(input: TriageInput): string {
  const parts = [input.chiefComplaint, ...input.answers.map((a) => a.answerText)];
  return parts.join(' ').toLowerCase();
}

export class RulesTriageEngine extends CareTriageEnginePort {
  evaluate(input: TriageInput): TriageResult {
    const text = combinedText(input);

    for (const rule of RED_FLAG_PATTERNS) {
      if (rule.pattern.test(text)) {
        return {
          urgency: 'EMERGENT',
          redFlag: true,
          specialtyCodes: ['emergency_care'],
          explanationKey: 'care_nav.explain.red_flag',
          emergencyGuidanceKey: rule.guidanceKey,
          rulesVersion: RULES_VERSION,
        };
      }
    }

    if (/\bfever\b|high\s+temperature/i.test(text)) {
      return {
        urgency: 'SOON',
        redFlag: false,
        specialtyCodes: ['general_practice'],
        explanationKey: 'care_nav.explain.fever',
        emergencyGuidanceKey: null,
        rulesVersion: RULES_VERSION,
      };
    }

    if (/\babdominal\s+pain|stomach\s+pain/i.test(text)) {
      return {
        urgency: 'URGENT',
        redFlag: false,
        specialtyCodes: ['general_practice'],
        explanationKey: 'care_nav.explain.abdominal',
        emergencyGuidanceKey: null,
        rulesVersion: RULES_VERSION,
      };
    }

    return {
      urgency: 'ROUTINE',
      redFlag: false,
      specialtyCodes: ['general_practice'],
      explanationKey: 'care_nav.explain.routine',
      emergencyGuidanceKey: null,
      rulesVersion: RULES_VERSION,
    };
  }
}
