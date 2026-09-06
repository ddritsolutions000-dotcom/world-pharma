import { SaltIndexPage } from '../../../src/salt-index-page';

export default async function SaltRoute({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <SaltIndexPage slug={slug} />;
}
