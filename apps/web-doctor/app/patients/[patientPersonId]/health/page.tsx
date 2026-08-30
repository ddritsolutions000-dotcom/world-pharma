import { DoctorShell } from '../../../../src/doctor-shell';
import { DoctorPatientHealthPanel } from '../../../../src/patient-health-page';

export default async function DoctorPatientHealthRoute({
  params,
  searchParams,
}: {
  params: Promise<{ patientPersonId: string }>;
  searchParams: Promise<{ country?: string }>;
}) {
  const { patientPersonId } = await params;
  const query = await searchParams;
  const countryCode = (query.country ?? 'XX').toUpperCase();

  return (
    <DoctorShell
      title="Patient health"
      description="Timeline metadata only. Clinical payloads require consent and are loaded separately."
    >
      <DoctorPatientHealthPanel patientPersonId={patientPersonId} countryCode={countryCode} />
    </DoctorShell>
  );
}
