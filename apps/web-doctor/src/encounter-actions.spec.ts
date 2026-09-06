import {
  availableEncounterActions,
  availableEncounterSecondaryActions,
  encounterActionLabel,
  encounterSecondaryActionLabel,
} from './encounter-actions';

describe('encounter action availability', () => {
  it('requires confirm before check-in', () => {
    expect(availableEncounterActions('REQUESTED')).toEqual(['confirm']);
    expect(availableEncounterActions('CONFIRMED')).toEqual(['check-in']);
  });

  it('exposes start and complete at the correct stages', () => {
    expect(availableEncounterActions('CHECKED_IN')).toEqual(['start']);
    expect(availableEncounterActions('IN_CONSULTATION')).toEqual(['complete']);
    expect(availableEncounterActions('COMPLETED')).toEqual([]);
  });

  it('exposes cancel and no-show secondary actions', () => {
    expect(availableEncounterSecondaryActions('REQUESTED')).toEqual(['cancel']);
    expect(availableEncounterSecondaryActions('CONFIRMED')).toEqual(['cancel', 'no-show']);
    expect(availableEncounterSecondaryActions('IN_CONSULTATION')).toEqual([]);
  });

  it('labels actions for doctors', () => {
    expect(encounterActionLabel('confirm')).toMatch(/confirm/i);
    expect(encounterActionLabel('complete')).toMatch(/complete/i);
    expect(encounterSecondaryActionLabel('no-show')).toMatch(/no-show/i);
  });
});
