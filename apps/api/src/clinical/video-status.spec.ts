import { VideoSessionStatus } from '@prisma/client';
import { assertVideoTransition } from './video-status';

describe('video session state machine', () => {
  it('allows READY → DOCTOR_JOINED → IN_PROGRESS → ENDED', () => {
    expect(() => assertVideoTransition(VideoSessionStatus.READY, VideoSessionStatus.DOCTOR_JOINED)).not.toThrow();
    expect(() => assertVideoTransition(VideoSessionStatus.DOCTOR_JOINED, VideoSessionStatus.IN_PROGRESS)).not.toThrow();
    expect(() => assertVideoTransition(VideoSessionStatus.IN_PROGRESS, VideoSessionStatus.ENDED)).not.toThrow();
  });

  it('rejects ENDED → IN_PROGRESS', () => {
    expect(() => assertVideoTransition(VideoSessionStatus.ENDED, VideoSessionStatus.IN_PROGRESS)).toThrow();
  });
});
