import { HelpArticleScreen } from '../../../../src/help-article-page';

export default async function HelpArticlePage({
  params,
}: {
  params: Promise<{ articleSlug: string }>;
}) {
  const { articleSlug } = await params;
  return <HelpArticleScreen articleSlug={articleSlug} />;
}
