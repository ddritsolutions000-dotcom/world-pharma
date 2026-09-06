import { parseJoinPageDocument, resolveJoinPageContent, DEFAULT_JOIN_HOME } from './join-page-blocks';

describe('join-page-blocks', () => {
  it('parses structured join JSON', () => {
    const doc = parseJoinPageDocument(
      JSON.stringify({
        version: 1,
        benefits: [{ title: 'A', body: 'B' }],
        steps: ['one'],
        faq: [{ q: 'Q', a: 'A' }],
      }),
    );
    expect(doc?.benefits).toHaveLength(1);
    expect(doc?.steps).toEqual(['one']);
  });

  it('falls back when body is plain text', () => {
    const content = resolveJoinPageContent(
      { title: 'T', summary: 'S', body: 'plain hero only' },
      DEFAULT_JOIN_HOME,
      { title: 'Fallback title', summary: 'Fallback summary' },
    );
    expect(content.heroExtra).toBe('plain hero only');
    expect(content.benefits.length).toBeGreaterThan(0);
  });

  it('resolves partner cards from join-home defaults', () => {
    const content = resolveJoinPageContent(null, DEFAULT_JOIN_HOME, {
      title: 'T',
      summary: 'S',
    });
    expect(content.partnerCards.length).toBeGreaterThan(0);
    expect(content.partnerCards[0]?.href).toMatch(/^\//);
  });
});
