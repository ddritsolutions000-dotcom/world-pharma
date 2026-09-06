import { CmsContentType } from '@prisma/client';

const PUBLIC_TYPES = new Set<CmsContentType>([
  CmsContentType.BANNER,
  CmsContentType.LANDING,
  CmsContentType.ARTICLE,
  CmsContentType.FAQ,
  CmsContentType.KB,
  CmsContentType.LEGAL_NOTICE,
]);

export function isPublicCmsMediaContentType(type: CmsContentType): boolean {
  return PUBLIC_TYPES.has(type);
}

export function isCmsStoreKey(key: string): boolean {
  return (
    key.startsWith('cms/') &&
    !key.includes('..') &&
    !key.includes('\\') &&
    !key.includes('\0') &&
    !key.includes('%2e') &&
    !key.includes('%2E') &&
    !/^[a-zA-Z]:/.test(key.slice(4))
  );
}

export function helpMediaPath(assetId: string, countryCode: string): string {
  return `/api/v1/help/media/${encodeURIComponent(assetId)}?country_code=${encodeURIComponent(countryCode)}`;
}
