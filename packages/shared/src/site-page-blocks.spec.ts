import { landingIsLive, parseLandingDocument, stringifyLandingDocument } from './site-page-blocks';

describe('landing documents', () => {
  it('parses blocks and drops javascript hrefs', () => {
    const parsed = parseLandingDocument(
      stringifyLandingDocument({
        version: 1,
        seo: { title: 'Offer', noindex: true },
        blocks: [
          {
            id: 'h1',
            enabled: true,
            type: 'hero',
            title: 'Hero',
            body: 'Body',
            ctaHref: 'javascript:alert(1)',
          },
        ],
      }),
    );
    expect(parsed?.seo.title).toBe('Offer');
    expect(parsed?.seo.noindex).toBe(true);
    expect(parsed?.blocks[0]).toMatchObject({ type: 'hero', title: 'Hero' });
    expect(parsed && parsed.blocks[0].type === 'hero' ? parsed.blocks[0].ctaHref : 'x').toBeUndefined();
  });

  it('returns null for markdown bodies', () => {
    expect(parseLandingDocument('## Hello\n\nWorld')).toBeNull();
  });

  it('treats future scheduledFrom as not live', () => {
    const doc = parseLandingDocument(
      JSON.stringify({
        version: 1,
        seo: {},
        scheduledFrom: '2099-01-01T00:00:00.000Z',
        blocks: [{ id: 'r', enabled: true, type: 'rich', body: 'later' }],
      }),
    );
    expect(doc).toBeTruthy();
    expect(landingIsLive(doc!, Date.parse('2026-09-01T00:00:00.000Z'))).toBe(false);
  });

  it('parses a links grid and drops javascript hrefs', () => {
    const parsed = parseLandingDocument(
      JSON.stringify({
        version: 1,
        seo: {},
        blocks: [
          {
            id: 'g1',
            enabled: true,
            type: 'links',
            title: 'Explore',
            items: [
              { label: 'Safe', href: '/lab' },
              { label: 'Bad', href: 'javascript:alert(1)' },
            ],
          },
        ],
      }),
    );
    expect(parsed?.blocks[0]).toMatchObject({ type: 'links', title: 'Explore' });
    const links = parsed?.blocks[0];
    expect(links && links.type === 'links' ? links.items : []).toEqual([{ label: 'Safe', href: '/lab' }]);
  });
});
