import { LabPackageDetailPage } from '../../../../src/lab-package-detail-page';

export default async function LabPackageDetailRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <LabPackageDetailPage packageId={id} />;
}
