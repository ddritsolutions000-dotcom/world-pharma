import { LabProcessingStatus } from '@prisma/client';
import { assertProcessingTransition, isTerminalProcessingStatus } from './lab-processing-status';

describe('lab-processing-status', () => {
  it('allows QUEUED → IN_PROGRESS → COMPLETED', () => {
    expect(() =>
      assertProcessingTransition(LabProcessingStatus.QUEUED, LabProcessingStatus.IN_PROGRESS),
    ).not.toThrow();
    expect(() =>
      assertProcessingTransition(LabProcessingStatus.IN_PROGRESS, LabProcessingStatus.COMPLETED),
    ).not.toThrow();
    expect(isTerminalProcessingStatus(LabProcessingStatus.COMPLETED)).toBe(true);
  });

  it('rejects COMPLETED → IN_PROGRESS', () => {
    expect(() =>
      assertProcessingTransition(LabProcessingStatus.COMPLETED, LabProcessingStatus.IN_PROGRESS),
    ).toThrow();
  });
});
