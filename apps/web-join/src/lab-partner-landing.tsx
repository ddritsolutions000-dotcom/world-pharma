import Link from 'next/link';
import { Button, Heading, Text } from '@world-pharma/ui-kit/web';
import { DEFAULT_JOIN_LAB, resolveJoinPageContent } from '@world-pharma/shared/join-page-blocks';
import type { JoinCmsCopy } from './join-cms';
import { JoinBenefitsSection, JoinFaqSection, JoinStepsSection } from './join-landing-sections';

const DEFAULT_SUMMARY =
  'Join World-Pharma as a diagnostic laboratory operator. Manage test catalog, bookings, sample collection, processing, digital reports, and physical report delivery through one connected platform — not a separate lab engine.';

export function LabPartnerLanding({ cms }: { cms?: JoinCmsCopy | null }) {
  const content = resolveJoinPageContent(cms, DEFAULT_JOIN_LAB, {
    title: 'Laboratory partners',
    summary: DEFAULT_SUMMARY,
  });

  return (
    <div className="wp-stack join-landing">
      <section className="join-hero">
        <Heading level={1}>{content.title}</Heading>
        <Text tone="secondary">{content.summary}</Text>
        {content.heroExtra ? <Text tone="secondary">{content.heroExtra}</Text> : null}
        <Text tone="secondary">
          Sandbox onboarding — accreditation claims are not self-attested. Company review activates your lab organization.
          Sandbox reports are not a live diagnostic network.
        </Text>
        <div className="join-cta-row">
          <Link href="/apply?type=LAB">
            <Button>Join as a lab</Button>
          </Link>
          <Link href="/status">
            <Button variant="secondary">Track application</Button>
          </Link>
        </div>
      </section>

      <JoinBenefitsSection title="Why partner as a lab" benefits={content.benefits} />
      <JoinStepsSection title="How onboarding works" steps={content.steps} />
      <JoinFaqSection faq={content.faq} />

      <section>
        <Link href="/apply?type=LAB">
          <Button>Start lab application</Button>
        </Link>
      </section>
    </div>
  );
}
