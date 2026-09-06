import Link from 'next/link';
import { Button, Card, Heading, Text } from '@world-pharma/ui-kit/web';
import { DEFAULT_JOIN_DOCTOR, resolveJoinPageContent } from '@world-pharma/shared/join-page-blocks';
import type { JoinCmsCopy } from './join-cms';
import { JoinBenefitsSection, JoinFaqSection, JoinStepsSection } from './join-landing-sections';

const DEFAULT_SUMMARY =
  'Join World-Pharma as an independent doctor or clinic professional. Manage availability, consultations, prescriptions, and patient care workflows through one connected platform — not a separate doctor engine.';

export function DoctorPartnerLanding({ cms }: { cms?: JoinCmsCopy | null }) {
  const content = resolveJoinPageContent(cms, DEFAULT_JOIN_DOCTOR, {
    title: 'Doctor partners',
    summary: DEFAULT_SUMMARY,
  });

  return (
    <div className="wp-stack join-landing">
      <section className="join-hero">
        <Heading level={1}>{content.title}</Heading>
        <Text tone="secondary">{content.summary}</Text>
        {content.heroExtra ? <Text tone="secondary">{content.heroExtra}</Text> : null}
        <Text tone="secondary">
          Sandbox onboarding — credentials are company-reviewed. Live eRx and teleconsult video remain EXTERNAL_GATED
          until production providers are authorized.
        </Text>
        <div className="join-cta-row">
          <Link href="/apply?type=DOCTOR">
            <Button>Join as a doctor</Button>
          </Link>
          <Link href="/status">
            <Button variant="secondary">Track application</Button>
          </Link>
        </div>
      </section>

      <section>
        <Heading level={2}>Operational model</Heading>
        <Card>
          <Text>
            Patients discover and book consultations through the customer website and mobile app. You manage
            appointments, conduct consultations (including sandbox video where enabled), and issue prescriptions through
            existing clinical workflows connected to health records.
          </Text>
          <Text tone="secondary">
            World-Pharma does not provide medical care — licensed professionals operate under country policy configuration.
          </Text>
        </Card>
      </section>

      <JoinBenefitsSection title="Program benefits" benefits={content.benefits} />
      <JoinStepsSection title="Requirements" steps={content.steps} />
      <JoinFaqSection faq={content.faq} />

      <section>
        <Link href="/apply?type=DOCTOR">
          <Button>Start doctor application</Button>
        </Link>
      </section>
    </div>
  );
}
