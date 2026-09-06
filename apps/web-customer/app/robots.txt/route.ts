import { loadPublishedSeo } from '../../src/load-published-seo';

export async function GET() {
  const seo = await loadPublishedSeo();
  return new Response(seo.robotsTxt, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
