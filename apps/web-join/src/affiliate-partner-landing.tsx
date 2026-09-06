import Link from 'next/link';
import { Button, Card, Heading, Text } from '@world-pharma/ui-kit/web';
import { DEFAULT_JOIN_AFFILIATE, resolveJoinPageContent } from '@world-pharma/shared/join-page-blocks';
import type { JoinCmsCopy } from './join-cms';
import { JoinBenefitsSection, JoinFaqSection, JoinStepsSection } from './join-landing-sections';

const PROMOTION = [
  'Share referral links on websites, blogs, and approved social channels where permitted by policy.',
  'Use labeled campaign links to compare performance — clicks are recorded server-side.',
  'Do not misrepresent medical advice or clinical services; clinical commission categories remain disabled unless explicitly enabled.',
];

const DEFAULT_SUMMARY =
  'Join World-Pharma as an affiliate partner. Apply online, complete KYC, and operate referral codes and links through the dedicated Affiliate portal — connected to the central marketplace, not a separate commerce engine.';

export function AffiliatePartnerLanding({ cms }: { cms?: JoinCmsCopy | null }) {
  const portalUrl = process.env.NEXT_PUBLIC_AFFILIATE_PORTAL_URL ?? 'http://localhost:3010';
  const content = resolveJoinPageContent(cms, DEFAULT_JOIN_AFFILIATE, {
    title: 'Affiliate program',
    summary: DEFAULT_SUMMARY,
  });

  return (
    <div className="wp-stack join-landing">
      <section className="join-hero">
        <Heading level={1}>{content.title}</Heading>
        <Text tone="secondary">{content.summary}</Text>
        {content.heroExtra ? <Text tone="secondary">{content.heroExtra}</Text> : null}
        <Text tone="secondary">
          Sandbox affiliate program — attribution and earnings status are available after approval. Production payouts
          require company finance rails and are not promised in sandbox.
        </Text>
        <div className="join-cta-row">
          <Link href="/apply?type=AFFILIATE">
            <Button>Apply as affiliate</Button>
          </Link>
          <Link href="/status">
            <Button variant="secondary">Track application</Button>
          </Link>
          <a href={portalUrl}>
            <Button variant="tertiary">Affiliate portal login</Button>
          </a>
        </div>
      </section>

      <JoinBenefitsSection title="Program benefits" benefits={content.benefits} />
      <JoinStepsSection title="How it works" steps={content.steps} />

      <section>
        <Heading level={2}>Supported promotion methods</Heading>
        <ul className="join-steps">
          {PROMOTION.map((item) => (
            <li key={item}>
              <Text tone="secondary">{item}</Text>
            </li>
          ))}
        </ul>
      </section>

      <JoinFaqSection faq={content.faq} />

      <section>
        <Link href="/apply?type=AFFILIATE">
          <Button>Start affiliate application</Button>
        </Link>
      </section>
    </div>
  );
}
