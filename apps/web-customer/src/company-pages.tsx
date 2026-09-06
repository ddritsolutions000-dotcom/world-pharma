'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useCountries, useSession } from '@world-pharma/shell-web';
import { EmptyState, LoadingState, NetworkErrorState, Text } from '@world-pharma/ui-kit/web';
import { CmsPage } from './cms-page';
import { ABOUT_GALLERY } from './page-hero-media';
import { createSupportTicket } from './account-api';
import { apiBaseUrl } from '@world-pharma/shell-core';
import { fetchHelpArticle, type HelpArticleSummary } from './help-api';
import { useSelectedCountry } from './use-selected-country';
import { healthArticleImage } from './health-article-media';
import { MgBtn, MgCard, Page, PageIntro, Section, ServiceHero } from './ui/mg-ui';

const ABOUT_FALLBACK = {
  title: 'About WorldPharma',
  summary: 'Global online pharmacy and healthcare platform — medicines, labs, doctors, and delivery in one place.',
  body: `WorldPharma connects people everywhere with licensed pharmacies, certified diagnostic labs, and verified doctors — from one account on web and mobile.

We help you order genuine medicines with delivery to your country, book lab tests with home or center collection, consult doctors online, and track every order in real time.

## Our mission

Make healthcare accessible, affordable, and transparent for families worldwide — without compromising on safety or regulatory compliance.

## What we offer

- OTC and prescription medicine ordering from licensed pharmacy partners
- Home sample collection for pathology and wellness lab tests
- Online doctor consultations with digital prescriptions where eligible
- Imaging study bookings at partner radiology centers
- Shipment tracking, refunds, and customer support in one inbox

## How we work

WorldPharma is a technology marketplace. Pharmacies, labs, and clinicians remain independently licensed in their jurisdictions. We provide discovery, booking, payments, and logistics orchestration — not medical advice.

## Global by design

Our platform is built for cross-border healthcare commerce — multi-currency checkout, country policy packs, and sandbox demo data for partners onboarding in new markets.`,
};

const PRIVACY_FALLBACK = {
  title: 'Privacy Policy',
  summary: 'How we collect, use, and protect your personal and health information.',
  body: `Last updated: August 2026. This policy describes how WorldPharma handles personal data for customers using our web and mobile apps.

## Information we collect

- Account details: name, email, phone, delivery addresses
- Order and payment metadata (we do not store full card numbers)
- Health records and uploads only when you explicitly consent for clinical services
- Device and usage data to improve security and product experience

## How we use your data

We use your information to fulfil orders, book appointments, deliver lab reports, send transactional notifications, and comply with legal obligations. We do not sell personal data to advertisers.

## Health data

Prescriptions, lab results, and imaging reports are stored in segregated health modules. Access is limited to you, your chosen care providers, and support staff with audited permissions.

## Your rights

You may request access, correction, export, or deletion of personal data via Contact Us or in-app privacy settings, subject to medical record retention laws in your country.

## Contact

Privacy questions: privacy@worldpharma.com`,
};

const TERMS_FALLBACK = {
  title: 'Terms & Conditions',
  summary: 'Rules for using the WorldPharma marketplace and clinical booking services.',
  body: `By using WorldPharma you agree to these terms. If you do not agree, please do not use the platform.

## Eligibility

You must be at least 18 years old (or the age of majority in your country) to create an account and order medicines.

## Marketplace role

WorldPharma connects you with independent licensed sellers and service providers. Product descriptions, prices, and availability are set by partners and may change without notice.

## Prescription medicines

Where required by law, prescription-only medicines must be ordered with a valid Rx. We may reject or cancel orders that fail verification.

## Payments & pricing

Checkout quotes are frozen at payment time. Delivery fees, taxes, and convenience charges are shown before you pay. Refunds follow our Return & Refund Policy.

## Limitation of liability

WorldPharma is not a healthcare provider. Always consult a qualified clinician for medical decisions. We are not liable for partner service failures beyond applicable consumer protection law.`,
};

