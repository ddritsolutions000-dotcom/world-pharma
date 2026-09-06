import { JoinShell } from '../../src/join-shell';
import { fetchJoinArticle } from '../../src/join-cms';
import { PharmacyPartnerLanding } from '../../src/pharmacy-partner-landing';

export default async function PharmacyJoinPage() {
  const cms = await fetchJoinArticle('join-pharmacy');
  return (
    <JoinShell>
      <PharmacyPartnerLanding cms={cms} />
    </JoinShell>
  );
}
