import { HelpCategoryScreen } from '../../../../src/help-category-page';

export default async function HelpCategoryPage({
  params,
}: {
  params: Promise<{ categorySlug: string }>;
}) {
  const { categorySlug } = await params;
  return <HelpCategoryScreen categorySlug={categorySlug} />;
}
