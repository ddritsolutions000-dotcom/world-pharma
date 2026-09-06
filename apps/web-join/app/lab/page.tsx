import { JoinShell } from '../../src/join-shell';
import { fetchJoinArticle } from '../../src/join-cms';
import { LabPartnerLanding } from '../../src/lab-partner-landing';

export default async function LabPartnerPage() {
  const cms = await fetchJoinArticle('join-lab');
  return (
    <JoinShell>
      <LabPartnerLanding cms={cms} />
    </JoinShell>
  );
}
