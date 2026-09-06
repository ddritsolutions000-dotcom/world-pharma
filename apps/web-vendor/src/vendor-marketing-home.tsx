import Link from 'next/link';
import { Heading, Text } from '@world-pharma/ui-kit/web';
import type { VendorCmsCopy } from './vendor-cms';
import { VendorCtaLink } from './vendor-cta-link';
import { VENDOR_JOIN_ROUTES } from './vendor-join-routes';
import {
  IconPackage,
  IconShield,
  IconSpark,
  IconStore,
  IconTrending,
  IconWallet,
} from './vendor-marketing-icons';
import { customerMarketplaceUrl } from './vendor-portal-url';

const SELLER_BENEFITS = [
  {
    icon: IconStore,
    title: 'One seller workspace',
    body: 'Catalog, pricing, inventory, orders, shipments, and settlement lines — scoped to your vendor organization only.',
  },
  {
    icon: IconTrending,
    title: 'Connected to customer demand',
    body: 'Published offers appear on the customer marketplace when country policy and marketplace eligibility allow.',
  },
  {
    icon: IconPackage,
    title: 'Operational tooling included',
    body: 'Pick → pack → ready workflows, warehouse locations, GRN, and support tickets use the same commerce kernel.',
  },
  {
    icon: IconWallet,
    title: 'Transparent economics',
    body: 'Order detail shows customer totals and estimated vendor payable. Live payout remains policy-gated in sandbox.',
  },
] as const;

const ONBOARDING_STEPS = [
  {
    title: 'Apply as vendor seller',
    body: 'Choose your country and submit a marketplace vendor application on this site.',
  },
  {
    title: 'Verify with email OTP',
    body: 'Sign in with the same identity you used during apply — no second account after approval.',
  },
  {
    title: 'Submit KYC documents',
    body: 'Upload pack-required documents through the secure application flow only.',
  },
  {
    title: 'Start selling',
    body: 'After company review, open this vendor site to manage catalog, stock, and fulfilment.',
  },
] as const;

const FAQ = [
  {
    q: 'Is this site for pharmacies or doctors?',
    a: 'No. This is the marketplace vendor seller portal only. Pharmacy, lab, and doctor operators use separate company portals.',
  },
  {
    q: 'Where do I apply?',
    a: 'Use Apply on this vendor site. All onboarding for marketplace sellers happens here — not on a separate partner portal.',
  },
  {
    q: 'Do I need a second account after approval?',
    a: 'No. Sign in here with the same email you used during apply. Organization membership grants access to the seller workspace.',
  },
  {
    q: 'Can I change marketplace copy myself?',
    a: 'Public partner marketing pages are edited in Main Admin CMS. Your product listings and prices are managed in the seller workspace after approval.',
  },
] as const;

const WORKSPACE_FEATURES = [
  'Marketplace eligibility & attestation',
  'Catalog items, variants & offers',
  'Commercial rules & price updates',
  'Warehouse inventory & transfers',
  'Order pick / pack / ready',
  'Shipment tracking',
  'Settlement lines (sandbox)',
  'Support & notifications',
] as const;

const TRUST_PILLS = ['OTP sign-in', 'KYC gated onboarding', 'Country policy packs', 'Sandbox settlements'] as const;

type Props = {
  cms?: VendorCmsCopy | null;
};

