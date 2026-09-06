import { CmsContentType } from '@prisma/client';
import { helpMediaPath, isCmsStoreKey, isPublicCmsMediaContentType } from './cms-public-media';

describe('cms public media rules', () => {
  it('allows merchandising types and rejects pack strings', () => {
    expect(isPublicCmsMediaContentType(CmsContentType.BANNER)).toBe(true);
    expect(isPublicCmsMediaContentType(CmsContentType.PACK_STRING)).toBe(false);
  });

  it('only allows cms/ object keys', () => {
    expect(isCmsStoreKey('cms/country/file')).toBe(true);
    expect(isCmsStoreKey('kyc/secret')).toBe(false);
    expect(isCmsStoreKey('cms/../etc')).toBe(false);
  });

  it('builds a help media path', () => {
    expect(helpMediaPath('11111111-1111-4111-8111-111111111111', 'IN')).toContain('/api/v1/help/media/');
  });
});
