import type { CmsContentItem } from './cms-admin-api';
import {
  createCmsContent,
  listCmsContent,
  publishCmsContent,
  reviseCmsContent,
  updateCmsContent,
} from './cms-admin-api';

export async function upsertPublishedPackString(input: {
  token: string;
  country: string;
  slug: string;
  title: string;
  summary: string;
  body: string;
}): Promise<CmsContentItem> {
  const listed = await listCmsContent(input.token, { country_code: input.country, content_type: 'PACK_STRING' });
  let item = listed.data.find((row) => row.slug === input.slug);
  if (!item) {
    item = await createCmsContent(input.token, {
      country_code: input.country,
      content_type: 'PACK_STRING',
      slug: input.slug,
      title: input.title,
      summary: input.summary,
      body: input.body,
      locale: 'en',
    });
  } else {
    if (item.status === 'PUBLISHED') {
      item = await reviseCmsContent(input.token, item.id, input.country);
    }
    if (item.status === 'ARCHIVED') {
      item = await publishCmsContent(input.token, item.id, input.country, `reopen-${item.id}-${Date.now()}`);
      item = await reviseCmsContent(input.token, item.id, input.country);
    }
    item = await updateCmsContent(input.token, item.id, {
      country_code: input.country,
      title: input.title,
      summary: input.summary,
      body: input.body,
      expected_version: item.version,
    });
  }
  return publishCmsContent(input.token, item.id, input.country, `chrome-${item.id}-${Date.now()}`);
}
