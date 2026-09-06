import { upsertPublishedPackString } from './site-chrome-save';
import { createCmsContent, listCmsContent, publishCmsContent, reviseCmsContent, updateCmsContent } from './cms-admin-api';

jest.mock('./cms-admin-api', () => ({
  listCmsContent: jest.fn(),
  createCmsContent: jest.fn(),
  reviseCmsContent: jest.fn(),
  updateCmsContent: jest.fn(),
  publishCmsContent: jest.fn(),
}));

const token = 't';
const baseItem = {
  id: '11111111-1111-4111-8111-111111111111',
  country_id: 'c',
  content_type: 'PACK_STRING',
  slug: 'site-nav',
  locale: 'en',
  status: 'DRAFT',
  title: 'nav',
  summary: '',
  body: '{}',
  author_person_id: 'p',
  published_version: 0,
  version: 1,
  created_at: '',
  updated_at: '',
};

describe('upsertPublishedPackString', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('creates then publishes when missing', async () => {
    (listCmsContent as jest.Mock).mockResolvedValue({ data: [] });
    (createCmsContent as jest.Mock).mockResolvedValue(baseItem);
    (publishCmsContent as jest.Mock).mockResolvedValue({ ...baseItem, status: 'PUBLISHED' });
    await upsertPublishedPackString({
      token,
      country: 'IN',
      slug: 'site-nav',
      title: 'nav',
      summary: 's',
      body: '{}',
    });
    expect(createCmsContent).toHaveBeenCalled();
    expect(publishCmsContent).toHaveBeenCalled();
  });

  it('revises a published pack before update', async () => {
    (listCmsContent as jest.Mock).mockResolvedValue({ data: [{ ...baseItem, status: 'PUBLISHED' }] });
    (reviseCmsContent as jest.Mock).mockResolvedValue({ ...baseItem, status: 'DRAFT', version: 2 });
    (updateCmsContent as jest.Mock).mockResolvedValue({ ...baseItem, status: 'DRAFT', version: 3 });
    (publishCmsContent as jest.Mock).mockResolvedValue({ ...baseItem, status: 'PUBLISHED' });
    await upsertPublishedPackString({
      token,
      country: 'IN',
      slug: 'site-nav',
      title: 'nav',
      summary: 's',
      body: '{}',
    });
    expect(reviseCmsContent).toHaveBeenCalled();
    expect(updateCmsContent).toHaveBeenCalled();
  });
});
