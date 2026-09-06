import { CmsContentStatus } from '@prisma/client';
import { Errors } from '../common/problem';

const TRANSITIONS: Record<CmsContentStatus, CmsContentStatus[]> = {
  [CmsContentStatus.DRAFT]: [CmsContentStatus.IN_REVIEW],
  [CmsContentStatus.IN_REVIEW]: [CmsContentStatus.PUBLISHED, CmsContentStatus.DRAFT],
  [CmsContentStatus.PUBLISHED]: [CmsContentStatus.ARCHIVED, CmsContentStatus.DRAFT],
  [CmsContentStatus.ARCHIVED]: [CmsContentStatus.PUBLISHED],
};

export function assertCmsTransition(from: CmsContentStatus, to: CmsContentStatus) {
  const allowed = TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw Errors.conflict(`Invalid CMS content transition: ${from} -> ${to}`);
  }
}

export function isTerminalCmsStatus(status: CmsContentStatus): boolean {
  return status === CmsContentStatus.ARCHIVED;
}

export function isEditableCmsStatus(status: CmsContentStatus): boolean {
  return status === CmsContentStatus.DRAFT || status === CmsContentStatus.IN_REVIEW;
}
