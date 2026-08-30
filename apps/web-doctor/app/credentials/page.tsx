import { DoctorShell } from '../../src/doctor-shell';
import { DoctorCredentialsPanel } from '../../src/credentials-panel';

export default function Page() {
  return (
    <DoctorShell
      title="Credentials"
      description="Submit credential metadata. Document bytes stay in private object storage."
    >
      <DoctorCredentialsPanel />
    </DoctorShell>
  );
}
