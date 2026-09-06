import { JoinShell } from '../../src/join-shell';
import { fetchJoinArticle } from '../../src/join-cms';
import { ImagingPartnerLanding } from '../../src/imaging-partner-landing';

export default async function ImagingPartnerPage() {
  const cms = await fetchJoinArticle('join-imaging');
  return (
    <JoinShell>
      <ImagingPartnerLanding cms={cms} />
    </JoinShell>
  );
}
