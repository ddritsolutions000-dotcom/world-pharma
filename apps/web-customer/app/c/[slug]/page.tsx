import { CategoryBrowse } from '../../../src/category-browse-page';

export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <CategoryBrowse slug={slug} />;
}
