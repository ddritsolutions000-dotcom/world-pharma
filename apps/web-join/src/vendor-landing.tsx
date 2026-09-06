import Link from 'next/link';
import { Button, Card, Heading, Text } from '@world-pharma/ui-kit/web';
import { DEFAULT_JOIN_HOME, resolveJoinPageContent } from '@world-pharma/shared/join-page-blocks';
import type { JoinCmsCopy } from './join-cms';
import { JoinBenefitsSection, JoinFaqSection, JoinStepsSection } from './join-landing-sections';

const DEFAULT_SUMMARY =
  'Join the global healthcare marketplace. Sell medicines, fulfil orders, and grow with licensed operations in your country.';

export function VendorLanding({ cms }: { cms?: JoinCmsCopy | null }) {
  const content = resolveJoinPageContent(cms, DEFAULT_JOIN_HOME, {
    title: 'Partner with World Pharma',
    summary: DEFAULT_SUMMARY,
  });

  return (
    <div className="wp-stack join-landing">
      <section className="join-hero">
        <p className="join-hero-kicker">Grow with World Pharma</p>
        <Heading level={1}>{content.title}</Heading>
        <Text tone="secondary">{content.summary}</Text>
        {content.heroExtra ? <Text tone="secondary">{content.heroExtra}</Text> : null}
        <Text tone="secondary">
          Sandbox onboarding — company review required. Approval is not instant and does not grant live marketplace go-live
          until activation is complete.
        </Text>
        <div className="join-stats">
          <div className="join-stat">
            <div className="join-stat-value">KYC</div>
            <div className="join-stat-label">Document checklist in apply</div>
          </div>
          <div className="join-stat">
            <div className="join-stat-value">Track</div>
            <div className="join-stat-label">Status page after submit</div>
          </div>
          <div className="join-stat">
            <div className="join-stat-value">1</div>
            <div className="join-stat-label">Same email after approval</div>
          </div>
        </div>
        <div className="join-cta-row">
          <Link href="/apply">
            <Button>Start application</Button>
          </Link>
          <Link href="/status">
            <Button variant="secondary">Track my application</Button>
          </Link>
        </div>
      </section>

      <section>
        <Heading level={2}>Choose your partner type</Heading>
        <div className="join-partner-cards">
          {content.partnerCards.map((item) => (
            <Link key={item.href} href={item.href} className="join-partner-card">
              <span className="join-partner-card-icon" aria-hidden>
                {item.icon}
              </span>
              <Heading level={3}>{item.title}</Heading>
              <Text size="caption" tone="secondary">
                {item.body}
              </Text>
            </Link>
          ))}
        </div>
      </section>

      <JoinBenefitsSection title="How partnership works" benefits={content.benefits} />
      <JoinStepsSection title="Onboarding journey" steps={content.steps} />

      <section>
        <Heading level={2}>Eligibility & requirements</Heading>
        <Card>
          <Text>
            Partner types, required documents, and enabled services are controlled by each country&apos;s published
            policy pack. World-Pharma does not publish universal legal guarantees, commission rates, or
            country-specific licence names on this page.
          </Text>
          <Text tone="secondary">
            During apply you will see the exact document codes and informational field checklist configured for your
            selected country and partner type.
          </Text>
        </Card>
      </section>

      <JoinFaqSection faq={content.faq} />

      <section className="join-hero">
        <Heading level={2}>Ready to apply?</Heading>
        <Link href="/apply">
          <Button>Start application</Button>
        </Link>
      </section>
    </div>
  );
}
