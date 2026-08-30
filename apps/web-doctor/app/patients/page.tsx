import { DoctorShell } from '../../src/doctor-shell';
import { DoctorPatientPickerPanel } from '../../src/patient-picker-panel';

export default function DoctorPatientsRoute() {
  return (
    <DoctorShell
      title="Patients"
      description="Select a patient with an active clinical relationship before opening health records."
    >
      <DoctorPatientPickerPanel />
    </DoctorShell>
  );
}
