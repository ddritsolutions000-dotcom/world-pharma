import { HealthArticlePage } from '../../../src/health-article-page';

export default async function BlogArticleRoute({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <HealthArticlePage slug={slug} />;
}
