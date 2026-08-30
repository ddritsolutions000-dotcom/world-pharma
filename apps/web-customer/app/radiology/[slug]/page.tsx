import { ImagingDetailScreen } from '../../../src/imaging-detail-page';

export default async function RadiologyDetailRoute({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <ImagingDetailScreen slug={slug} />;
}
