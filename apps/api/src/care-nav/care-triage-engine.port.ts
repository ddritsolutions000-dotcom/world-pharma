export interface TriageInput {
  chiefComplaint: string;
  answers: Array<{ questionKey: string; answerText: string }>;
}

export interface TriageResult {
  urgency: 'ROUTINE' | 'SOON' | 'URGENT' | 'EMERGENT';
  redFlag: boolean;
  specialtyCodes: string[];
  explanationKey: string;
  emergencyGuidanceKey: string | null;
  rulesVersion: string;
}

export abstract class CareTriageEnginePort {
  abstract evaluate(input: TriageInput): TriageResult;
}