const RETURNS_FALLBACK = {
  title: 'Return & Refund Policy',
  summary: 'Returns for medicines, lab bookings, and doctor consultations.',
  body: `We want every order to arrive correctly and on time. This policy explains when returns and refunds apply.

## Medicine orders

Returns are accepted for damaged, wrong, or expired products reported within 48 hours of delivery. Opened strips, used devices, and cold-chain items may not be returnable under pharmacy regulations.

## Lab & imaging bookings

Cancel before sample collection or center check-in for a full refund where partner policy allows. No-shows may forfeit the booking fee.

## Doctor consultations

Cancellations more than 2 hours before the slot receive a full refund. Late cancellations or no-shows may be charged per the doctor's policy.

## Refund timing

Approved refunds are processed within 5–7 business days to the original payment method. Open a support ticket with your order or booking ID for fastest resolution.`,
};

const CAREERS_FALLBACK = {
  title: 'Careers at WorldPharma',
  summary: 'Join teams building global digital healthcare infrastructure.',
  body: `We're hiring engineers, operators, pharmacy partnership managers, and customer experience specialists across regions.

## Open focus areas

- Platform engineering (NestJS, React, React Native, Nx monorepo)
- Cross-border logistics and carrier integrations
- Lab network onboarding and phlebotomy operations
- Telemedicine product and clinician experience
- Trust, safety, and regulatory compliance

## How to apply

Email careers@worldpharma.com with your CV, LinkedIn, and the role you're interested in. We review applications on a rolling basis.

## Life at WorldPharma

Remote-friendly teams, async collaboration, and a mission-driven culture focused on making healthcare work for everyone — not just one country.`,
};

export function AboutPage() {
  return (
    <CmsPage slug="about-worldpharma" title="About WorldPharma" fallback={ABOUT_FALLBACK} gallery={ABOUT_GALLERY} />
  );
}

export function PrivacyPolicyPage() {
  return <CmsPage slug="privacy-policy" title="Privacy Policy" fallback={PRIVACY_FALLBACK} />;
}

export function TermsPage() {
  return <CmsPage slug="terms-and-conditions" title="Terms & Conditions" fallback={TERMS_FALLBACK} />;
}

export function ReturnsPolicyPage() {
  return <CmsPage slug="return-policy" title="Return & Refund Policy" fallback={RETURNS_FALLBACK} />;
}

export function CareersPage() {
  return <CmsPage slug="careers-at-worldpharma" title="Careers" fallback={CAREERS_FALLBACK} />;
}

type BlogPost = HelpArticleSummary & { summary?: string; image_url?: string };

const BLOG_FALLBACK: BlogPost[] = [
  {
    id: 'fallback-1',
    slug: 'understanding-diabetes',
    title: 'Understanding diabetes: symptoms, tests, and daily care',
    content_type: 'ARTICLE',
    category_slug: 'diseases',
    published_at: new Date().toISOString(),
  },
  {
    id: 'fallback-2',
    slug: 'heart-health-tips',
    title: 'Heart health: lipids, BP, and when to book a checkup',
    content_type: 'ARTICLE',
    category_slug: 'wellness',
    published_at: new Date().toISOString(),
  },
  {
    id: 'fallback-3',
    slug: 'immune-boosting-foods',
    title: 'Immunity, vitamins, and winter wellness',
    content_type: 'ARTICLE',
    category_slug: 'nutrition',
    published_at: new Date().toISOString(),
  },
];

