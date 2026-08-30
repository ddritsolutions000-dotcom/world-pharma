import { RulesTriageEngine } from './rules-triage.engine';

describe('RulesTriageEngine', () => {
  const engine = new RulesTriageEngine();

  it('flags emergent red-flag patterns', () => {
    const result = engine.evaluate({
      chiefComplaint: 'chest pain and shortness of breath',
      answers: [],
    });
    expect(result.redFlag).toBe(true);
    expect(result.urgency).toBe('EMERGENT');
    expect(result.emergencyGuidanceKey).toBeTruthy();
  });

  it('returns routine for mild complaints', () => {
    const result = engine.evaluate({
      chiefComplaint: 'mild headache',
      answers: [{ questionKey: 'duration', answerText: '2 days' }],
    });
    expect(result.redFlag).toBe(false);
    expect(result.urgency).toBe('ROUTINE');
  });
});
