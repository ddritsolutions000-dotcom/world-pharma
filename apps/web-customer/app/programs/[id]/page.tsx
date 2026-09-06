import { SpecialityProgramDetailPage } from '../../../src/speciality-program-detail-page';

export default async function ProgramDetailRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SpecialityProgramDetailPage programId={id} />;
}
