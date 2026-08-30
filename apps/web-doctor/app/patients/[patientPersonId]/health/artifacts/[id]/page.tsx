import { DoctorShell } from '../../../../../../src/doctor-shell';
import { DoctorPatientHealthArtifactPanel } from '../../../../../../src/patient-health-artifact-page';

export default async function DoctorPatientHealthArtifactRoute({
  params,
  searchParams,
}: {
  params: Promise<{ patientPersonId: string; id: string }>;
  searchParams: Promise<{ country?: string }>;
}) {
  const { patientPersonId, id } = await params;
  const query = await searchParams;
  const countryCode = (query.country ?? 'XX').toUpperCase();

  return (
    <DoctorShell
      title="Health record"
      description="Artifact metadata and authorized clinical payload for the selected patient."
    >
      <DoctorPatientHealthArtifactPanel
        patientPersonId={patientPersonId}
        artifactId={id}
        countryCode={countryCode}
      />
    </DoctorShell>
  );
}
