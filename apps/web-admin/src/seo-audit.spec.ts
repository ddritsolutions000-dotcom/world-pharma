import { seoIssuesFor } from './seo-audit';

describe('seoIssuesFor', () => {
  it('flags short titles and unpublished rows', () => {
    const issues = seoIssuesFor({
      id: '1',
      title: 'Hi',
      slug: 'hi',
      summary: 'Too short',
      status: 'DRAFT',
      locale: 'en',
      content_type: 'ARTICLE',
    });
    expect(issues.map((row) => row.code)).toEqual(expect.arrayContaining(['title_short', 'meta_short', 'not_published']));
  });

  it('passes a healthy published article', () => {
    const issues = seoIssuesFor({
      id: '1',
      title: 'Paracetamol uses, dosage and safety in India',
      slug: 'paracetamol-uses',
      summary:
        'Learn when paracetamol is used, typical adult dosing, and when to talk to a doctor. Educational content only.',
      status: 'PUBLISHED',
      locale: 'en',
      content_type: 'ARTICLE',
    });
    expect(issues).toEqual([]);
  });
});
