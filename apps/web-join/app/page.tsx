import { JoinShell } from '../src/join-shell';
import { fetchJoinHomeCopy } from '../src/join-cms';
import { VendorLanding } from '../src/vendor-landing';

export default async function Page() {
  const cms = await fetchJoinHomeCopy();
  return (
    <JoinShell>
      <VendorLanding cms={cms} />
    </JoinShell>
  );
}
