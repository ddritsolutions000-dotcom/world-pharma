import Link from 'next/link';
import { Button, Heading, Text } from '@world-pharma/ui-kit/web';
import { DEFAULT_JOIN_IMAGING, resolveJoinPageContent } from '@world-pharma/shared/join-page-blocks';
import type { JoinCmsCopy } from './join-cms';
import { JoinBenefitsSection, JoinFaqSection, JoinStepsSection } from './join-landing-sections';

const DEFAULT_SUMMARY =
  'Join World-Pharma as an imaging center operator. Manage study catalog, bookings, check-in, acquisition, radiologist handoff, and report delivery through one connected platform.';

export function ImagingPartnerLanding({ cms }: { cms?: JoinCmsCopy | null }) {
  const portalUrl = process.env.NEXT_PUBLIC_RADIOLOGY_PORTAL_URL ?? 'http://localhost:3006';
  const content = resolveJoinPageContent(cms, DEFAULT_JOIN_IMAGING, {
    title: 'Imaging center partners',
    summary: DEFAULT_SUMMARY,
  });

  return (
    <div className="wp-stack join-landing">
      <section className="join-hero">
        <Heading level={1}>{content.title}</Heading>
        <Text tone="secondary">{content.summary}</Text>
        {content.heroExtra ? <Text tone="secondary">{content.heroExtra}</Text> : null}
        <Text tone="secondary">
          Sandbox onboarding — licence and commercial approval are company-reviewed. Production PACS/DICOM viewers remain
          EXTERNAL_GATED.
        </Text>
        <div className="join-cta-row">
          <Link href="/apply?type=IMAGING_CENTER">
            <Button>Join as imaging center</Button>
          </Link>
          <Link href="/status">
            <Button variant="secondary">Track application</Button>
          </Link>
          <a href={portalUrl}>
            <Button variant="tertiary">Imaging portal login</Button>
          </a>
        </div>
      </section>

      <JoinBenefitsSection title="Why partner as imaging" benefits={content.benefits} />
      <JoinStepsSection title="How onboarding works" steps={content.steps} />
      <JoinFaqSection faq={content.faq} />

      <section>
        <Link href="/apply?type=IMAGING_CENTER">
          <Button>Start imaging application</Button>
        </Link>
      </section>
    </div>
  );
}
