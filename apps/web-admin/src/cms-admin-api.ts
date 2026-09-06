import { adminJson, AdminHttpError } from './admin-http';

export class CmsAdminApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export type CmsContentItem = {
  id: string;
  country_id: string;
  content_type: string;
  slug: string;
  locale: string;
  status: string;
  category_slug?: string | null;
  title: string;
  summary: string;
  body: string;
  author_person_id: string;
  published_version: number;
  version: number;
  created_at: string;
  updated_at: string;
};

export type CmsVersionsResponse = {
  revisions: Array<{ revision_number: number; title: string; created_at: string }>;
  publications: Array<{
    publication_version: number;
    revision_number: number;
    title: string;
    published_at: string;
  }>;
};

export type CmsAssetResponse = {
  asset_id: string;
  country_id: string;
  content_item_id?: string | null;
  content_type: string;
  byte_size: number;
  checksum_sha256: string;
  alt_text?: string | null;
  folder?: string | null;
  created_at: string;
  public_path?: string;
};

export const CMS_CONTENT_TYPES = [
  'ARTICLE',
  'FAQ',
  'KB',
  'BANNER',
  'LANDING',
  'LEGAL_NOTICE',
  'PACK_STRING',
] as const;

export const CMS_STATUSES = ['DRAFT', 'IN_REVIEW', 'PUBLISHED', 'ARCHIVED'] as const;

export function isEditableStatus(status: string): boolean {
  return status === 'DRAFT' || status === 'IN_REVIEW';
}

export async function cmsAdminCall<T = unknown>(
  path: string,
  token: string,
  init?: RequestInit,
): Promise<T> {
  try {
    return await adminJson<T>(token, path, init);
  } catch (err) {
    if (err instanceof AdminHttpError) {
      throw new CmsAdminApiError(err.message, err.status);
    }
    throw new CmsAdminApiError('request_failed', 0);
  }
}

export function listCmsContent(
  token: string,
  query: { country_code: string; status?: string; content_type?: string; slug?: string },
) {
  const params = new URLSearchParams({ country_code: query.country_code });
  if (query.status) {
    params.set('status', query.status);
  }
  if (query.content_type) {
    params.set('content_type', query.content_type);
  }
  if (query.slug) {
    params.set('slug', query.slug);
  }
  return cmsAdminCall<{ data: CmsContentItem[] }>(`/api/v1/admin/cms/content?${params}`, token);
}

export function getCmsContent(token: string, id: string, countryCode: string) {
  return cmsAdminCall<CmsContentItem>(
    `/api/v1/admin/cms/content/${encodeURIComponent(id)}?country_code=${encodeURIComponent(countryCode)}`,
    token,
  );
}

export function createCmsContent(
  token: string,
  body: Record<string, unknown>,
  idempotencyKey?: string,
) {
  return cmsAdminCall<CmsContentItem>(`/api/v1/admin/cms/content`, token, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
  });
}

export function updateCmsContent(token: string, id: string, body: Record<string, unknown>) {
  return cmsAdminCall<CmsContentItem>(`/api/v1/admin/cms/content/${encodeURIComponent(id)}`, token, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function submitCmsReview(token: string, id: string, countryCode: string) {
  return cmsAdminCall<CmsContentItem>(
    `/api/v1/admin/cms/content/${encodeURIComponent(id)}/submit-review`,
    token,
    { method: 'POST', body: JSON.stringify({ country_code: countryCode }) },
  );
}

export function publishCmsContent(
  token: string,
  id: string,
  countryCode: string,
  idempotencyKey?: string,
) {
  return cmsAdminCall<CmsContentItem>(
    `/api/v1/admin/cms/content/${encodeURIComponent(id)}/publish`,
    token,
    {
      method: 'POST',
      body: JSON.stringify({ country_code: countryCode, idempotency_key: idempotencyKey }),
      headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
    },
  );
}

export function reviseCmsContent(token: string, id: string, countryCode: string) {
  return cmsAdminCall<CmsContentItem>(
    `/api/v1/admin/cms/content/${encodeURIComponent(id)}/revise`,
    token,
    { method: 'POST', body: JSON.stringify({ country_code: countryCode }) },
  );
}

export function archiveCmsContent(token: string, id: string, countryCode: string) {
  return cmsAdminCall<CmsContentItem>(
    `/api/v1/admin/cms/content/${encodeURIComponent(id)}/archive`,
    token,
    { method: 'POST', body: JSON.stringify({ country_code: countryCode }) },
  );
}

export function getCmsVersions(token: string, id: string, countryCode: string) {
  return cmsAdminCall<CmsVersionsResponse>(
    `/api/v1/admin/cms/content/${encodeURIComponent(id)}/versions?country_code=${encodeURIComponent(countryCode)}`,
    token,
  );
}

export function listCmsAssets(token: string, countryCode: string, folder?: string) {
  const params = new URLSearchParams({ country_code: countryCode });
  if (folder) {
    params.set('folder', folder);
  }
  return cmsAdminCall<{ data: CmsAssetResponse[] }>(`/api/v1/admin/cms/assets?${params}`, token);
}

export function uploadCmsAsset(
  token: string,
  body: {
    country_code: string;
    content_item_id?: string;
    content_base64: string;
    content_type: string;
    original_name?: string;
    alt_text?: string;
    folder?: string;
  },
) {
  return cmsAdminCall<CmsAssetResponse>(`/api/v1/admin/cms/assets`, token, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function updateCmsAsset(
  token: string,
  assetId: string,
  countryCode: string,
  patch: { alt_text?: string; folder?: string },
) {
  return cmsAdminCall<{ asset_id: string; alt_text: string | null; folder: string | null }>(
    `/api/v1/admin/cms/assets/${encodeURIComponent(assetId)}`,
    token,
    { method: 'PATCH', body: JSON.stringify({ country_code: countryCode, ...patch }) },
  );
}

export function updateCmsAssetAltText(token: string, assetId: string, countryCode: string, altText: string) {
  return updateCmsAsset(token, assetId, countryCode, { alt_text: altText });
}

export async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}
