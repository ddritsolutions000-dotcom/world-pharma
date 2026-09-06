import { JoinShell } from '../../src/join-shell';
import { fetchJoinArticle } from '../../src/join-cms';
import { AffiliatePartnerLanding } from '../../src/affiliate-partner-landing';

export default async function AffiliateJoinPage() {
  const cms = await fetchJoinArticle('join-affiliate');
  return (
    <JoinShell>
      <AffiliatePartnerLanding cms={cms} />
    </JoinShell>
  );
}
