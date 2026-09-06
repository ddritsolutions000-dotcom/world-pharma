import { Suspense } from 'react';
import { ReferralLandingScreen } from '../../../src/referral-landing-page';

export default async function ReferralRoute({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ lid?: string; country?: string }>;
}) {
  const { code } = await params;
  void searchParams;
  return (
    <Suspense fallback={null}>
      <ReferralLandingScreen code={code} />
    </Suspense>
  );
}
