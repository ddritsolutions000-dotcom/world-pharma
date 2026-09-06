import { CmsContentStatus } from '@prisma/client';
import { assertCmsTransition } from './cms-status';

describe('cms status', () => {
  it('allows a published document to return to draft for a new revision', () => {
    expect(() => assertCmsTransition(CmsContentStatus.PUBLISHED, CmsContentStatus.DRAFT)).not.toThrow();
  });
});