export function VendorMarketingHome({ cms }: Props) {
  const title = cms?.title?.trim() || 'Sell on World Pharma';
  const summary =
    cms?.summary?.trim() ||
    'List medicines and health products, fulfil customer orders, and grow with licensed marketplace operations in your country.';

  return (
    <div className="vendor-marketing">
      <section className="vendor-hero">
        <div className="vendor-hero-copy">
          <p className="vendor-marketing-kicker">
            <IconSpark width={16} height={16} />
            Marketplace vendor program
          </p>
          <Heading level={1} className="vendor-hero-title">
            {title}
          </Heading>
          <Text tone="secondary" className="vendor-hero-lead">
            {summary}
          </Text>
          <div className="vendor-marketing-hero-actions">
            <VendorCtaLink href={VENDOR_JOIN_ROUTES.apply}>Join as vendor seller</VendorCtaLink>
            <VendorCtaLink href={VENDOR_JOIN_ROUTES.status} variant="secondary">
              Track application
            </VendorCtaLink>
            <VendorCtaLink href="/login" variant="tertiary">
              Sign in to workspace
            </VendorCtaLink>
          </div>
          <ul className="vendor-trust-pills" aria-label="Program highlights">
            {TRUST_PILLS.map((pill) => (
              <li key={pill}>{pill}</li>
            ))}
          </ul>
        </div>

        <div className="vendor-hero-visual" aria-hidden>
          <div className="vendor-mock">
            <div className="vendor-mock-top">
              <span className="vendor-mock-dot" />
              <span className="vendor-mock-dot" />
              <span className="vendor-mock-dot" />
              <span className="vendor-mock-title">Seller workspace</span>
            </div>
            <div className="vendor-mock-kpis">
              <div>
                <small>Queue</small>
                <strong>Sandbox</strong>
              </div>
              <div>
                <small>Offers</small>
                <strong>Org-scoped</strong>
              </div>
              <div>
                <small>Settlements</small>
                <strong>Country pack</strong>
              </div>
            </div>
            <ul className="vendor-mock-rows">
              <li>
                <span>#WP-DEMO</span>
                <span className="vendor-mock-badge vendor-mock-badge--warn">Packing</span>
                <span>Demo</span>
              </li>
              <li>
                <span>#WP-DEMO</span>
                <span className="vendor-mock-badge vendor-mock-badge--ok">Shipped</span>
                <span>Sandbox</span>
              </li>
              <li>
                <span>#WP-DEMO</span>
                <span className="vendor-mock-badge vendor-mock-badge--info">Settlement</span>
                <span>Gated</span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      <section className="vendor-section" id="why-sell">
        <header className="vendor-section-head">
          <p className="vendor-section-eyebrow">Why World Pharma</p>
          <Heading level={2}>Built for serious marketplace sellers</Heading>
          <Text tone="secondary">
            Everything you need to list, fulfil, and reconcile — without mixing data across organizations.
          </Text>
        </header>
        <div className="vendor-feature-grid">
          {SELLER_BENEFITS.map((item) => {
            const Icon = item.icon;
            return (
              <article key={item.title} className="vendor-feature-card">
                <span className="vendor-feature-icon">
                  <Icon width={22} height={22} />
                </span>
                <Heading level={3}>{item.title}</Heading>
                <Text tone="secondary">{item.body}</Text>
              </article>
            );
          })}
        </div>
      </section>

      <section className="vendor-section vendor-section--surface">
        <header className="vendor-section-head">
          <p className="vendor-section-eyebrow">After approval</p>
          <Heading level={2}>What you manage in the workspace</Heading>
        </header>
        <div className="vendor-check-grid">
          {WORKSPACE_FEATURES.map((item) => (
            <div key={item} className="vendor-check-item">
              <span className="vendor-check-mark" aria-hidden>
                ✓
              </span>
              <span>{item}</span>
            </div>
          ))}
        </div>
        <Text tone="secondary" size="caption" className="vendor-section-footnote">
          Open the <Link href="/workspace">seller workspace</Link> after sign-in. Company finance, policy packs, and KYC
          review stay in Main Admin.
        </Text>
      </section>

      <section className="vendor-section" id="how-it-works">
        <header className="vendor-section-head">
          <p className="vendor-section-eyebrow">Onboarding</p>
          <Heading level={2}>How to join</Heading>
          <Text tone="secondary">Four steps from application to your first live listing.</Text>
        </header>
        <ol className="vendor-timeline">
          {ONBOARDING_STEPS.map((step, index) => (
            <li key={step.title} className="vendor-timeline-step">
              <span className="vendor-timeline-num">{index + 1}</span>
              <div>
                <Heading level={3}>{step.title}</Heading>
                <Text tone="secondary">{step.body}</Text>
              </div>
            </li>
          ))}
        </ol>
        <div className="vendor-marketing-hero-actions">
          <VendorCtaLink href={VENDOR_JOIN_ROUTES.apply}>Start vendor application</VendorCtaLink>
          <VendorCtaLink href={VENDOR_JOIN_ROUTES.status} variant="secondary">
            Track application status
          </VendorCtaLink>
        </div>
      </section>

      <section className="vendor-section vendor-section--split">
        <div className="vendor-split-card">
          <span className="vendor-feature-icon vendor-feature-icon--teal">
            <IconShield width={22} height={22} />
          </span>
          <Heading level={2}>Customer marketplace</Heading>
          <Text tone="secondary">
            Approved vendor offers surface on the public customer site when published and eligible. Shoppers discover
            products, add to cart, and checkout through the shared commerce flow.
          </Text>
          <VendorCtaLink href={customerMarketplaceUrl()} external variant="secondary">
            View customer marketplace
          </VendorCtaLink>
        </div>
        <div className="vendor-split-stats">
          <div>
            <strong>1</strong>
            <span>Login after approval</span>
          </div>
          <div>
            <strong>24h</strong>
            <span>Application tracking</span>
          </div>
          <div>
            <strong>IN</strong>
            <span>Country policy driven</span>
          </div>
        </div>
      </section>

      <section className="vendor-section" id="faq">
        <header className="vendor-section-head">
          <p className="vendor-section-eyebrow">FAQ</p>
          <Heading level={2}>Common questions</Heading>
        </header>
        <div className="vendor-faq-list">
          {FAQ.map((item) => (
            <details key={item.q} className="vendor-faq-item">
              <summary>{item.q}</summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="vendor-cta-banner">
        <div className="vendor-cta-banner-inner">
          <Heading level={2}>Ready to join?</Heading>
          <Text tone="secondary">
            Apply on the partner portal, then return here to sign in once your vendor org is active.
          </Text>
          <div className="vendor-marketing-hero-actions">
            <VendorCtaLink href={VENDOR_JOIN_ROUTES.apply}>Join as vendor</VendorCtaLink>
            <VendorCtaLink href="/login" variant="secondary">
              Already approved? Sign in
            </VendorCtaLink>
          </div>
        </div>
      </section>
    </div>
  );
}
