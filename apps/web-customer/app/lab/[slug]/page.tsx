import { LabDetailScreen } from '../../../src/lab-detail-page';

export default async function LabDetailRoute({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <LabDetailScreen slug={slug} />;
}
