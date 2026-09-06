import Link from 'next/link';
import { Button, Heading, Text } from '@world-pharma/ui-kit/web';
import { DEFAULT_JOIN_PHARMACY, resolveJoinPageContent } from '@world-pharma/shared/join-page-blocks';
import type { JoinCmsCopy } from './join-cms';
import { JoinBenefitsSection, JoinFaqSection, JoinStepsSection } from './join-landing-sections';

const DEFAULT_SUMMARY =
  'Join World-Pharma as a pharmacy operator. Fulfil customer orders, manage store inventory, and operate dispensing workflows through the dedicated store portal — connected to the central marketplace platform.';

export function PharmacyPartnerLanding({ cms }: { cms?: JoinCmsCopy | null }) {
  const portalUrl = process.env.NEXT_PUBLIC_STORE_PORTAL_URL ?? 'http://localhost:3003';
  const content = resolveJoinPageContent(cms, DEFAULT_JOIN_PHARMACY, {
    title: 'Pharmacy operators',
    summary: DEFAULT_SUMMARY,
  });

  return (
    <div className="wp-stack join-landing">
      <section className="join-hero">
        <Heading level={1}>{content.title}</Heading>
        <Text tone="secondary">{content.summary}</Text>
        {content.heroExtra ? <Text tone="secondary">{content.heroExtra}</Text> : null}
        <Text tone="secondary">
          Sandbox onboarding — licensing and commercial approval are company-reviewed. Approval is not instant and does
          not grant live marketplace access before activation.
        </Text>
        <div className="join-cta-row">
          <Link href="/apply?type=PHARMACY">
            <Button>Apply as pharmacy operator</Button>
          </Link>
          <Link href="/status">
            <Button variant="secondary">Track application</Button>
          </Link>
          <a href={portalUrl}>
            <Button variant="tertiary">Store portal login</Button>
          </a>
        </div>
      </section>

      <JoinBenefitsSection title="Why partner as a pharmacy" benefits={content.benefits} />
      <JoinStepsSection title="How onboarding works" steps={content.steps} />
      <JoinFaqSection faq={content.faq} />

      <section>
        <Link href="/apply?type=PHARMACY">
          <Button>Start pharmacy application</Button>
        </Link>
      </section>
    </div>
  );
}
