import { Suspense } from 'react';
import { MarketingSegmentDetail } from '../../../../src/marketing-segment-detail';

export default async function MarketingSegmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={null}>
      <MarketingSegmentDetail segmentId={id} />
    </Suspense>
  );
}
