import Link from 'next/link';
import { Heading, Text } from '@world-pharma/ui-kit/web';
import { VendorCtaLink } from './vendor-cta-link';
import { IconShield, IconSpark } from './vendor-marketing-icons';
import { VENDOR_JOIN_ROUTES } from './vendor-join-routes';

const REQUIREMENTS = [
  'Valid business email for OTP sign-in (same identity after approval).',
  'Country selected on apply — document checklist comes from published policy pack.',
  'Marketplace vendor seller type only — this site does not onboard pharmacies, labs, or doctors.',
  'KYC documents uploaded through the secure application flow — never by email.',
  'Company review before catalog write and order fulfilment unlock.',
] as const;

const STEPS = [
  {
    title: 'Submit vendor application',
    body: 'Business details and pack-required documents for marketplace sellers.',
  },
  {
    title: 'Company review',
    body: 'Operations reviews KYC and activates your vendor organization.',
  },
  {
    title: 'Marketplace attestation',
    body: 'Complete attestation in the seller workspace if your country pack requires it.',
  },
  {
    title: 'Go live',
    body: 'Create catalog offers, receive stock, and fulfil customer orders from this vendor site.',
  },
] as const;

export function VendorJoinPage() {
  return (
    <div className="vendor-marketing">
      <section className="vendor-hero vendor-hero--compact">
        <div className="vendor-hero-copy">
          <p className="vendor-marketing-kicker">
            <IconSpark width={16} height={16} />
            Vendor seller program
          </p>
          <Heading level={1} className="vendor-hero-title">
            Join as a marketplace vendor
          </Heading>
          <Text tone="secondary" className="vendor-hero-lead">
            This site is only for marketplace vendor sellers. Apply and track your onboarding here — after approval,
            manage catalog and orders from the seller workspace.
          </Text>
          <div className="vendor-marketing-hero-actions">
            <VendorCtaLink href={VENDOR_JOIN_ROUTES.apply}>Start vendor application</VendorCtaLink>
            <VendorCtaLink href={VENDOR_JOIN_ROUTES.status} variant="secondary">
              Track application
            </VendorCtaLink>
            <VendorCtaLink href="/login" variant="tertiary">
              Already approved? Sign in
            </VendorCtaLink>
          </div>
        </div>
        <div className="vendor-join-highlight">
          <span className="vendor-feature-icon vendor-feature-icon--teal">
            <IconShield width={22} height={22} />
          </span>
          <Heading level={3}>Vendor-only onboarding</Heading>
          <Text tone="secondary" size="caption">
            Doctors, pharmacies, labs, and affiliates use their own portals — not this vendor site.
          </Text>
        </div>
      </section>

      <section className="vendor-section">
        <header className="vendor-section-head">
          <p className="vendor-section-eyebrow">Timeline</p>
          <Heading level={2}>What happens after you apply</Heading>
        </header>
        <ol className="vendor-timeline">
          {STEPS.map((step, index) => (
            <li key={step.title} className="vendor-timeline-step">
              <span className="vendor-timeline-num">{index + 1}</span>
              <div>
                <Heading level={3}>{step.title}</Heading>
                <Text tone="secondary">{step.body}</Text>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="vendor-section vendor-section--surface">
        <header className="vendor-section-head">
          <p className="vendor-section-eyebrow">Checklist</p>
          <Heading level={2}>Requirements</Heading>
        </header>
        <div className="vendor-check-grid">
          {REQUIREMENTS.map((item) => (
            <div key={item} className="vendor-check-item">
              <span className="vendor-check-mark" aria-hidden>
                ✓
              </span>
              <span>{item}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
