import { Suspense } from 'react';
import { MarketingCampaignDetail } from '../../../../src/marketing-campaign-detail';

export default async function MarketingCampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={null}>
      <MarketingCampaignDetail campaignId={id} />
    </Suspense>
  );
}
