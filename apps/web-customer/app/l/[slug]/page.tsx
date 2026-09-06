import { CmsPage } from '../../../src/cms-page';

export default async function LandingRoute({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <CmsPage
      slug={slug}
      title="Landing"
      fallback={{
        title: 'Page not published yet',
        summary: 'Publish a LANDING document from Main Admin CMS to show this URL.',
        body: 'Operators can add hero, FAQ, and CTA blocks without a code change.',
      }}
    />
  );
}
