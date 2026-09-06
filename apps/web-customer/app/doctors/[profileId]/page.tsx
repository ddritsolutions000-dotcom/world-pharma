import { DoctorDetailScreen } from '../../../src/doctor-detail-page';

export default async function DoctorProfileRoute({
  params,
}: {
  params: Promise<{ profileId: string }>;
}) {
  const { profileId } = await params;
  return <DoctorDetailScreen profileId={profileId} />;
}
