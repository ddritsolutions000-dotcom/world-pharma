import { LabSampleCocStatus } from '@prisma/client';
import { assertCocTransition, isTerminalCocStatus } from './lab-sample-coc-status';

describe('lab-sample-coc-status', () => {
  it('allows ASSIGNED → ACCEPTED', () => {
    expect(() => assertCocTransition(LabSampleCocStatus.ASSIGNED, LabSampleCocStatus.ACCEPTED)).not.toThrow();
  });

  it('rejects ASSIGNED → COLLECTED', () => {
    expect(() => assertCocTransition(LabSampleCocStatus.ASSIGNED, LabSampleCocStatus.COLLECTED)).toThrow();
  });

  it('allows happy path through HANDED_OVER', () => {
    const path = [
      LabSampleCocStatus.ASSIGNED,
      LabSampleCocStatus.ACCEPTED,
      LabSampleCocStatus.ARRIVED,
      LabSampleCocStatus.VERIFIED,
      LabSampleCocStatus.COLLECTED,
      LabSampleCocStatus.SEALED,
      LabSampleCocStatus.HANDED_OVER,
    ];
    for (let i = 0; i < path.length - 1; i++) {
      expect(() => assertCocTransition(path[i]!, path[i + 1]!)).not.toThrow();
    }
    expect(isTerminalCocStatus(LabSampleCocStatus.HANDED_OVER)).toBe(false);
  });

  it('allows R7-D transport and processing path', () => {
    const path = [
      LabSampleCocStatus.HANDED_OVER,
      LabSampleCocStatus.IN_TRANSIT,
      LabSampleCocStatus.LAB_RECEIVED,
      LabSampleCocStatus.ACCEPTED_BY_LAB,
      LabSampleCocStatus.PROCESSING,
    ];
    for (let i = 0; i < path.length - 1; i++) {
      expect(() => assertCocTransition(path[i]!, path[i + 1]!)).not.toThrow();
    }
    expect(isTerminalCocStatus(LabSampleCocStatus.PROCESSING)).toBe(true);
  });

  it('marks exception states terminal', () => {
    expect(isTerminalCocStatus(LabSampleCocStatus.REJECTED)).toBe(true);
    expect(isTerminalCocStatus(LabSampleCocStatus.LOST)).toBe(true);
  });
});
