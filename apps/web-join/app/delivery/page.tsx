import { JoinShell } from '../../src/join-shell';
import { fetchJoinArticle } from '../../src/join-cms';
import { DeliveryPartnerLanding } from '../../src/delivery-partner-landing';

export default async function DeliveryJoinPage() {
  const cms = await fetchJoinArticle('join-delivery');
  return (
    <JoinShell>
      <DeliveryPartnerLanding cms={cms} />
    </JoinShell>
  );
}
