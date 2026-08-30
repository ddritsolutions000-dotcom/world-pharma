import { VideoSessionStatus } from '@prisma/client';
import { Errors } from '../common/problem';

const T = VideoSessionStatus;

const ALLOWED: Record<VideoSessionStatus, VideoSessionStatus[]> = {
  [T.CREATED]: [T.READY, T.FAILED, T.EXPIRED],
  [T.READY]: [T.DOCTOR_JOINED, T.CUSTOMER_JOINED, T.EXPIRED, T.FAILED, T.ENDED],
  [T.DOCTOR_JOINED]: [T.IN_PROGRESS, T.ENDED, T.FAILED, T.EXPIRED],
  [T.CUSTOMER_JOINED]: [T.IN_PROGRESS, T.ENDED, T.FAILED, T.EXPIRED],
  [T.IN_PROGRESS]: [T.ENDED, T.FAILED],
  [T.ENDED]: [],
  [T.FAILED]: [],
  [T.EXPIRED]: [],
};

export const ACTIVE_VIDEO_STATUSES: VideoSessionStatus[] = [
  T.CREATED,
  T.READY,
  T.DOCTOR_JOINED,
  T.CUSTOMER_JOINED,
  T.IN_PROGRESS,
];

export function assertVideoTransition(from: VideoSessionStatus, to: VideoSessionStatus): void {
  if (from === to) {
    return;
  }
  if (!ALLOWED[from]?.includes(to)) {
    throw Errors.conflict(`Illegal video session transition ${from} → ${to}`);
  }
}
