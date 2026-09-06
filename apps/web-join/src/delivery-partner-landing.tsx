import Link from 'next/link';
import { Button, Heading, Text } from '@world-pharma/ui-kit/web';
import { DEFAULT_JOIN_DELIVERY, resolveJoinPageContent } from '@world-pharma/shared/join-page-blocks';
import type { JoinCmsCopy } from './join-cms';
import { JoinBenefitsSection, JoinFaqSection, JoinStepsSection } from './join-landing-sections';

const DEFAULT_SUMMARY =
  'Join World-Pharma as a delivery partner. Accept assigned medicine delivery, sample transport, and physical report delivery jobs through the dedicated mobile app — connected to the same logistics kernel, not a separate delivery engine.';

export function DeliveryPartnerLanding({ cms }: { cms?: JoinCmsCopy | null }) {
  const content = resolveJoinPageContent(cms, DEFAULT_JOIN_DELIVERY, {
    title: 'Delivery partners',
    summary: DEFAULT_SUMMARY,
  });

  return (
    <div className="wp-stack join-landing">
      <section className="join-hero">
        <Heading level={1}>{content.title}</Heading>
        <Text tone="secondary">{content.summary}</Text>
        {content.heroExtra ? <Text tone="secondary">{content.heroExtra}</Text> : null}
        <div className="join-cta-row">
          <Link href="/apply?type=DELIVERY_PARTNER">
            <Button>Join as delivery partner</Button>
          </Link>
          <Link href="/status">
            <Button variant="secondary">Track application</Button>
          </Link>
        </div>
      </section>

      <JoinBenefitsSection title="Why deliver with World-Pharma" benefits={content.benefits} />
      <JoinStepsSection title="How onboarding works" steps={content.steps} />
      <JoinFaqSection faq={content.faq} />

      <section>
        <Link href="/apply?type=DELIVERY_PARTNER">
          <Button>Start delivery application</Button>
        </Link>
      </section>
    </div>
  );
}