export function BlogPage() {
  const { country } = useSelectedCountry();
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBaseUrl(typeof process === 'undefined' ? {} : process.env);
      const res = await fetch(
        `${base}/api/v1/public/health-content/articles?country_code=${encodeURIComponent(country)}&limit=20`,
      );
      if (!res.ok) throw new Error('unavailable');
      const body = (await res.json()) as {
        articles?: Array<{
          id: string;
          slug: string;
          title: string;
          summary?: string | null;
          category?: string | null;
          published_at: string;
          image_url?: string;
        }>;
      };
      const rows = body.articles ?? [];
      setPosts(
        rows.length
          ? rows.map((row) => ({
              id: row.id,
              slug: row.slug,
              title: row.title,
              summary: row.summary ?? '',
              content_type: 'ARTICLE',
              category_slug: row.category ?? 'blog',
              published_at: row.published_at,
              image_url: row.image_url,
            }))
          : BLOG_FALLBACK,
      );
    } catch {
      setPosts(BLOG_FALLBACK);
    } finally {
      setLoading(false);
    }
  }, [country]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Page>
      <ServiceHero
        kicker="Wellness guides"
        title="Health Blog"
        subtitle="Evidence-informed tips, guides, and wellness articles from WorldPharma."
      />
      <PageIntro>
        <p>
          Articles are for general wellness education — not a substitute for professional medical advice. Always consult your
          doctor for diagnosis and treatment decisions.
        </p>
      </PageIntro>
      {loading ? <LoadingState label="Loading articles" /> : null}
      {!loading && !posts.length ? (
        <EmptyState title="No posts yet" description="New articles will appear here soon." />
      ) : null}
      {!loading && posts.length > 0 ? (
        <Section title="Latest articles">
          <ul className="mg-article-grid">
            {posts.map((post) => (
              <li key={post.id} className="mg-article-card">
                <Link href={`/blog/${encodeURIComponent(post.slug)}`} className="mg-article-link">
                  <img
                    src={post.image_url ?? healthArticleImage(post.slug, post.category_slug)}
                    alt=""
                    className="mg-article-cover"
                  />
                  <div className="mg-article-link-body">
                    <div className="mg-article-category">{post.category_slug ?? 'Wellness'}</div>
                    <h3 className="mg-article-title">{post.title}</h3>
                    {post.summary ? <p className="mg-article-summary">{post.summary}</p> : null}
                    <div className="mg-article-meta">
                      <span className="mg-article-date">{new Date(post.published_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </Page>
  );
}

export function ContactPage() {
  const searchParams = useSearchParams();
  const intent = searchParams?.get('intent') ?? '';
  const { session, getAccessToken, expire } = useSession();
  const { country } = useSelectedCountry();
  const [cmsTitle, setCmsTitle] = useState('Contact Us');
  const [cmsSubtitle, setCmsSubtitle] = useState('Orders, lab bookings, refunds, and account help — 7 days a week.');
  const [phone, setPhone] = useState('');
  const [callbackMessage, setCallbackMessage] = useState<string | null>(null);
  const [callbackBusy, setCallbackBusy] = useState(false);

  const isCallback = intent === 'callback' || intent === 'care-plan' || intent === 'corporate' || intent === 'pharmacist';
  const callbackTitle =
    intent === 'care-plan'
      ? 'Join Care Plan — request a call'
      : intent === 'corporate'
        ? 'Corporate wellness — request a quote'
        : intent === 'pharmacist'
          ? 'Ask a pharmacist — request a call'
          : 'Order medicines on call';

  async function requestCallback() {
    const trimmed = phone.trim();
    if (!trimmed) {
      setCallbackMessage('Enter your phone number with country code.');
      return;
    }
    const token = getAccessToken();
    if (session.status === 'authenticated' && token) {
      setCallbackBusy(true);
      setCallbackMessage(null);
      const subject =
        intent === 'care-plan'
          ? 'Care Plan callback request'
          : intent === 'corporate'
            ? 'Corporate wellness quote request'
            : intent === 'pharmacist'
              ? 'Pharmacist callback request'
              : 'Medicine order callback';
      const result = await createSupportTicket({
        token,
        onUnauthorized: expire,
        subject,
        body: `Please call me to ${
          intent === 'care-plan'
            ? 'discuss Care Plan membership'
            : intent === 'corporate'
              ? 'discuss corporate wellness programs'
              : intent === 'pharmacist'
                ? 'ask a pharmacist about a medicine'
                : 'place a medicine order'
        }. Phone: ${trimmed}. Country: ${country}.`,
      });
      setCallbackBusy(false);
      if (result.ok) {
        setCallbackMessage('Request received — our team will call you shortly.');
        return;
      }
      setCallbackMessage(result.error ?? 'Could not submit request. Try calling us directly.');
      return;
    }
    setCallbackMessage(`Call us at 1800-212-2323 or save ${trimmed} — sign in to track your callback request.`);
  }

  useEffect(() => {
    void fetchHelpArticle(country, 'contact-worldpharma').then((row) => {
      if (!row) {
        return;
      }
      setCmsTitle(row.title);
      setCmsSubtitle(row.summary || row.body.slice(0, 180));
    });
  }, [country]);

  return (
    <Page>
      <ServiceHero kicker="Customer care" title={cmsTitle} subtitle={cmsSubtitle} compact />
      {isCallback ? (
        <MgCard className="mg-callback-card">
          <h2 className="mg-section-title">{callbackTitle}</h2>
          <p className="mg-text-muted">
            Enter your number and we&apos;ll call you to complete your order or Care Plan signup.
          </p>
          <label className="mg-field">
            <span>Phone (+91)</span>
            <input
              className="mg-input"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+91 98765 43210"
            />
          </label>
          <MgBtn onClick={() => void requestCallback()} disabled={callbackBusy}>
            {callbackBusy ? 'Submitting…' : 'Get a call to order'}
          </MgBtn>
          {callbackMessage ? <Text tone="secondary">{callbackMessage}</Text> : null}
          <p className="mg-text-muted">
            Or dial <strong>1800-212-2323</strong> (sandbox demo line)
          </p>
        </MgCard>
      ) : null}
      <PageIntro>
        <p>
          Our support team typically responds within a few hours during business days. Have your order number or booking ID
          ready for faster assistance.
        </p>
      </PageIntro>
      <div className="mg-contact-grid">
        <MgCard>
          <h3 className="mg-list-title">Customer care</h3>
          <p className="mg-list-meta">Orders, delivery, refunds, prescriptions</p>
          <p>
            <strong>Phone:</strong> +1 (800) 555-0199
          </p>
          <p>
            <strong>Email:</strong> support@worldpharma.com
          </p>
          <p>
            <strong>Hours:</strong> Mon–Sun, 8:00–22:00 (local time)
          </p>
          <div className="mg-toolbar">
            <MgBtn href="/account/support">Open support ticket</MgBtn>
            <MgBtn href="/help" variant="secondary">
              Browse FAQs
            </MgBtn>
          </div>
        </MgCard>
        <MgCard>
          <h3 className="mg-list-title">Partner with us</h3>
          <p className="mg-list-meta">Pharmacies, labs, doctors, delivery fleets</p>
          <p>Join our network and reach customers in countries where we operate. Onboarding includes KYC, catalog setup, and sandbox testing.</p>
          <MgBtn href="/partners" variant="secondary">
            Partnership options
          </MgBtn>
        </MgCard>
        <MgCard>
          <h3 className="mg-list-title">Corporate &amp; bulk orders</h3>
          <p className="mg-list-meta">Workplace wellness and institutional supply</p>
          <p>
            <strong>Email:</strong> corporate@worldpharma.com
          </p>
          <p>Volume pricing and scheduled delivery for clinics, NGOs, and employers.</p>
        </MgCard>
      </div>
      <Section title="Common questions">
        <ul className="mg-order-list">
          <li>
            <MgCard flat>
              <h3 className="mg-list-title">Where is my order?</h3>
              <p className="mg-text-muted">Track without login using order number + postal code.</p>
              <MgBtn href="/track-order" size="sm" variant="secondary">
                Track order
              </MgBtn>
            </MgCard>
          </li>
          <li>
            <MgCard flat>
              <h3 className="mg-list-title">How do I upload a prescription?</h3>
              <p className="mg-text-muted">Go to Upload Rx — we accept PDF, JPEG, and PNG up to 10 MB.</p>
            </MgCard>
          </li>
          <li>
            <MgCard flat>
              <h3 className="mg-list-title">Can I cancel a lab booking?</h3>
              <p className="mg-text-muted">Yes, before sample collection from My bookings in the Lab Tests section.</p>
            </MgCard>
          </li>
        </ul>
      </Section>
    </Page>
  );
}

export function DownloadAppPage() {
  return (
    <Page>
      <ServiceHero
        kicker="Same account on every device"
        title="Download the WorldPharma App"
        subtitle="Medicines, lab tests, doctors, and delivery tracking — optimized for mobile."
      />
      <img
        src="https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?auto=format&fit=crop&w=1400&q=80"
        alt=""
        className="mg-article-hero"
      />
      <MgCard className="mg-download-hero">
        <p>Get faster checkout, push notifications for orders and appointments, refill reminders, and exclusive app-only offers.</p>
        <div className="mg-footer-app-badges">
          <MgBtn href="/login" variant="secondary">
            Android — request beta
          </MgBtn>
          <MgBtn href="/login" variant="secondary">
            iOS — request beta
          </MgBtn>
        </div>
        <p className="mg-list-meta">
          Mobile apps roll out by country. Sign in on web today — the same account works on every device.
        </p>
        <div className="mg-toolbar">
          <MgBtn href="/">Continue on web</MgBtn>
          <MgBtn href="/login" variant="secondary">
            Sign in / Register
          </MgBtn>
        </div>
      </MgCard>
      <Section title="What you get on mobile">
        <ul className="mg-order-list">
          {[
            'Real-time order and shipment tracking with courier updates',
            'Lab and imaging booking reminders plus report notifications',
            'Prescription upload straight from your camera roll',
            'Notification inbox for appointments, delivery, and promos',
            'Biometric sign-in and saved addresses for one-tap checkout',
          ].map((item) => (
            <li key={item}>
              <MgCard flat>
                <p>{item}</p>
              </MgCard>
            </li>
          ))}
        </ul>
      </Section>
    </Page>
  );
}

const JOIN_BASE = process.env.NEXT_PUBLIC_JOIN_PORTAL_URL ?? 'http://localhost:3008';

export function PartnersPage() {
  const { country } = useSelectedCountry();
  const [title, setTitle] = useState('Partner with WorldPharma');
  const [intro, setIntro] = useState(
    'We onboard licensed partners through a guided KYC and sandbox flow. Apply via the join portal — approval is company-reviewed, not instant, and sandbox access is not live marketplace go-live.',
  );

  useEffect(() => {
    void fetchHelpArticle(country, 'partners-worldpharma').then((row) => {
      if (!row) {
        return;
      }
      setTitle(row.title);
      setIntro(row.body || row.summary);
    });
  }, [country]);

  return (
    <Page>
      <section className="mg-service-hero" aria-label="Partners">
        <p className="mg-service-kicker">For pharmacies, labs, doctors &amp; logistics</p>
        <h1 className="mg-service-title">{title}</h1>
        <p className="mg-service-sub">Grow with World-Pharma™ — company-reviewed KYC, then workspace access.</p>
      </section>
      <img
        src="https://images.unsplash.com/photo-1582719471384-894fbb16eacf?auto=format&fit=crop&w=1400&q=80"
        alt=""
        className="mg-article-hero"
      />
      <PageIntro>
        <p>{intro}</p>
      </PageIntro>
      <ul className="mg-order-list">
        {[
          {
            title: 'Marketplace vendor',
            desc: 'List medicines and health products on the marketplace after company review and activation.',
            href: `${JOIN_BASE}/apply?type=VENDOR`,
            external: true,
          },
          {
            title: 'Pharmacy partner',
            desc: 'List medicines, manage inventory, fulfil online orders, and operate the store portal after approval.',
            href: `${JOIN_BASE}/pharmacy`,
            external: true,
          },
          {
            title: 'Diagnostic lab',
            desc: 'Offer pathology panels, home phlebotomy slots, and digital report delivery to patients.',
            href: `${JOIN_BASE}/lab`,
            external: true,
          },
          {
            title: 'Imaging center',
            desc: 'Publish imaging slots and report workflows. Production PACS/DICOM viewers remain EXTERNAL_GATED.',
            href: `${JOIN_BASE}/imaging`,
            external: true,
          },
          {
            title: 'Doctor',
            desc: 'Online consultations and sandbox prescribing workflows. Live eRx/video stay EXTERNAL_GATED until providers are wired.',
            href: `${JOIN_BASE}/doctor`,
            external: true,
          },
          {
            title: 'Delivery partner',
            desc: 'Last-mile medicine delivery with proof-of-delivery workflows. Live carriers remain EXTERNAL_GATED.',
            href: `${JOIN_BASE}/delivery`,
            external: true,
          },
          {
            title: 'Affiliate',
            desc: 'Refer customers with tracked links. Sandbox shows attribution; production payouts need finance rails.',
            href: `${JOIN_BASE}/affiliate`,
            external: true,
          },
          {
            title: 'Corporate wellness',
            desc: 'Employee checkups, pharmacy benefits, and telemedicine programs for HR teams.',
            href: '/corporate',
            external: false,
          },
        ].map((row) => (
          <li key={row.title}>
            <MgCard>
              <h3 className="mg-list-title">{row.title}</h3>
              <p className="mg-list-meta">{row.desc}</p>
              {row.external ? (
                <a href={row.href} className="mg-btn mg-btn--secondary mg-btn--sm" target="_blank" rel="noreferrer">
                  Apply now
                </a>
              ) : (
                <Link href={row.href} className="mg-btn mg-btn--secondary mg-btn--sm">
                  View programs
                </Link>
              )}
            </MgCard>
          </li>
        ))}
      </ul>
    </Page>
  );
}
