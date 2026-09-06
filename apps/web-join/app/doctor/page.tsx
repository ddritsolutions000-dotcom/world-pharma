import { JoinShell } from '../../src/join-shell';
import { fetchJoinArticle } from '../../src/join-cms';
import { DoctorPartnerLanding } from '../../src/doctor-partner-landing';

export default async function DoctorJoinPage() {
  const cms = await fetchJoinArticle('join-doctor');
  return (
    <JoinShell>
      <DoctorPartnerLanding cms={cms} />
    </JoinShell>
  );
}
