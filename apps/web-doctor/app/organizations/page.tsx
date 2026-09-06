import { DoctorShell } from '../../src/doctor-shell';
import { DoctorOrganizationsPanel } from '../../src/organizations-panel';

export default function Page() {
  return (
    <DoctorShell
      title="Organizations"
      description="Clinic, hospital, and independent practice memberships from the partner kernel."
      currentNav="organizations"
    >
      <DoctorOrganizationsPanel />
    </DoctorShell>
  );
}
